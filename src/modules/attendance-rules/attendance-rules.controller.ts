import { Body, Controller, Get, Put } from '@nestjs/common';

import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { AttendanceRulesDto } from './attendance-rules.dto';
import { AttendanceRulesService } from './attendance-rules.service';

@Controller('attendance-rules')
export class AttendanceRulesController {
  constructor(private readonly service: AttendanceRulesService) {}

  @Get()
  @RequiresPermissions('attendance-rules.read')
  getRules() {
    return this.service.getRules();
  }

  @Put()
  @RequiresPermissions('attendance-rules.update')
  updateRules(@Body() body: AttendanceRulesDto) {
    return this.service.updateRules(body);
  }
}
