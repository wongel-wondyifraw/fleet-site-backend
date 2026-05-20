import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  AttendanceQueryDto,
  CheckInDto,
  CheckOutDto,
  UpdateAttendanceDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  findAll(@Query() query: AttendanceQueryDto) {
    return this.attendance.findAll(query);
  }

  @Get('summary/employee/:employeeId')
  summary(
    @Param('employeeId') employeeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.totalHoursForEmployee(employeeId, from, to);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.findOne(id);
  }

  @Post('check-in')
  @HttpCode(HttpStatus.CREATED)
  checkIn(@Body() dto: CheckInDto) {
    return this.attendance.checkIn(dto);
  }

  @Patch(':id/check-out')
  checkOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckOutDto,
  ) {
    return this.attendance.checkOut(id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.attendance.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.remove(id);
  }
}
