import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Site } from '../sites/site.entity';
import { TimeSettingsService } from '../time-settings/time-settings.service';
import { SiteHealthService } from './site-health.service';

@Injectable()
export class SiteHealthCronService {
  private readonly logger = new Logger(SiteHealthCronService.name);
  private running = false;

  constructor(
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
    private readonly siteHealth: SiteHealthService,
    private readonly timeSettings: TimeSettingsService,
  ) {}

  /** Runs daily at 02:00 server time — scores yesterday for every site. */
  @Cron('0 2 * * *')
  async computeYesterdaySnapshots(): Promise<void> {
    if (this.running) {
      this.logger.warn('Site health cron skipped — previous run still active.');
      return;
    }
    this.running = true;
    try {
      const { timezone } = await this.timeSettings.getSettings();
      const yesterday = this.offsetDateKey(
        this.todayKeyInTimezone(timezone),
        -1,
      );
      const allSites = await this.sites.find({ select: ['id'] });
      this.logger.log(
        `Computing site health for ${allSites.length} sites on ${yesterday}`,
      );
      for (const site of allSites) {
        try {
          await this.siteHealth.computeForSite(site.id, yesterday);
        } catch (err) {
          this.logger.error(
            `Failed site health for ${site.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      this.logger.log('Site health cron completed.');
    } finally {
      this.running = false;
    }
  }

  private todayKeyInTimezone(tz: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private offsetDateKey(base: string, days: number): string {
    const [y, m, d] = base.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
  }
}
