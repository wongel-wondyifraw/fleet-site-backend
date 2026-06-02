import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Permission } from './permission.entity';
import { Role } from './role.entity';
import { AccessSeederService } from './access.seeder.service';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role, User])],
  controllers: [RolesController, PermissionsController],
  providers: [AccessSeederService, RolesService],
  exports: [AccessSeederService, RolesService, TypeOrmModule],
})
export class AccessModule {}
