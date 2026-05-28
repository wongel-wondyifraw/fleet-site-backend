import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppSetting } from './app-setting.entity';
import { TripTargetController } from './trip-target.controller';
import { DailyTripTargetOverride } from './trip-target.entity';
import { TripTargetService } from './trip-target.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting, DailyTripTargetOverride])],
  controllers: [TripTargetController],
  providers: [TripTargetService],
  exports: [TripTargetService],
})
export class TripTargetModule {}
