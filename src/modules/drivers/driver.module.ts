import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SiteModule } from '../sites/site.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Vehicle } from '../vehicles/vehicle.entity';
import { VehicleModule } from '../vehicles/vehicle.module';
import { DriverController } from './driver.controller';
import { Driver } from './driver.entity';
import { DriverService } from './driver.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, Vehicle]),
    VehicleModule,
    SiteModule,
    NotificationsModule,
  ],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
