import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttendanceRulesModule } from '../attendance-rules/attendance-rules.module';
import { Driver } from '../drivers/driver.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Site } from '../sites/site.entity';
import { TimeSettingsModule } from '../time-settings/time-settings.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceCronService } from './attendance-cron.service';
import { AttendanceDay } from './attendance-day.entity';
import { AttendancePunch } from './attendance-punch.entity';
import { Attendance } from './attendance.entity';
import { AttendanceService } from './attendance.service';
import { OdometerReading } from './odometer-reading.entity';

@Module({
  // Driver and Site repos are read by the roster endpoint to resolve the
  // expected drivers for a site and to look up the site name. We register
  // them via forFeature() so the AttendanceService can inject them directly
  // without depending on the SiteModule / DriverModule providers.
  // OdometerReading is registered alongside AttendancePunch so the service
  // can persist a reading transactionally with its parent punch.
  imports: [
    TypeOrmModule.forFeature([
      Attendance,
      AttendanceDay,
      AttendancePunch,
      OdometerReading,
      Driver,
      Site,
    ]),
    AttendanceRulesModule,
    NotificationsModule,
    TimeSettingsModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceCronService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
