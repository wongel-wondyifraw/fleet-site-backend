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
  findAll(@Query() query: DriverQueryDto) {
    return this.drivers.findAll(query);
  }

  @Get('expiring-licenses')
  expiringLicenses(
    @Query('withinDays', new ParseIntPipe({ optional: true }))
    withinDays?: number,
  ) {
    return this.drivers.findWithExpiringLicense(withinDays ?? 30);
  }

  @Get('by-employee/:employeeId')
  findByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.drivers.findByEmployeeId(employeeId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDriverDto) {
    return this.drivers.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(id, dto);
  }

  @Patch(':id/assign-vehicle')
  assignVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignVehicleDto,
  ) {
    return this.drivers.assignVehicle(id, dto);
  }

  @Delete(':id/assign-vehicle')
  unassignVehicle(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.unassignVehicle(id);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: DriverStatus,
  ) {
    return this.drivers.setStatus(id, status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.drivers.remove(id);
  }
}
