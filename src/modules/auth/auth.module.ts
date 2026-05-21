// Nest module decorator.
import { Module } from '@nestjs/common';
// ConfigService reads JWT_SECRET and JWT_EXPIRES_IN from env.
import { ConfigModule, ConfigService } from '@nestjs/config';
// JwtModule signs and verifies access tokens.
import { JwtModule } from '@nestjs/jwt';
// PassportModule registers passport strategies (jwt in our case).
import { PassportModule } from '@nestjs/passport';

// UsersModule exports UsersService needed by AuthService and JwtStrategy.
import { UsersModule } from '../users/user.module';
// HTTP controller for /auth routes.
import { AuthController } from './auth.controller';
// AuthService handles login validation and token signing.
import { AuthService } from './auth.service';
// JwtStrategy validates Bearer tokens on protected routes.
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    // UsersModule gives us UsersService for credential checks.
    UsersModule,
    // Register passport with default strategy name 'jwt'.
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Configure JWT signing asynchronously so we can read secrets from ConfigService.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Read expiry string from env (e.g. "7d", "1h"); cast satisfies @nestjs/jwt StringValue type.
        const expiresIn = (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as
          | `${number}d`
          | `${number}h`
          | `${number}m`
          | `${number}s`;
        return {
          // Secret used to sign and verify tokens; MUST be set in production.
          secret: config.get<string>('JWT_SECRET', 'change-me-in-production'),
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  // Expose login and profile endpoints.
  controllers: [AuthController],
  // AuthService signs tokens; JwtStrategy validates them on each request.
  providers: [AuthService, JwtStrategy],
  // Export AuthService if other modules need programmatic login later.
  exports: [AuthService],
})
export class AuthModule {}
