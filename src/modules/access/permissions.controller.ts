import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesService } from './roles.service';

@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequiresPermissions('roles.read')
  findAllGrouped() {
    return this.roles.findPermissionsGrouped();
  }
}
