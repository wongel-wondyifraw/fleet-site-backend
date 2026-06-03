import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { SiteScopeService } from '../../common/site-scope/site-scope.service';
import { SiteService } from '../sites/site.service';
import { User } from '../users/user.entity';
import {
  SiteHealthHistoryQueryDto,
  SiteHealthListQueryDto,
  SiteHealthOverviewQueryDto,
} from './site-health.dto';
import { SiteHealthService } from './site-health.service';

@Controller('sites')
export class SiteHealthController {
  constructor(
    private readonly siteHealth: SiteHealthService,
    private readonly sites: SiteService,
    private readonly siteScope: SiteScopeService,
  ) {}

  @Get('health')
  @RequiresPermissions('site-health.read')
  async listHealth(
    @Query() query: SiteHealthListQueryDto,
    @CurrentUser() user: User,
  ) {
    const todayKey = await this.siteHealth.getTodayKey();

    let siteIds = query.siteIds
      ? query.siteIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    if (siteIds.length === 0) {
      const allowed = this.siteScope.allowedSiteIds(user);
      if (allowed === null) {
        const all = await this.sites.findAll({});
        siteIds = all.map((s) => s.id);
      } else {
        siteIds = allowed;
      }
    } else {
      siteIds = this.siteHealth.resolveSiteIdsForUser(user, siteIds);
    }

    const recomputeToday = query.date === todayKey;
    const snapshots = await this.siteHealth.listSnapshots(siteIds, query.date, {
      recomputeToday,
    });
    return snapshots.map((s) => this.siteHealth.toApiDto(s));
  }

  @Get('health/overview')
  @RequiresPermissions('site-health.read')
  async overview(
    @Query() query: SiteHealthOverviewQueryDto,
    @CurrentUser() user: User,
  ) {
    const todayKey = await this.siteHealth.getTodayKey();
    const historyDays = query.historyDays ?? 7;

    let siteIds = query.siteIds
      ? query.siteIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    if (siteIds.length === 0) {
      const allowed = this.siteScope.allowedSiteIds(user);
      if (allowed === null) {
        const all = await this.sites.findAll({});
        siteIds = all.map((s) => s.id);
      } else {
        siteIds = allowed;
      }
    } else {
      siteIds = this.siteHealth.resolveSiteIdsForUser(user, siteIds);
    }

    const from = subtractDaysFromDateKey(query.date, historyDays - 1);
    const recomputeToday = query.date === todayKey;

    const [currentSnapshots, historySnapshots] = await Promise.all([
      this.siteHealth.listSnapshots(siteIds, query.date, { recomputeToday }),
      this.siteHealth.listHistoryForSites(siteIds, from, query.date),
    ]);

    const currentBySite = new Map(
      currentSnapshots.map((s) => [s.siteId, s]),
    );
    const historyBySite = new Map<string, typeof historySnapshots>();
    for (const row of historySnapshots) {
      const list = historyBySite.get(row.siteId) ?? [];
      list.push(row);
      historyBySite.set(row.siteId, list);
    }

    return siteIds.map((siteId) => {
      const current = currentBySite.get(siteId);
      const history = historyBySite.get(siteId) ?? [];
      return {
        siteId,
        current: current ? this.siteHealth.toApiDto(current) : null,
        history: history.map((s) => this.siteHealth.toApiDto(s)),
      };
    });
  }

  @Get('health/:siteId/history')
  @RequiresPermissions('site-health.read')
  async history(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: SiteHealthHistoryQueryDto,
    @CurrentUser() user: User,
  ) {
    this.siteHealth.assertSiteAccess(user, [siteId]);
    const rows = await this.siteHealth.listHistory(
      siteId,
      query.from,
      query.to,
    );
    return rows.map((s) => this.siteHealth.toApiDto(s));
  }
}

/** YYYY-MM-DD minus N calendar days (local date math, matches frontend keys). */
function subtractDaysFromDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d - days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
