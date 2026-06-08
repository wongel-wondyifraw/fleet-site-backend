import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import { SiteScopeService } from '../../common/site-scope/site-scope.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceRulesService } from '../attendance-rules/attendance-rules.service';
import { FuelConsumptionService } from '../fuel/fuel-consumption.service';
import { TimeSettingsService } from '../time-settings/time-settings.service';
import { TripTargetService } from '../trip-targets/trip-target.service';
import { NotificationKind, NotificationSeverity } from '../notifications/notification.entity';
import {
  NOTIFICATION_EVENT,
  NotificationDomainEvent,
} from '../notifications/notification-events';
import { Site } from '../sites/site.entity';
import { Trip } from '../trips/trip.entity';
import { User } from '../users/user.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { scoreSnapshot } from './score-snapshot';
import { SiteHealthSnapshot } from './site-health-snapshot.entity';
import type { SiteHealthRawInput } from './site-health.types';
import { SiteScoringService } from './site-scoring.service';

const EFFECTIVE_DATE_SQL = `to_char((timezone(:tz, COALESCE(trip.completedAt, trip.startedAt, trip.scheduledAt, trip.createdAt))), 'YYYY-MM-DD')`;

@Injectable()
export class SiteHealthService {
  constructor(
    @InjectRepository(SiteHealthSnapshot)
    private readonly snapshots: Repository<SiteHealthSnapshot>,
    @InjectRepository(Vehicle)
    private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Trip)
    private readonly trips: Repository<Trip>,
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
    private readonly attendance: AttendanceService,
    private readonly attendanceRules: AttendanceRulesService,
    private readonly fuelConsumption: FuelConsumptionService,
    private readonly tripTargets: TripTargetService,
    private readonly timeSettings: TimeSettingsService,
    private readonly scoring: SiteScoringService,
    private readonly events: EventEmitter2,
    private readonly siteScope: SiteScopeService,
  ) {}

  async getTodayKey(): Promise<string> {
    const { timezone } = await this.timeSettings.getSettings();
    return this.todayKeyInTimezone(timezone);
  }

  private todayKeyInTimezone(tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private async loadRawForSite(
    siteId: string,
    date: string,
    todayKey: string,
    tz: string,
  ): Promise<SiteHealthRawInput> {
    const [attendanceDays, vehicleRows, tripRows, fuelRoster, target] =
      await Promise.all([
        this.attendance.getRosterInternal({ date, siteId }),
        this.vehicles.find({ where: { siteId } }),
        this.trips
          .createQueryBuilder('trip')
          .leftJoinAndSelect('trip.vehicle', 'vehicle')
          .where(`${EFFECTIVE_DATE_SQL} = :date`, { tz, date })
          .andWhere('vehicle.siteId = :siteId', { siteId })
          .getMany(),
        this.fuelConsumption.getRosterInternal({ date, siteId }),
        this.tripTargets.getEffective(date),
      ]);

    return {
      siteId,
      date,
      todayKey,
      attendanceDays: attendanceDays.map((day) => ({
        status: day.status,
        expected: day.expected,
        punches: (day.punches ?? []).map((p) => ({
          type: p.type,
          at: p.at instanceof Date ? p.at.toISOString() : String(p.at),
          isVoided: p.isVoided,
        })),
      })),
      vehicles: vehicleRows.map((v) => ({
        status: v.status,
        siteId: v.siteId ?? null,
      })),
      trips: tripRows.map((t) => ({
        status: t.status,
        distanceKm: t.distanceKm ?? null,
        vehicleSiteId: t.vehicle?.siteId ?? null,
      })),
      fuelRows: fuelRoster.map((row) => ({
        estimatedLiters: row.estimatedLiters ?? null,
        workDistanceKm: row.workDistanceKm ?? null,
        ratedKmPerLitre: row.ratedKmPerLitre ?? null,
      })),
      tripTargetCount: target.count,
    };
  }

  async computeForSite(siteId: string, date: string): Promise<SiteHealthSnapshot> {
    const { timezone } = await this.timeSettings.getSettings();
    const todayKey = this.todayKeyInTimezone(timezone);
    const [raw, config, rules] = await Promise.all([
      this.loadRawForSite(siteId, date, todayKey, timezone),
      this.scoring.getConfig(),
      this.attendanceRules.getRules(),
    ]);

    const scored = scoreSnapshot(raw, config, rules);
    const computedAt = new Date();

    const entity = this.snapshots.create({
      siteId,
      date,
      score: scored.score,
      status: scored.status,
      dimensions: scored.dimensions,
      trucks: scored.trucks,
      trips: scored.trips,
      fuel: scored.fuel,
      insufficientData: scored.insufficientData,
      computedAt,
    });

    const saved = await this.snapshots.save(entity);
    if (saved.status === 'CRITICAL') {
      // save() doesn't hydrate the `site` relation, so resolve the name
      // explicitly to avoid falling back to the raw site UUID in the message.
      const site = await this.sites.findOne({
        where: { id: saved.siteId },
        select: ['id', 'name'],
      });
      const siteName = site?.name ?? saved.siteId;
      const event: NotificationDomainEvent = {
        eventName: 'site_health.score_dropped',
        kind: NotificationKind.SITE_HEALTH,
        severity: NotificationSeverity.DANGER,
        title: 'Site health critical',
        message: `Site ${siteName} dropped to CRITICAL on ${saved.date}.`,
        href: '/sites',
        siteName: site?.name ?? null,
        siteId: saved.siteId,
        targetRoles: ['SITE_MANAGER'],
        dedupeKey: `site_health.critical:${saved.siteId}:${saved.date}`,
        payload: {
          siteId: saved.siteId,
          date: saved.date,
          score: saved.score,
          status: saved.status,
        },
      };
      this.events.emit(NOTIFICATION_EVENT, event);
    }
    return saved;
  }

  async findSnapshot(
    siteId: string,
    date: string,
  ): Promise<SiteHealthSnapshot | null> {
    return this.snapshots.findOne({ where: { siteId, date } });
  }

  async listSnapshots(
    siteIds: string[],
    date: string,
    options: { recomputeToday?: boolean } = {},
  ): Promise<SiteHealthSnapshot[]> {
    if (siteIds.length === 0) return [];

    const { timezone } = await this.timeSettings.getSettings();
    const todayKey = this.todayKeyInTimezone(timezone);
    const isToday = date === todayKey;

    const existing = await this.snapshots.find({
      where: { siteId: In(siteIds), date },
    });
    const bySite = new Map(existing.map((s) => [s.siteId, s]));

    const results: SiteHealthSnapshot[] = [];
    for (const siteId of siteIds) {
      let row = bySite.get(siteId);
      if (isToday && options.recomputeToday !== false) {
        row = await this.computeForSite(siteId, date);
      }
      if (row) results.push(row);
    }
    return results;
  }

  async listHistory(
    siteId: string,
    from: string,
    to: string,
  ): Promise<SiteHealthSnapshot[]> {
    return this.snapshots.find({
      where: { siteId, date: Between(from, to) },
      order: { date: 'ASC' },
    });
  }

  /** Single query for dashboard sparklines across many sites. */
  async listHistoryForSites(
    siteIds: string[],
    from: string,
    to: string,
  ): Promise<SiteHealthSnapshot[]> {
    if (siteIds.length === 0) return [];
    return this.snapshots.find({
      where: { siteId: In(siteIds), date: Between(from, to) },
      order: { siteId: 'ASC', date: 'ASC' },
    });
  }

  assertSiteAccess(user: User, siteIds: string[]): string[] {
    return this.siteScope.assertAccess(user, siteIds);
  }

  resolveSiteIdsForUser(user: User, requested?: string[]): string[] {
    const resolved = this.siteScope.resolveFilterSiteIds(user, requested);
    if (resolved === null) return requested ?? [];
    return resolved;
  }

  toApiDto(snapshot: SiteHealthSnapshot) {
    return {
      siteId: snapshot.siteId,
      date: snapshot.date,
      score: snapshot.score ?? null,
      status: snapshot.status ?? null,
      insufficientData: snapshot.insufficientData,
      dimensions: snapshot.dimensions,
      trucks: snapshot.trucks,
      trips: snapshot.trips,
      fuel: snapshot.fuel,
      computedAt: snapshot.computedAt.toISOString(),
    };
  }
}
