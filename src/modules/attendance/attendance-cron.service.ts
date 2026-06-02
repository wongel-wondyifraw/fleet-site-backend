import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';

import { UserRole } from '../../common/enums';
import { AttendanceRulesService } from '../attendance-rules/attendance-rules.service';
import {
  NotificationKind,
  NotificationSeverity,
} from '../notifications/notification.entity';
import {
  NOTIFICATION_EVENT,
  NotificationDomainEvent,
} from '../notifications/notification-events';
import { TimeSettingsService } from '../time-settings/time-settings.service';
import { AttendanceService } from './attendance.service';

// Fires a one-shot notification per driver per day once the dayInTime grace
// passes without a DAY_IN punch. The notification's dedupeKey embeds the
// driver + date so re-running the cron later in the same day never duplicates
// the alert.
//
// We piggyback on the already-running ScheduleModule (initialised by the
// site-health module). Cron interval is intentionally coarse (every 15 min)
// so a backfilled DAY_IN within the same window still suppresses the
// notification for that driver.
@Injectable()
export class AttendanceCronService {
  private readonly logger = new Logger(AttendanceCronService.name);
  private running = false;

  constructor(
    private readonly attendance: AttendanceService,
    private readonly attendanceRules: AttendanceRulesService,
    private readonly timeSettings: TimeSettingsService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkMissedDayIn(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { timezone } = await this.timeSettings.getSettings();
      const rules = await this.attendanceRules.getRules();

      const now = new Date();
      const today = this.todayKeyInTimezone(now, timezone);
      const hhmmNow = this.hhmmInTimezone(now, timezone);

      // Wait until we're past the dayInTime + 60-minute grace before
      // declaring anyone missing. The 60-minute grace is intentionally
      // wider than the 15-minute "late" threshold so latecomers don't
      // also trigger a "missed" notification.
      const cutoff = this.addMinutes(rules.dayInTime, 60);
      if (hhmmNow < cutoff) return;

      const missing = await this.attendance.findDriversMissingDayIn(today);
      if (missing.length === 0) return;

      for (const { driver, day, siteName } of missing) {
        const event: NotificationDomainEvent = {
          eventName: 'attendance.missed_check_in',
          kind: NotificationKind.ATTENDANCE,
          severity: NotificationSeverity.WARNING,
          title: 'Driver missed check-in',
          message: `${driver.firstName} ${driver.lastName} has not checked in by ${cutoff}.`,
          href: '/attendance',
          siteName,
          targetRoles: [UserRole.TIME_KEEPER, UserRole.SITE_MANAGER],
          dedupeKey: `attendance.missed_check_in:${driver.id}:${today}`,
          payload: {
            driverId: driver.id,
            siteId: day?.siteId ?? null,
            date: today,
            rule: rules.dayInTime,
          },
        };
        this.events.emit(NOTIFICATION_EVENT, event);
      }
      this.logger.log(
        `Missed check-in: ${missing.length} driver(s) flagged for ${today}.`,
      );
    } catch (err) {
      this.logger.warn(
        `Missed check-in cron failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }

  private todayKeyInTimezone(date: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private hhmmInTimezone(date: Date, tz: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private addMinutes(hhmm: string, minutes: number): string {
    const [h, m] = hhmm.split(':').map(Number);
    const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
    const nh = Math.floor(total / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }
}
