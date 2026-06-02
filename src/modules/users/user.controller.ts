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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  AssignSitesDto,
  ChangePasswordDto,
  CreateUserDto,
  SetRoleDto,
  UpdateUserDto,
  UserQueryDto,
} from './user.dto';
import { UsersService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequiresPermissions('users.read')
  findAll(@Query() query: UserQueryDto) {
    return this.users.findAll(query);
  }

  @Get(':id')
  @RequiresPermissions('users.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @RequiresPermissions('users.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @RequiresPermissions('users.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(id, dto);
  }

  @Patch(':id/role')
  @RequiresPermissions('users.update')
  setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.users.setRole(id, dto.roleId);
  }

  @Patch(':id/password')
  @RequiresPermissions('users.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.users.resetPassword(id, dto.newPassword);
  }

  @Put(':id/sites')
  @RequiresPermissions('users.update')
  assignSites(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSitesDto,
  ) {
    return this.users.assignSites(id, dto.siteIds);
  }

  @Post(':id/sites/:siteId')
  @RequiresPermissions('users.update')
  addSite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.users.addSite(id, siteId);
  }

  @Delete(':id/sites/:siteId')
  @RequiresPermissions('users.update')
  removeSite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.users.removeSite(id, siteId);
  }

  @Delete(':id')
  @RequiresPermissions('users.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.users.deactivate(id);
  }
}
