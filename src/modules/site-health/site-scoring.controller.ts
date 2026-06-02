import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { User } from '../users/user.entity';
import { UpdateSiteScoringConfigDto } from './site-health.dto';
import { SiteScoringService } from './site-scoring.service';

@Controller('sites/scoring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SiteScoringController {
  constructor(private readonly scoring: SiteScoringService) {}

  @Get('config')
  @RequiresPermissions('site-health.read')
  getConfig() {
    return this.scoring.getConfig();
  }

  @Put('config')
  @RequiresPermissions('site-health.update')
  updateConfig(
    @Body() dto: UpdateSiteScoringConfigDto,
    @CurrentUser() user: User,
  ) {
    return this.scoring.updateConfig(dto, user.id);
  }
}
