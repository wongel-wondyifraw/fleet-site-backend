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
  findAll(@CurrentUser() user: User, @Query() query: TripQueryDto) {
    return this.trips.findAll(user, query);
  }

  @Get(':id')
  @RequiresPermissions('trips.read')
  findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trips.findOne(user, id);
  }

  @Post()
  @RequiresPermissions('trips.create')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() dto: CreateTripDto) {
    return this.trips.create(user, dto);
  }

  @Patch(':id')
  @RequiresPermissions('trips.update')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.trips.update(user, id, dto);
  }

  @Patch(':id/status')
  @RequiresPermissions('trips.update')
  setStatus(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetTripStatusDto,
  ) {
    return this.trips.setStatus(user, id, body.status, body.distanceKm ?? null);
  }

  @Delete(':id')
  @RequiresPermissions('trips.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trips.remove(user, id);
  }
}
