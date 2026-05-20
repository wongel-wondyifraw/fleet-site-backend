import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from './common/common.module';
import { Attendance } from './modules/attendance/attendance.entity';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { Driver } from './modules/drivers/driver.entity';
import { DriverModule } from './modules/drivers/driver.module';
import { FuelLog } from './modules/fuel/fuel-log.entity';
import { FuelModule } from './modules/fuel/fuel.module';
import { Vehicle } from './modules/vehicles/vehicle.entity';
import { VehicleModule } from './modules/vehicles/vehicle.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DATABASE_PATH ?? 'fleetsite.db',
      entities: [Vehicle, Driver, Attendance, FuelLog],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    CommonModule,
    VehicleModule,
    DriverModule,
    AttendanceModule,
    FuelModule,
  ],
})
export class AppModule {}
