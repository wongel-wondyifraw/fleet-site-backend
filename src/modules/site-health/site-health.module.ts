import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttendanceModule } from '../attendance/attendance.module';
import { AttendanceRulesModule } from '../attendance-rules/attendance-rules.module';
import { FuelModule } from '../fuel/fuel.module';
import { Site } from '../sites/site.entity';
import { SiteModule } from '../sites/site.module';
import { TimeSettingsModule } from '../time-settings/time-settings.module';
import { TripTargetModule } from '../trip-targets/trip-target.module';
import { Trip } from '../trips/trip.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { SiteHealthController } from './site-health.controller';
import { SiteHealthCronService } from './site-health-cron.service';
import { SiteHealthSnapshot } from './site-health-snapshot.entity';
import { SiteHealthService } from './site-health.service';
import { SiteScoringConfig } from './site-scoring-config.entity';
import { SiteScoringController } from './site-scoring.controller';
import { SiteScoringService } from './site-scoring.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      SiteHealthSnapshot,
      SiteScoringConfig,
      Site,
      Vehicle,
      Trip,
    ]),
    AttendanceModule,
    AttendanceRulesModule,
    FuelModule,
    TripTargetModule,
    TimeSettingsModule,
    SiteModule,
  ],
  controllers: [SiteHealthController, SiteScoringController],
  providers: [SiteHealthService, SiteScoringService, SiteHealthCronService],
  exports: [SiteHealthService, SiteScoringService],
})
export class SiteHealthModule {}
