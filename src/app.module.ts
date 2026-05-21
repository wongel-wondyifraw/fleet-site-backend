import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from './common/common.module';
import { Attendance } from './modules/attendance/attendance.entity';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { Driver } from './modules/drivers/driver.entity';
import { DriverModule } from './modules/drivers/driver.module';
import { FuelLog } from './modules/fuel/fuel-log.entity';
import { FuelModule } from './modules/fuel/fuel.module';
import { Site } from './modules/sites/site.entity';
import { SiteModule } from './modules/sites/site.module';
import { Vehicle } from './modules/vehicles/vehicle.entity';
import { VehicleModule } from './modules/vehicles/vehicle.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '5432')),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'fleetsite'),
        entities: [Vehicle, Driver, Site, Attendance, FuelLog],
        autoLoadEntities: true,
        // Auto-creates database tables based on entities. Turn OFF in production!
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    CommonModule,
    SiteModule,
    VehicleModule,
    DriverModule,
    AttendanceModule,
    FuelModule,
  ],
})
export class AppModule {}
