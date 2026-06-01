import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DriverModule } from '../drivers/driver.module';
import { TripTargetModule } from '../trip-targets/trip-target.module';
import { VehicleModule } from '../vehicles/vehicle.module';
import { TripController } from './trip.controller';
import { Trip } from './trip.entity';
import { TripService } from './trip.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trip]),
    VehicleModule,
    DriverModule,
    TripTargetModule,
  ],
  controllers: [TripController],
  providers: [TripService],
  exports: [TripService],
})
export class TripModule {}
