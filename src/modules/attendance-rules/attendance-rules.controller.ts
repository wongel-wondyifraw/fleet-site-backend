import { Body, Controller, Get, Put } from '@nestjs/common';

import { AttendanceRulesDto } from './attendance-rules.dto';
import { AttendanceRulesService } from './attendance-rules.service';

@Controller('attendance-rules')
export class AttendanceRulesController {
  constructor(private readonly service: AttendanceRulesService) {}

  @Get()
  getRules() {
    return this.service.getRules();
  }

  @Put()
  updateRules(@Body() body: AttendanceRulesDto) {
    return this.service.updateRules(body);
  }
}
