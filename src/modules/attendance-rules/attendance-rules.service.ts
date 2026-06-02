import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserRole } from '../../common/enums';
import {
  NotificationKind,
  NotificationSeverity,
} from '../notifications/notification.entity';
import {
  NOTIFICATION_EVENT,
  NotificationDomainEvent,
} from '../notifications/notification-events';
import { AppSetting } from '../trip-targets/app-setting.entity';
import { AttendanceRulesDto } from './attendance-rules.dto';

export interface AttendanceRules {
  dayInTime: string;
  lunchOutTime: string;
  lunchInTime: string;
  dayOutTime: string;
  targetHours: number;
}

const KEYS = {
  dayInTime: 'attendance.dayInTime',
  lunchOutTime: 'attendance.lunchOutTime',
  lunchInTime: 'attendance.lunchInTime',
  dayOutTime: 'attendance.dayOutTime',
  targetHours: 'attendance.targetHours',
} as const;

const DEFAULTS: AttendanceRules = {
  dayInTime: '08:00',
  lunchOutTime: '12:00',
  lunchInTime: '13:00',
  dayOutTime: '17:00',
  targetHours: 8,
};

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

@Injectable()
export class AttendanceRulesService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
    private readonly events: EventEmitter2,
  ) {}

  async getRules(): Promise<AttendanceRules> {
    const rows = await this.settings.find({
      where: Object.values(KEYS).map((key) => ({ key })),
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    const rules: AttendanceRules = {
      dayInTime: byKey.get(KEYS.dayInTime) ?? DEFAULTS.dayInTime,
      lunchOutTime: byKey.get(KEYS.lunchOutTime) ?? DEFAULTS.lunchOutTime,
      lunchInTime: byKey.get(KEYS.lunchInTime) ?? DEFAULTS.lunchInTime,
      dayOutTime: byKey.get(KEYS.dayOutTime) ?? DEFAULTS.dayOutTime,
      targetHours: this.parseTargetHours(
        byKey.get(KEYS.targetHours),
        DEFAULTS.targetHours,
      ),
    };

    // Seed any missing keys so subsequent reads are cheap and the values
    // show up in any admin dashboard we add later.
    await Promise.all(
      (Object.keys(KEYS) as (keyof typeof KEYS)[]).map((field) =>
        this.ensureKey(
          KEYS[field],
          field === 'targetHours'
            ? String(rules.targetHours)
            : rules[field],
        ),
      ),
    );

    return rules;
  }

  async updateRules(dto: AttendanceRulesDto): Promise<AttendanceRules> {
    this.assertScheduleOrder(dto);

    await Promise.all([
      this.upsertKey(KEYS.dayInTime, dto.dayInTime),
      this.upsertKey(KEYS.lunchOutTime, dto.lunchOutTime),
      this.upsertKey(KEYS.lunchInTime, dto.lunchInTime),
      this.upsertKey(KEYS.dayOutTime, dto.dayOutTime),
      this.upsertKey(KEYS.targetHours, String(dto.targetHours)),
    ]);

    const next = await this.getRules();
    this.emitRulesChanged(next);
    return next;
  }

  private emitRulesChanged(rules: AttendanceRules): void {
    const event: NotificationDomainEvent = {
      eventName: 'attendance.rules_changed',
      kind: NotificationKind.ATTENDANCE,
      severity: NotificationSeverity.INFO,
      title: 'Attendance schedule updated',
      message: `New schedule: in ${rules.dayInTime}, lunch ${rules.lunchOutTime}-${rules.lunchInTime}, out ${rules.dayOutTime} (target ${rules.targetHours}h).`,
      href: '/settings?section=attendance',
      targetRoles: [UserRole.SITE_MANAGER, UserRole.TIME_KEEPER],
      // We intentionally do NOT dedupe by rule content — every save should
      // notify so reviewers see the audit trail. Embedding the ISO timestamp
      // keeps the unique constraint happy for rapid edits.
      dedupeKey: `attendance.rules_changed:${new Date().toISOString()}`,
      payload: { ...rules },
    };
    this.events.emit(NOTIFICATION_EVENT, event);
  }

  private assertScheduleOrder(dto: AttendanceRulesDto): void {
    const dayIn = timeToMinutes(dto.dayInTime);
    const lunchOut = timeToMinutes(dto.lunchOutTime);
    const lunchIn = timeToMinutes(dto.lunchInTime);
    const dayOut = timeToMinutes(dto.dayOutTime);

    if (
      !(
        dayIn <= lunchOut &&
        lunchOut <= lunchIn &&
        lunchIn <= dayOut
      )
    ) {
      throw new BadRequestException(
        'Schedule times must follow Day in ≤ Lunch out ≤ Lunch in ≤ Day out.',
      );
    }
  }

  private parseTargetHours(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 24
      ? parsed
      : fallback;
  }

  private async ensureKey(key: string, value: string): Promise<void> {
    const existing = await this.settings.findOne({ where: { key } });
    if (existing) return;
    await this.settings.save(this.settings.create({ key, value }));
  }

  private async upsertKey(key: string, value: string): Promise<void> {
    const existing = await this.settings.findOne({ where: { key } });
    if (existing) {
      existing.value = value;
      await this.settings.save(existing);
      return;
    }
    await this.settings.save(this.settings.create({ key, value }));
  }
}
