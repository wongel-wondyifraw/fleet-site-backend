import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { DriverStatus } from '../../common/enums';
import { User } from '../users/user.entity';
import {
  AssignVehicleDto,
  CreateDriverDto,
  DriverQueryDto,
  UpdateDriverDto,
} from './driver.dto';
import { DriverService } from './driver.service';

@Controller('drivers')
export class DriverController {
  constructor(private readonly drivers: DriverService) {}

  @Get()
  @RequiresPermissions('drivers.read')
  findAll(@CurrentUser() user: User, @Query() query: DriverQueryDto) {
    return this.drivers.findAll(user, query);
  }

  @Get('lookup')
  @RequiresPermissions('drivers.read')
  lookup(@CurrentUser() user: User) {
    return this.drivers.findAllLookup(user);
  }

  @Get('expiring-licenses')
  @RequiresPermissions('drivers.read')
  expiringLicenses(
    @CurrentUser() user: User,
    @Query('withinDays', new ParseIntPipe({ optional: true }))
    withinDays?: number,
  ) {
    return this.drivers.findWithExpiringLicense(user, withinDays ?? 30);
  }

  @Get('by-employee/:employeeId')
  @RequiresPermissions('drivers.read')
  findByEmployeeId(
    @CurrentUser() user: User,
    @Param('employeeId') employeeId: string,
  ) {
    return this.drivers.findByEmployeeId(user, employeeId);
  }

  @Get(':id')
  @RequiresPermissions('drivers.read')
  findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.drivers.findOne(user, id);
  }

  @Post()
  @RequiresPermissions('drivers.create')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() dto: CreateDriverDto) {
    return this.drivers.create(user, dto);
  }

  @Patch(':id')
  @RequiresPermissions('drivers.update')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(user, id, dto);
  }

  @Patch(':id/assign-vehicle')
  @RequiresPermissions('drivers.update')
  assignVehicle(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignVehicleDto,
  ) {
    return this.drivers.assignVehicle(user, id, dto);
  }

  @Delete(':id/assign-vehicle')
  @RequiresPermissions('drivers.update')
  unassignVehicle(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.drivers.unassignVehicle(user, id);
  }

  @Patch(':id/status')
  @RequiresPermissions('drivers.update')
  setStatus(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: DriverStatus,
  ) {
    return this.drivers.setStatus(user, id, status);
  }

  @Delete(':id')
  @RequiresPermissions('drivers.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.drivers.remove(user, id);
  }
}
