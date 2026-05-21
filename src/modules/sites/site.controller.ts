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

import { SiteStatus } from '../../common/enums';
import { CreateSiteDto, SiteQueryDto, UpdateSiteDto } from './site.dto';
import { SiteService } from './site.service';

@Controller('sites')
export class SiteController {
  constructor(private readonly sites: SiteService) {}

  @Get()
  findAll(@Query() query: SiteQueryDto) {
    return this.sites.findAll(query);
  }

  @Get('active')
  findActive() {
    return this.sites.findActive();
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.sites.findByCode(code);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sites.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSiteDto) {
    return this.sites.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.sites.update(id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: SiteStatus,
  ) {
    return this.sites.setStatus(id, status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sites.remove(id);
  }
}
