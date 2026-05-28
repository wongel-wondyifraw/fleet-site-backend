import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppSetting } from './app-setting.entity';
import { DailyTripTargetOverride } from './trip-target.entity';

// Key used in `app_settings` to persist the global default. Kept in one
// place so service callers, tests, and seeders can't drift.
const DEFAULT_TARGET_KEY = 'defaultExpectedTripsPerDay';
// Shipped default applied when no row exists yet in `app_settings`. The
// service auto-seeds this on first read so the API always returns a
// concrete number instead of null.
const FALLBACK_DEFAULT_COUNT = 25;

export interface EffectiveTarget {
  date: string;
  count: number;
  isOverride: boolean;
  defaultCount: number;
}

@Injectable()
export class TripTargetService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
    @InjectRepository(DailyTripTargetOverride)
    private readonly overrides: Repository<DailyTripTargetOverride>,
  ) {}

  async getDefaultCount(): Promise<number> {
    const row = await this.settings.findOne({
      where: { key: DEFAULT_TARGET_KEY },
    });
    if (row) {
      const parsed = Number(row.value);
      return Number.isFinite(parsed) ? parsed : FALLBACK_DEFAULT_COUNT;
    }
    // Seed the row on first access so subsequent reads are cheap and the
    // value shows up in any settings dashboard we add later.
    await this.settings.save(
      this.settings.create({
        key: DEFAULT_TARGET_KEY,
        value: String(FALLBACK_DEFAULT_COUNT),
      }),
    );
    return FALLBACK_DEFAULT_COUNT;
  }

  async setDefaultCount(count: number): Promise<number> {
    const existing = await this.settings.findOne({
      where: { key: DEFAULT_TARGET_KEY },
    });
    if (existing) {
      existing.value = String(count);
      await this.settings.save(existing);
    } else {
      await this.settings.save(
        this.settings.create({
          key: DEFAULT_TARGET_KEY,
          value: String(count),
        }),
      );
    }
    return count;
  }

  async getEffective(date: string): Promise<EffectiveTarget> {
    const [defaultCount, override] = await Promise.all([
      this.getDefaultCount(),
      this.overrides.findOne({ where: { date } }),
    ]);
    if (override) {
      return {
        date,
        count: override.count,
        isOverride: true,
        defaultCount,
      };
    }
    return { date, count: defaultCount, isOverride: false, defaultCount };
  }

  async setOverride(date: string, count: number): Promise<EffectiveTarget> {
    const existing = await this.overrides.findOne({ where: { date } });
    if (existing) {
      existing.count = count;
      await this.overrides.save(existing);
    } else {
      await this.overrides.save(this.overrides.create({ date, count }));
    }
    return this.getEffective(date);
  }

  async removeOverride(date: string): Promise<EffectiveTarget> {
    await this.overrides.delete({ date });
    return this.getEffective(date);
  }
}
