import { Body, Controller, Get, Put } from '@nestjs/common';

import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { TimeSettingsDto } from './time-settings.dto';
import { TimeSettingsService } from './time-settings.service';

@Controller('time-settings')
export class TimeSettingsController {
  constructor(private readonly service: TimeSettingsService) {}

  @Get()
  @RequiresPermissions('time-settings.read')
  getSettings() {
    return this.service.getSettings();
  }

  @Put()
  @RequiresPermissions('time-settings.update')
  updateSettings(@Body() body: TimeSettingsDto) {
    return this.service.updateSettings(body);
  }
}
