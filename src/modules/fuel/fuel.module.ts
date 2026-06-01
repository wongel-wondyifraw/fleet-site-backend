import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttendanceModule } from '../attendance/attendance.module';
import { OdometerReading } from '../attendance/odometer-reading.entity';
import { VehicleModule } from '../vehicles/vehicle.module';
import { FuelConsumptionController } from './fuel-consumption.controller';
import { FuelConsumptionService } from './fuel-consumption.service';
import { FuelLogController } from './fuel-log.controller';
import { FuelLog } from './fuel-log.entity';
import { FuelLogService } from './fuel-log.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FuelLog, OdometerReading]),
    VehicleModule,
    AttendanceModule,
  ],
  controllers: [FuelConsumptionController, FuelLogController],
  providers: [FuelLogService, FuelConsumptionService],
  exports: [FuelLogService, FuelConsumptionService],
})
export class FuelModule {}
