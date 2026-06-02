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

import { DriverStatus } from '../../common/enums';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
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
  findAll(@Query() query: DriverQueryDto) {
    return this.drivers.findAll(query);
  }

  @Get('lookup')
  @RequiresPermissions('drivers.read')
  lookup() {
    return this.drivers.findAllLookup();
  }

  @Get('expiring-licenses')
  @RequiresPermissions('drivers.read')
  expiringLicenses(
    @Query('withinDays', new ParseIntPipe({ optional: true }))
    withinDays?: number,
  ) {
    return this.drivers.findWithExpiringLicense(withinDays ?? 30);
  }

  @Get('by-employee/:employeeId')
  @RequiresPermissions('drivers.read')
  findByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.drivers.findByEmployeeId(employeeId);
  }

  @Get(':id')
  @RequiresPermissions('drivers.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.findOne(id);
  }

  @Post()
  @RequiresPermissions('drivers.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDriverDto) {
    return this.drivers.create(dto);
  }

  @Patch(':id')
  @RequiresPermissions('drivers.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(id, dto);
  }

  @Patch(':id/assign-vehicle')
  @RequiresPermissions('drivers.update')
  assignVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignVehicleDto,
  ) {
    return this.drivers.assignVehicle(id, dto);
  }

  @Delete(':id/assign-vehicle')
  @RequiresPermissions('drivers.update')
  unassignVehicle(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.unassignVehicle(id);
  }

  @Patch(':id/status')
  @RequiresPermissions('drivers.update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: DriverStatus,
  ) {
    return this.drivers.setStatus(id, status);
  }

  @Delete(':id')
  @RequiresPermissions('drivers.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.remove(id);
  }
}
