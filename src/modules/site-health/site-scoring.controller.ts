import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { User } from '../users/user.entity';
import { UpdateSiteScoringConfigDto } from './site-health.dto';
import { SiteScoringService } from './site-scoring.service';

@Controller('sites/scoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SiteScoringController {
  constructor(private readonly scoring: SiteScoringService) {}

  @Get('config')
  @Roles(UserRole.ADMIN)
  getConfig() {
    return this.scoring.getConfig();
  }

  @Put('config')
  @Roles(UserRole.ADMIN)
  updateConfig(
    @Body() dto: UpdateSiteScoringConfigDto,
    @CurrentUser() user: User,
  ) {
    return this.scoring.updateConfig(dto, user.id);
  }
}
