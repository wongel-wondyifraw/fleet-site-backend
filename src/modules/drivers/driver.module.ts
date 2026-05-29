import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SiteModule } from '../sites/site.module';
import { VehicleModule } from '../vehicles/vehicle.module';
import { DriverController } from './driver.controller';
import { Driver } from './driver.entity';
import { DriverService } from './driver.service';

@Module({
  imports: [TypeOrmModule.forFeature([Driver]), VehicleModule, SiteModule],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
