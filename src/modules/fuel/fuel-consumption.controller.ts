import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { User } from '../users/user.entity';
import {
  FuelConsumptionDriverHistoryQueryDto,
  FuelConsumptionRosterBulkQueryDto,
  FuelConsumptionRosterQueryDto,
} from './fuel-consumption.dto';
import { FuelConsumptionService } from './fuel-consumption.service';

@Controller('fuel/consumption')
export class FuelConsumptionController {
  constructor(private readonly consumption: FuelConsumptionService) {}

  @Get('roster')
  @RequiresPermissions('fuel.read')
  getRoster(
    @CurrentUser() user: User,
    @Query() query: FuelConsumptionRosterQueryDto,
  ) {
    return this.consumption.getRoster(user, query);
  }

  @Get('roster/bulk')
  @RequiresPermissions('fuel.read')
  getRosterBulk(
    @CurrentUser() user: User,
    @Query() query: FuelConsumptionRosterBulkQueryDto,
  ) {
    return this.consumption.getRosterBulk(user, query);
  }

  @Get('drivers/:driverId/history')
  @RequiresPermissions('fuel.read')
  getDriverHistory(
    @CurrentUser() user: User,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() query: FuelConsumptionDriverHistoryQueryDto,
  ) {
    return this.consumption.getDriverHistory(user, driverId, query);
  }
}
