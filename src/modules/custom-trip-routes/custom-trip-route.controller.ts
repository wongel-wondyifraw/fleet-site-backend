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
} from '@nestjs/common';

import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateCustomTripRouteDto,
  UpdateCustomTripRouteDto,
} from './custom-trip-route.dto';
import { CustomTripRouteService } from './custom-trip-route.service';

@Controller('custom-trip-routes')
export class CustomTripRouteController {
  constructor(private readonly service: CustomTripRouteService) {}

  @Get()
  @RequiresPermissions('custom-routes.read')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequiresPermissions('custom-routes.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermissions('custom-routes.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCustomTripRouteDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequiresPermissions('custom-routes.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomTripRouteDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermissions('custom-routes.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
