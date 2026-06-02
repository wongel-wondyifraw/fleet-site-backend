// Root Nest module that wires every feature module together.
import { Module } from '@nestjs/common';
// ConfigModule loads .env variables globally.
import { ConfigModule, ConfigService } from '@nestjs/config';
// TypeOrmModule connects to PostgreSQL and registers entities.
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { runAccessBackfill } from './modules/access/access.backfill';

// Shared utilities (CalculatedService, etc.).
import { CommonModule } from './common/common.module';
// Attendance feature module and entities (legacy Attendance row + new
// event-log AttendanceDay/AttendancePunch pair, plus the OdometerReading
// row captured at each clock event for the fuel module to consume).
import { AttendanceDay } from './modules/attendance/attendance-day.entity';
import { AttendancePunch } from './modules/attendance/attendance-punch.entity';
import { Attendance } from './modules/attendance/attendance.entity';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AttendanceRulesModule } from './modules/attendance-rules/attendance-rules.module';
import { TimeSettingsModule } from './modules/time-settings/time-settings.module';
import { OdometerReading } from './modules/attendance/odometer-reading.entity';
import { Permission } from './modules/access/permission.entity';
import { Role } from './modules/access/role.entity';
import { AccessModule } from './modules/access/access.module';
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
import { NotificationPreference } from './modules/notifications/notification-preference.entity';
import { Notification } from './modules/notifications/notification.entity';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PushSubscription } from './modules/notifications/push-subscription.entity';
// Trip feature module and entity.
import { Trip } from './modules/trips/trip.entity';
import { TripModule } from './modules/trips/trip.module';
// Trip target feature: global default + per-day overrides.
import { AppSetting } from './modules/trip-targets/app-setting.entity';
import { DailyTripTargetOverride } from './modules/trip-targets/trip-target.entity';
import { TripTargetModule } from './modules/trip-targets/trip-target.module';
// Custom trip routes feature: admin-defined start/end presets surfaced
// on the trip-creation form as "Custom" pickers.
import { CustomTripRoute } from './modules/custom-trip-routes/custom-trip-route.entity';
import { CustomTripRouteModule } from './modules/custom-trip-routes/custom-trip-route.module';
// Site feature module and entity.
import { Site } from './modules/sites/site.entity';
import { SiteModule } from './modules/sites/site.module';
import { SiteHealthSnapshot } from './modules/site-health/site-health-snapshot.entity';
import { SiteHealthModule } from './modules/site-health/site-health.module';
import { SiteScoringConfig } from './modules/site-health/site-scoring-config.entity';
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
    EventEmitterModule.forRoot(),
    // Async DB config so credentials come from environment variables.
    // In hosted environments (Render/Supabase), prefer DATABASE_URL so the
    // app can connect through Supabase's pooler instead of falling back to
    // localhost-based development variables.
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      // Custom factory so we can run the RBAC backfill BEFORE TypeORM's
      // synchronize tries to add a NOT NULL users.roleId column to
      // existing rows that still carry the legacy `role` enum string.
      dataSourceFactory: async (options) => {
        if (!options) {
          throw new Error('DataSource options were not provided');
        }
        const wantsSync = (options as DataSourceOptions & { synchronize?: boolean }).synchronize === true;
        const ds = new DataSource({
          ...(options as DataSourceOptions),
          synchronize: false,
        });
        await ds.initialize();
        await runAccessBackfill(ds);
        if (wantsSync) {
          await ds.synchronize();
        }
        return ds;
      },
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        const sharedOptions = {
          // Explicit entity list; User added for the new auth/users feature.
          entities: [
            Vehicle,
            Driver,
            Site,
            User,
            Role,
            Permission,
            Attendance,
            AttendanceDay,
            AttendancePunch,
            OdometerReading,
            FuelLog,
            Notification,
            PushSubscription,
            NotificationPreference,
            Trip,
            AppSetting,
            DailyTripTargetOverride,
            CustomTripRoute,
            SiteHealthSnapshot,
            SiteScoringConfig,
          ],
          // Also pick up entities registered via forFeature() in child modules.
          autoLoadEntities: true,
          // TEMP: keep synchronize on everywhere so newly added entities
          // (e.g. Trip) auto-create their tables on deploy. Flip back to
          // `!isProduction` and adopt TypeORM migrations before we have any
          // production data we cannot afford to lose.
          synchronize: true,
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
    AccessModule,
    // Auth must be imported so /api/auth routes and JwtStrategy are registered.
    AuthModule,
    UsersModule,
    SiteHealthModule,
    SiteModule,
    VehicleModule,
    DriverModule,
    AttendanceModule,
    AttendanceRulesModule,
    TimeSettingsModule,
    FuelModule,
    NotificationsModule,
    TripModule,
    TripTargetModule,
    CustomTripRouteModule,
    HealthModule,
  ],
})
export class AppModule {}
