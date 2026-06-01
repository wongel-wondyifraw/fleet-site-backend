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
  findAll(@Query() query: FuelLogQueryDto) {
    return this.fuel.findAll(query);
  }

  @Get('efficiency/vehicle/:vehicleId')
  efficiency(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: FuelEfficiencyQueryDto,
  ) {
    return this.fuel.efficiencyForVehicle(vehicleId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.fuel.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFuelLogDto) {
    return this.fuel.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFuelLogDto,
  ) {
    return this.fuel.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.fuel.remove(id);
  }
}
