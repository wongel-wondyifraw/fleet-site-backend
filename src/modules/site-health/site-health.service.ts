import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import { UserRole } from '../../common/enums';
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
    private readonly attendance: AttendanceService,
    private readonly attendanceRules: AttendanceRulesService,
    private readonly fuelConsumption: FuelConsumptionService,
    private readonly tripTargets: TripTargetService,
    private readonly timeSettings: TimeSettingsService,
    private readonly scoring: SiteScoringService,
    private readonly events: EventEmitter2,
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
        this.attendance.getRoster({ date, siteId }),
        this.vehicles.find({ where: { assignedSite: siteId } }),
        this.trips
          .createQueryBuilder('trip')
          .leftJoinAndSelect('trip.vehicle', 'vehicle')
          .where(`${EFFECTIVE_DATE_SQL} = :date`, { tz, date })
          .getMany(),
        this.fuelConsumption.getRoster({ date, siteId }),
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
        assignedSite: v.assignedSite ?? null,
      })),
      trips: tripRows.map((t) => ({
        status: t.status,
        distanceKm: t.distanceKm ?? null,
        vehicleAssignedSite: t.vehicle?.assignedSite ?? null,
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
      const event: NotificationDomainEvent = {
        eventName: 'site_health.score_dropped',
        kind: NotificationKind.SITE_HEALTH,
        severity: NotificationSeverity.DANGER,
        title: 'Site health critical',
        message: `Site ${saved.site?.name ?? saved.siteId} dropped to CRITICAL on ${saved.date}.`,
        href: '/sites',
        siteName: saved.site?.name ?? null,
        targetRoles: [UserRole.SITE_MANAGER],
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

  assertSiteAccess(user: User, siteIds: string[]): string[] {
    if (user.role === UserRole.ADMIN) return siteIds;
    const allowed = new Set((user.sites ?? []).map((s) => s.id));
    const filtered = siteIds.filter((id) => allowed.has(id));
    if (filtered.length !== siteIds.length) {
      throw new ForbiddenException('You do not have access to one or more sites.');
    }
    return filtered;
  }

  resolveSiteIdsForUser(
    user: User,
    requested?: string[],
  ): string[] {
    if (user.role === UserRole.ADMIN) {
      return requested ?? [];
    }
    const allowed = (user.sites ?? []).map((s) => s.id);
    if (!requested || requested.length === 0) return allowed;
    return this.assertSiteAccess(user, requested);
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
