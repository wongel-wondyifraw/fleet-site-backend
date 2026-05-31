import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppSetting } from '../trip-targets/app-setting.entity';
import { TimeSettingsController } from './time-settings.controller';
import { TimeSettingsService } from './time-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  controllers: [TimeSettingsController],
  providers: [TimeSettingsService],
  exports: [TimeSettingsService],
})
export class TimeSettingsModule {}
