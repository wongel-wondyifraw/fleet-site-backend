import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

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
  getRoster(@Query() query: FuelConsumptionRosterQueryDto) {
    return this.consumption.getRoster(query);
  }

  @Get('roster/bulk')
  getRosterBulk(@Query() query: FuelConsumptionRosterBulkQueryDto) {
    return this.consumption.getRosterBulk(query);
  }

  @Get('drivers/:driverId/history')
  getDriverHistory(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() query: FuelConsumptionDriverHistoryQueryDto,
  ) {
    return this.consumption.getDriverHistory(driverId, query);
  }
}
