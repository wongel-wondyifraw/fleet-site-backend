import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Query,
} from '@nestjs/common';

import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { SetTargetCountDto, TargetDateQueryDto } from './trip-target.dto';
import { TripTargetService } from './trip-target.service';

@Controller('trip-targets')
export class TripTargetController {
  constructor(private readonly service: TripTargetService) {}

  // Returns the effective target for the requested calendar day:
  // override value if one exists, otherwise the global default. The
  // response also surfaces `defaultCount` and `isOverride` so the
  // client can render a "Reset" affordance only when meaningful.
  @Get('effective')
  @RequiresPermissions('trip-targets.read')
  getEffective(@Query() query: TargetDateQueryDto) {
    return this.service.getEffective(query.date);
  }

  // Upsert the override row for `date`. Always returns the resulting
  // effective target so the client can update its state in one round-
  // trip.
  @Put('effective')
  @RequiresPermissions('trip-targets.update')
  setOverride(
    @Query() query: TargetDateQueryDto,
    @Body() body: SetTargetCountDto,
  ) {
    return this.service.setOverride(query.date, body.count);
  }

  // Clear the override for `date`. Falls back to the default afterwards.
  @Delete('effective')
  @RequiresPermissions('trip-targets.delete')
  @HttpCode(HttpStatus.OK)
  removeOverride(@Query() query: TargetDateQueryDto) {
    return this.service.removeOverride(query.date);
  }

  // Default target endpoints. Useful for an eventual settings panel; the
  // trips UI itself currently only reads via `effective`.
  @Get('default')
  @RequiresPermissions('trip-targets.read')
  async getDefault() {
    const count = await this.service.getDefaultCount();
    return { count };
  }

  @Put('default')
  @RequiresPermissions('trip-targets.update')
  async setDefault(@Body() body: SetTargetCountDto) {
    const count = await this.service.setDefaultCount(body.count);
    return { count };
  }
}
