import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppSetting } from '../trip-targets/app-setting.entity';
import { AttendanceRulesController } from './attendance-rules.controller';
import { AttendanceRulesService } from './attendance-rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  controllers: [AttendanceRulesController],
  providers: [AttendanceRulesService],
  exports: [AttendanceRulesService],
})
export class AttendanceRulesModule {}
