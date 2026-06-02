import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { TripStatus } from '../../common/enums';
import { AttendancePunch } from '../attendance/attendance-punch.entity';
import { AttendancePunchType } from '../../common/enums';
import { FuelLog } from '../fuel/fuel-log.entity';
import { Site } from '../sites/site.entity';
import { Trip } from '../trips/trip.entity';
import { User } from '../users/user.entity';
import { NotificationAudienceService } from './notification-audience.service';
import { NotificationsService } from './notifications.service';
import {
  NotificationKind,
  NotificationSeverity,
} from './notification.entity';

export const DIGEST_PERMISSION_SLUG = 'reports.digest.receive';
const DIGEST_WINDOW_HOURS = 6;

interface SiteSummary {
  siteId: string;
  siteName: string;
  tripsCompleted: number;
  tripsStarted: number;
  fuelLiters: number;
  fuelCost: number;
  checkIns: number;
  checkOuts: number;
}

interface DigestSnapshot {
  windowStart: Date;
  windowEnd: Date;
  totals: {
    tripsCompleted: number;
    tripsStarted: number;
    fuelLiters: number;
    fuelCost: number;
    checkIns: number;
    checkOuts: number;
    activeSites: number;
  };
  perSite: SiteSummary[];
}

@Injectable()
export class ReportsDigestService {
  private readonly logger = new Logger(ReportsDigestService.name);
  private running = false;

  constructor(
    @InjectRepository(Trip)
    private readonly trips: Repository<Trip>,
    @InjectRepository(FuelLog)
    private readonly fuelLogs: Repository<FuelLog>,
    @InjectRepository(AttendancePunch)
    private readonly punches: Repository<AttendancePunch>,
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
    private readonly audience: NotificationAudienceService,
    private readonly notifications: NotificationsService,
  ) {}

  // Every 6 hours on the hour: 00:00, 06:00, 12:00, 18:00 (server time).
  @Cron('0 */6 * * *')
  async runScheduled(): Promise<void> {
    await this.run().catch((err) => {
      this.logger.warn(
        `Reports digest cron failed: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  /** Public entry point so a controller can trigger a digest run on demand. */
  async run(): Promise<{ recipients: number; snapshot: DigestSnapshot }> {
    if (this.running) {
      this.logger.warn('Reports digest skipped — previous run still active.');
      return { recipients: 0, snapshot: this.emptySnapshot() };
    }
    this.running = true;
    try {
      const recipients = await this.audience.resolveByPermission(
        DIGEST_PERMISSION_SLUG,
      );
      if (recipients.length === 0) {
        this.logger.log(
          'No users with reports.digest.receive permission — skipping send.',
        );
        return { recipients: 0, snapshot: this.emptySnapshot() };
      }

      const snapshot = await this.buildSnapshot();
      await this.sendDigest(recipients, snapshot);
      this.logger.log(
        `Reports digest sent to ${recipients.length} recipient(s) for window ` +
          `${snapshot.windowStart.toISOString()} → ${snapshot.windowEnd.toISOString()}`,
      );
      return { recipients: recipients.length, snapshot };
    } finally {
      this.running = false;
    }
  }

  private async buildSnapshot(): Promise<DigestSnapshot> {
    const windowEnd = new Date();
    const windowStart = new Date(
      windowEnd.getTime() - DIGEST_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const allSites = await this.sites.find();
    const siteNameById = new Map(allSites.map((s) => [s.id, s.name]));

    const completedTrips = await this.trips.find({
      where: { completedAt: Between(windowStart, windowEnd) },
      relations: { vehicle: true },
    });
    const startedTrips = await this.trips.find({
      where: { startedAt: Between(windowStart, windowEnd) },
      relations: { vehicle: true },
    });

    const fuelLogs = await this.fuelLogs.find({
      where: { fillDate: Between(windowStart, windowEnd) },
      relations: { vehicle: true },
    });

    const punches = await this.punches
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.day', 'day')
      .where('p.at BETWEEN :start AND :end', {
        start: windowStart,
        end: windowEnd,
      })
      .andWhere('p.isVoided = false')
      .getMany();

    const perSiteMap = new Map<string, SiteSummary>();
    const upsertSite = (siteId: string | null | undefined): SiteSummary => {
      const id = siteId ?? 'unassigned';
      const name = (siteId && siteNameById.get(siteId)) || 'Unassigned';
      let entry = perSiteMap.get(id);
      if (!entry) {
        entry = {
          siteId: id,
          siteName: name,
          tripsCompleted: 0,
          tripsStarted: 0,
          fuelLiters: 0,
          fuelCost: 0,
          checkIns: 0,
          checkOuts: 0,
        };
        perSiteMap.set(id, entry);
      }
      return entry;
    };

    for (const trip of completedTrips) {
      const siteId = trip.vehicle?.assignedSite ?? null;
      upsertSite(siteId).tripsCompleted += 1;
    }
    for (const trip of startedTrips) {
      if (trip.status === TripStatus.CANCELLED) continue;
      const siteId = trip.vehicle?.assignedSite ?? null;
      upsertSite(siteId).tripsStarted += 1;
    }
    for (const log of fuelLogs) {
      const siteId = log.vehicle?.assignedSite ?? null;
      const entry = upsertSite(siteId);
      entry.fuelLiters += Number(log.liters) || 0;
      entry.fuelCost += Number(log.cost) || 0;
    }
    for (const punch of punches) {
      const siteId = punch.day?.siteId ?? null;
      const entry = upsertSite(siteId);
      if (punch.type === AttendancePunchType.DAY_IN) entry.checkIns += 1;
      else if (punch.type === AttendancePunchType.DAY_OUT) entry.checkOuts += 1;
    }

    const perSite = [...perSiteMap.values()].sort((a, b) =>
      a.siteName.localeCompare(b.siteName),
    );

    const totals = perSite.reduce(
      (acc, row) => ({
        tripsCompleted: acc.tripsCompleted + row.tripsCompleted,
        tripsStarted: acc.tripsStarted + row.tripsStarted,
        fuelLiters: acc.fuelLiters + row.fuelLiters,
        fuelCost: acc.fuelCost + row.fuelCost,
        checkIns: acc.checkIns + row.checkIns,
        checkOuts: acc.checkOuts + row.checkOuts,
        activeSites: acc.activeSites,
      }),
      {
        tripsCompleted: 0,
        tripsStarted: 0,
        fuelLiters: 0,
        fuelCost: 0,
        checkIns: 0,
        checkOuts: 0,
        activeSites: perSite.filter((s) => this.isSiteActive(s)).length,
      },
    );

    return { windowStart, windowEnd, totals, perSite };
  }

  private isSiteActive(row: SiteSummary): boolean {
    return (
      row.tripsCompleted +
        row.tripsStarted +
        row.checkIns +
        row.checkOuts +
        row.fuelLiters >
      0
    );
  }

  private async sendDigest(
    recipients: User[],
    snapshot: DigestSnapshot,
  ): Promise<void> {
    const title = this.buildTitle(snapshot);
    const message = this.buildMessage(snapshot);
    const windowKey = snapshot.windowEnd.toISOString().slice(0, 13);

    await Promise.all(
      recipients.map(async (user) => {
        try {
          await this.notifications.create({
            userId: user.id,
            kind: NotificationKind.SYSTEM,
            severity: NotificationSeverity.INFO,
            title,
            message,
            href: '/dashboard',
            dedupeKey: `reports.digest:${windowKey}`,
            payload: {
              kindHint: 'reports.digest',
              windowStart: snapshot.windowStart.toISOString(),
              windowEnd: snapshot.windowEnd.toISOString(),
              totals: snapshot.totals,
              perSite: snapshot.perSite,
            },
          });
        } catch (err) {
          this.logger.warn(
            `Could not deliver digest to user=${user.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }),
    );
  }

  private buildTitle(snapshot: DigestSnapshot): string {
    const t = snapshot.totals;
    return `Fleet activity — last ${DIGEST_WINDOW_HOURS}h (${t.tripsCompleted} trips, ${t.checkIns} check-ins)`;
  }

  private buildMessage(snapshot: DigestSnapshot): string {
    const t = snapshot.totals;
    const head =
      `${snapshot.perSite.length} site(s), ${t.activeSites} active in the last ${DIGEST_WINDOW_HOURS}h. ` +
      `Trips completed: ${t.tripsCompleted}. Trips started: ${t.tripsStarted}. ` +
      `Check-ins: ${t.checkIns}, check-outs: ${t.checkOuts}. ` +
      `Fuel: ${this.fmtNumber(t.fuelLiters)} L${
        t.fuelCost > 0 ? ` (${this.fmtNumber(t.fuelCost)})` : ''
      }.`;

    const top = snapshot.perSite
      .filter((s) => this.isSiteActive(s))
      .slice(0, 5)
      .map(
        (s) =>
          `• ${s.siteName}: ${s.tripsCompleted}/${s.tripsStarted} trips, ` +
          `${s.checkIns}/${s.checkOuts} in/out, ${this.fmtNumber(s.fuelLiters)} L`,
      )
      .join('\n');

    return top ? `${head}\n\n${top}` : head;
  }

  private fmtNumber(value: number): string {
    return Number.isFinite(value)
      ? Number(value.toFixed(1)).toLocaleString()
      : '0';
  }

  private emptySnapshot(): DigestSnapshot {
    const now = new Date();
    return {
      windowStart: new Date(
        now.getTime() - DIGEST_WINDOW_HOURS * 60 * 60 * 1000,
      ),
      windowEnd: now,
      totals: {
        tripsCompleted: 0,
        tripsStarted: 0,
        fuelLiters: 0,
        fuelCost: 0,
        checkIns: 0,
        checkOuts: 0,
        activeSites: 0,
      },
      perSite: [],
    };
  }
}
