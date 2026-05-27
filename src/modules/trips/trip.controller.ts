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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.remove(id);
  }
}
