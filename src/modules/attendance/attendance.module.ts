import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Driver } from '../drivers/driver.entity';
import { Site } from '../sites/site.entity';
import { AttendanceController } from './attendance.controller';
import { AttendanceDay } from './attendance-day.entity';
import { AttendancePunch } from './attendance-punch.entity';
import { Attendance } from './attendance.entity';
import { AttendanceService } from './attendance.service';

@Module({
  // Driver and Site repos are read by the roster endpoint to resolve the
  // expected drivers for a site and to look up the site name. We register
  // them via forFeature() so the AttendanceService can inject them directly
  // without depending on the SiteModule / DriverModule providers.
  imports: [
    TypeOrmModule.forFeature([
      Attendance,
      AttendanceDay,
      AttendancePunch,
      Driver,
      Site,
    ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
