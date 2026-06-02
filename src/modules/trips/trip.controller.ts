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
  CreateTripDto,
  SetTripStatusDto,
  TripQueryDto,
  UpdateTripDto,
} from './trip.dto';
import { TripService } from './trip.service';

@Controller('trips')
export class TripController {
  constructor(private readonly trips: TripService) {}

  @Get()
  @RequiresPermissions('trips.read')
  findAll(@Query() query: TripQueryDto) {
    return this.trips.findAll(query);
  }

  @Get(':id')
  @RequiresPermissions('trips.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.findOne(id);
  }

  @Post()
  @RequiresPermissions('trips.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTripDto) {
    return this.trips.create(dto);
  }

  @Patch(':id')
  @RequiresPermissions('trips.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.trips.update(id, dto);
  }

  // Dedicated transition endpoint used by the Trip Checkout / Check-in /
  // Cancel buttons. Kept separate from PATCH /trips/:id so the side-effects
  // (start/complete timestamps and check-in distance) are explicit and
  // never accidentally triggered by a regular field edit.
  @Patch(':id/status')
  @RequiresPermissions('trips.update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetTripStatusDto,
  ) {
    return this.trips.setStatus(id, body.status, body.distanceKm ?? null);
  }

  @Delete(':id')
  @RequiresPermissions('trips.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.remove(id);
  }
}
