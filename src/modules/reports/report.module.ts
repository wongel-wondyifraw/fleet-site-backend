import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttendanceDay } from '../attendance/attendance-day.entity';
import { AttendancePunch } from '../attendance/attendance-punch.entity';
import { AttendanceRulesModule } from '../attendance-rules/attendance-rules.module';
import { FuelLog } from '../fuel/fuel-log.entity';
import { Site } from '../sites/site.entity';
import { Trip } from '../trips/trip.entity';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Trip,
      FuelLog,
      AttendancePunch,
      AttendanceDay,
      Site,
    ]),
    AttendanceRulesModule,
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
