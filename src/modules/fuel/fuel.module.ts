import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VehicleModule } from '../vehicles/vehicle.module';
import { FuelLogController } from './fuel-log.controller';
import { FuelLog } from './fuel-log.entity';
import { FuelLogService } from './fuel-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([FuelLog]), VehicleModule],
  controllers: [FuelLogController],
  providers: [FuelLogService],
  exports: [FuelLogService],
})
export class FuelModule {}
