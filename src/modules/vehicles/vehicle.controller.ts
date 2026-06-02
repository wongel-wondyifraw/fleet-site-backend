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

import { VehicleStatus } from '../../common/enums';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleQueryDto,
} from './vehicle.dto';
import { VehicleService } from './vehicle.service';

@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  @Get()
  @RequiresPermissions('vehicles.read')
  findAll(@Query() query: VehicleQueryDto) {
    return this.vehicles.findAll(query);
  }

  @Get('lookup')
  @RequiresPermissions('vehicles.read')
  lookup() {
    return this.vehicles.findAllLookup();
  }

  @Get(':id')
  @RequiresPermissions('vehicles.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.findOne(id);
  }

  @Post()
  @RequiresPermissions('vehicles.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicles.create(dto);
  }

  @Patch(':id')
  @RequiresPermissions('vehicles.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(id, dto);
  }

  @Patch(':id/status')
  @RequiresPermissions('vehicles.update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: VehicleStatus,
  ) {
    return this.vehicles.setStatus(id, status);
  }

  @Delete(':id')
  @RequiresPermissions('vehicles.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicles.remove(id);
  }
}
