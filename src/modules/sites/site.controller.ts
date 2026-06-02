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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { User } from '../users/user.entity';
import { CreateSiteDto, SiteQueryDto, UpdateSiteDto } from './site.dto';
import { SiteService } from './site.service';

@Controller('sites')
export class SiteController {
  constructor(private readonly sites: SiteService) {}

  @Get()
  @RequiresPermissions('sites.read')
  findAll(@Query() query: SiteQueryDto) {
    return this.sites.findAll(query);
  }

  @Get('active')
  @RequiresPermissions('sites.read')
  findActive() {
    return this.sites.findActive();
  }

  @Get('me')
  @RequiresPermissions('sites.read')
  findMine(@CurrentUser() user: User) {
    return this.sites.findForUser(user);
  }

  @Get(':id')
  @RequiresPermissions('sites.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sites.findOne(id);
  }

  @Post()
  @RequiresPermissions('sites.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSiteDto) {
    return this.sites.create(dto);
  }

  @Patch(':id')
  @RequiresPermissions('sites.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.sites.update(id, dto);
  }

  @Patch(':id/status')
  @RequiresPermissions('sites.update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: SiteStatus,
  ) {
    return this.sites.setStatus(id, status);
  }

  @Delete(':id')
  @RequiresPermissions('sites.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sites.remove(id);
  }
}
