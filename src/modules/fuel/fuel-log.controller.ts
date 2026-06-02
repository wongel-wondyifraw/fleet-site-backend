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

import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
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
  findAll(@Query() query: FuelLogQueryDto) {
    return this.fuel.findAll(query);
  }

  @Get('efficiency/vehicle/:vehicleId')
  @RequiresPermissions('fuel.read')
  efficiency(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: FuelEfficiencyQueryDto,
  ) {
    return this.fuel.efficiencyForVehicle(vehicleId, query);
  }

  @Get(':id')
  @RequiresPermissions('fuel.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.fuel.findOne(id);
  }

  @Post()
  @RequiresPermissions('fuel.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFuelLogDto) {
    return this.fuel.create(dto);
  }

  @Patch(':id')
  @RequiresPermissions('fuel.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFuelLogDto,
  ) {
    return this.fuel.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermissions('fuel.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.fuel.remove(id);
  }
}
