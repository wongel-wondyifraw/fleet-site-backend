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
import { VehicleStatus } from '../../common/enums';
import { User } from '../users/user.entity';
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
  findAll(@CurrentUser() user: User, @Query() query: VehicleQueryDto) {
    return this.vehicles.findAll(user, query);
  }

  @Get('lookup')
  @RequiresPermissions('vehicles.read')
  lookup(@CurrentUser() user: User) {
    return this.vehicles.findAllLookup(user);
  }

  @Get(':id')
  @RequiresPermissions('vehicles.read')
  findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehicles.findOne(user, id);
  }

  @Post()
  @RequiresPermissions('vehicles.create')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(user, dto);
  }

  @Patch(':id')
  @RequiresPermissions('vehicles.update')
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(user, id, dto);
  }

  @Patch(':id/status')
  @RequiresPermissions('vehicles.update')
  setStatus(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: VehicleStatus,
  ) {
    return this.vehicles.setStatus(user, id, status);
  }

  @Delete(':id')
  @RequiresPermissions('vehicles.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehicles.remove(user, id);
  }
}
