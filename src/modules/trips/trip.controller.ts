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

import { TripStatus } from '../../common/enums';
import { CreateTripDto, TripQueryDto, UpdateTripDto } from './trip.dto';
import { TripService } from './trip.service';

@Controller('trips')
export class TripController {
  constructor(private readonly trips: TripService) {}

  @Get()
  findAll(@Query() query: TripQueryDto) {
    return this.trips.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTripDto) {
    return this.trips.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.trips.update(id, dto);
  }

  // Dedicated transition endpoint used by the Trip Checkout / Check-in /
  // Cancel buttons. Kept separate from PATCH /trips/:id so the side-effects
  // (start/complete timestamps) are explicit and never accidentally
  // triggered by a regular field edit.
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: TripStatus,
  ) {
    return this.trips.setStatus(id, status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.remove(id);
  }
}
