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
