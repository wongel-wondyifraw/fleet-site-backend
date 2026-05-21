// Nest module decorator.
import { Module } from '@nestjs/common';
// TypeORM feature registration for entities used in this module.
import { TypeOrmModule } from '@nestjs/typeorm';

// Site entity is needed because UsersService resolves site assignments.
import { Site } from '../sites/site.entity';
// HTTP controller exposing /users routes.
import { UsersController } from './user.controller';
// User entity registered with TypeORM.
import { User } from './user.entity';
// Service containing business logic; exported for AuthModule.
import { UsersService } from './user.service';

@Module({
  // Register User and Site repositories for injection into UsersService.
  imports: [TypeOrmModule.forFeature([User, Site])],
  // Expose the REST controller.
  controllers: [UsersController],
  // Provide UsersService within this module's DI scope.
  providers: [UsersService],
  // Export UsersService so AuthModule can inject it for login validation.
  exports: [UsersService],
})
export class UsersModule {}
