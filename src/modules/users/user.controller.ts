// Nest HTTP decorators for building the REST controller.
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

// Role enum for the @Roles decorator.
import { UserRole } from '../../common/enums';
// @Roles attaches required roles metadata read by RolesGuard.
import { Roles } from '../../common/decorators/roles.decorator';
// JwtAuthGuard ensures a valid Bearer token is present.
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// RolesGuard enforces the @Roles metadata after authentication.
import { RolesGuard } from '../../common/guards/roles.guard';
// DTOs validated by the global ValidationPipe.
import {
  AssignSitesDto,
  ChangePasswordDto,
  CreateUserDto,
  SetRoleDto,
  UpdateUserDto,
  UserQueryDto,
} from './user.dto';
// Business logic lives in the service.
import { UsersService } from './user.service';

// All routes under /api/users (global prefix is set in main.ts).
@Controller('users')
// Every endpoint requires a valid JWT.
@UseGuards(JwtAuthGuard, RolesGuard)
// Every endpoint requires ADMIN role (site-scoped auth is a future TODO).
@Roles(UserRole.ADMIN)
export class UsersController {
  // Inject the service via Nest DI.
  constructor(private readonly users: UsersService) {}

  // GET /api/users?role=&siteId=&isActive=&search=
  @Get()
  findAll(@Query() query: UserQueryDto) {
    return this.users.findAll(query);
  }

  // GET /api/users/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  // POST /api/users - create a new account.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  // PATCH /api/users/:id - update profile fields.
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(id, dto);
  }

  // PATCH /api/users/:id/role - change role only.
  @Patch(':id/role')
  setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.users.setRole(id, dto.role);
  }

  // PATCH /api/users/:id/password - admin password reset (no current password).
  @Patch(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.users.resetPassword(id, dto.newPassword);
  }

  // PUT /api/users/:id/sites - replace the full site assignment set.
  @Put(':id/sites')
  assignSites(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignSitesDto,
  ) {
    return this.users.assignSites(id, dto.siteIds);
  }

  // POST /api/users/:id/sites/:siteId - add one site.
  @Post(':id/sites/:siteId')
  addSite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.users.addSite(id, siteId);
  }

  // DELETE /api/users/:id/sites/:siteId - remove one site.
  @Delete(':id/sites/:siteId')
  removeSite(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.users.removeSite(id, siteId);
  }

  // DELETE /api/users/:id - soft delete (sets isActive=false).
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.users.deactivate(id);
  }
}
