import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppSetting } from '../trip-targets/app-setting.entity';
import { TimeSettingsDto } from './time-settings.dto';

export interface TimeSettings {
  timezone: string;
  timeFormat: '12' | '24';
}

const KEYS = {
  timezone: 'app.timezone',
  timeFormat: 'app.timeFormat',
} as const;

const DEFAULTS: TimeSettings = {
  // GMT+3 default per product requirement; Africa/Addis_Ababa does not
  // observe DST so the offset is stable year-round.
  timezone: 'Africa/Addis_Ababa',
  timeFormat: '12',
};

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class TimeSettingsService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
  ) {}

  async getSettings(): Promise<TimeSettings> {
    const rows = await this.settings.find({
      where: Object.values(KEYS).map((key) => ({ key })),
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    const settings: TimeSettings = {
      timezone: byKey.get(KEYS.timezone) ?? DEFAULTS.timezone,
      timeFormat:
        byKey.get(KEYS.timeFormat) === '24'
          ? '24'
          : DEFAULTS.timeFormat,
    };

    // Seed any missing keys so subsequent reads are cheap.
    await Promise.all([
      this.ensureKey(KEYS.timezone, settings.timezone),
      this.ensureKey(KEYS.timeFormat, settings.timeFormat),
    ]);

    return settings;
  }

  async updateSettings(dto: TimeSettingsDto): Promise<TimeSettings> {
    if (!isValidTimezone(dto.timezone)) {
      throw new BadRequestException(`Unknown timezone: ${dto.timezone}`);
    }

    await Promise.all([
      this.upsertKey(KEYS.timezone, dto.timezone),
      this.upsertKey(KEYS.timeFormat, dto.timeFormat),
    ]);

    return this.getSettings();
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
