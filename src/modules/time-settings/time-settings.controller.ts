import { Body, Controller, Get, Put } from '@nestjs/common';

import { TimeSettingsDto } from './time-settings.dto';
import { TimeSettingsService } from './time-settings.service';

@Controller('time-settings')
export class TimeSettingsController {
  constructor(private readonly service: TimeSettingsService) {}

  @Get()
  getSettings() {
    return this.service.getSettings();
  }

  @Put()
  updateSettings(@Body() body: TimeSettingsDto) {
    return this.service.updateSettings(body);
  }
}
