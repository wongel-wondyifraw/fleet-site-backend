import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationsModule } from '../notifications/notifications.module';
import { AppSetting } from '../trip-targets/app-setting.entity';
import { AttendanceRulesController } from './attendance-rules.controller';
import { AttendanceRulesService } from './attendance-rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting]), NotificationsModule],
  controllers: [AttendanceRulesController],
  providers: [AttendanceRulesService],
  exports: [AttendanceRulesService],
})
export class AttendanceRulesModule {}
