// Root Nest module that wires every feature module together.
import { Module } from '@nestjs/common';
// ConfigModule loads .env variables globally.
import { ConfigModule, ConfigService } from '@nestjs/config';
// TypeOrmModule connects to PostgreSQL and registers entities.
import { TypeOrmModule } from '@nestjs/typeorm';

// Shared utilities (CalculatedService, etc.).
import { CommonModule } from './common/common.module';
// Attendance feature module and entity.
import { Attendance } from './modules/attendance/attendance.entity';
import { AttendanceModule } from './modules/attendance/attendance.module';
// Auth module (JWT login, guards, strategy).
import { AuthModule } from './modules/auth/auth.module';
// Driver feature module and entity.
import { Driver } from './modules/drivers/driver.entity';
import { DriverModule } from './modules/drivers/driver.module';
// Health module exposes "/" and "/health" for Render's probe and uptime monitors.
import { HealthModule } from './modules/health/health.module';
// Fuel log feature module and entity.
import { FuelLog } from './modules/fuel/fuel-log.entity';
import { FuelModule } from './modules/fuel/fuel.module';
// Trip feature module and entity.
import { Trip } from './modules/trips/trip.entity';
import { TripModule } from './modules/trips/trip.module';
// Site feature module and entity.
import { Site } from './modules/sites/site.entity';
import { SiteModule } from './modules/sites/site.module';
// User feature module and entity (new).
import { User } from './modules/users/user.entity';
import { UsersModule } from './modules/users/user.module';
// Vehicle feature module and entity.
import { Vehicle } from './modules/vehicles/vehicle.entity';
import { VehicleModule } from './modules/vehicles/vehicle.module';

@Module({
  imports: [
    // Load .env from project root; available in every module via ConfigService.
    ConfigModule.forRoot({ isGlobal: true }),
    // Async DB config so credentials come from environment variables.
    // In hosted environments (Render/Supabase), prefer DATABASE_URL so the
    // app can connect through Supabase's pooler instead of falling back to
    // localhost-based development variables.
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const sharedOptions = {
          // Explicit entity list; User added for the new auth/users feature.
          entities: [Vehicle, Driver, Site, User, Attendance, FuelLog, Trip],
          // Also pick up entities registered via forFeature() in child modules.
          autoLoadEntities: true,
          // Auto-creates tables in dev; MUST be false in production.
          synchronize: !isProduction,
          logging: config.get<string>('DB_LOGGING') === 'true',
        };

        if (databaseUrl) {
          return {
            ...sharedOptions,
            type: 'postgres' as const,
            url: databaseUrl,
            // Supabase/Render Postgres connections require TLS. Setting
            // rejectUnauthorized=false keeps Node from rejecting Supabase's
            // managed certificate chain in hosted runtimes.
            ssl: { rejectUnauthorized: false },
            extra: { ssl: { rejectUnauthorized: false } },
          };
        }

        return {
          ...sharedOptions,
          type: 'postgres' as const,
          host: config.get<string>('DB_HOST', 'localhost'),
          port: Number(config.get<string>('DB_PORT', '5432')),
          username: config.get<string>('DB_USERNAME', 'postgres'),
          password: config.get<string>('DB_PASSWORD', 'postgres'),
          database: config.get<string>('DB_NAME', 'fleetsite'),
        };
      },
    }),
    CommonModule,
    // Auth must be imported so /api/auth routes and JwtStrategy are registered.
    AuthModule,
    UsersModule,
    SiteModule,
    VehicleModule,
    DriverModule,
    AttendanceModule,
    FuelModule,
    TripModule,
    HealthModule,
  ],
})
export class AppModule {}
