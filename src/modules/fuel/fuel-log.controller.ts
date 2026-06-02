import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { User } from '../users/user.entity';
import {
  CreateFuelLogDto,
  FuelEfficiencyQueryDto,
  FuelLogQueryDto,
  UpdateFuelLogDto,
} from './fuel-log.dto';
import { FuelLogService } from './fuel-log.service';

@Controller('fuel-logs')
export class FuelLogController {
  constructor(private readonly fuel: FuelLogService) {}

  @Get()
  @RequiresPermissions('fuel.read')
  findAll(@CurrentUser() user: User, @Query() query: FuelLogQueryDto) {
    return this.fuel.findAll(user, query);
  }

  @Get('efficiency/vehicle/:vehicleId')
  @RequiresPermissions('fuel.read')
  efficiency(
    @CurrentUser() user: User,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: FuelEfficiencyQueryDto,
  ) {
    return this.fuel.efficiencyForVehicle(user, vehicleId, query);
  }

  @Get(':id')
  @RequiresPermissions('fuel.read')
  findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.fuel.findOne(user, id);
  }

  @Post()
  @RequiresPermissions('fuel.create')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() dto: CreateFuelLogDto) {
    return this.fuel.create(user, dto);
  }

  @Patch(':id')
  @RequiresPermissions('fuel.update')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFuelLogDto,
  ) {
    return this.fuel.update(user, id, dto);
  }

  @Delete(':id')
  @RequiresPermissions('fuel.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.fuel.remove(user, id);
  }
}
