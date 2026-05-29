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
  AttendanceDriverHistoryQueryDto,
  AttendanceQueryDto,
  AttendanceRosterQueryDto,
  CheckInDto,
  CheckOutDto,
  CreateAttendancePunchDto,
  UpdateAttendanceDayDtoNew,
  UpdateAttendanceDto,
  UpdateAttendancePunchDto,
} from './attendance.dto';
import { AttendanceService } from './attendance.service';

// Route ordering note: every static-prefixed path (e.g. `roster`, `days/...`,
// `punches/...`) must be declared BEFORE the legacy `:id` routes so Nest
// doesn't try to ParseUUIDPipe the literal string "roster" or "days".
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // ---------------------------------------------------------------------
  // New event-log routes (AttendanceDay + AttendancePunch).
  // ---------------------------------------------------------------------

  @Get('roster')
  getRoster(@Query() query: AttendanceRosterQueryDto) {
    return this.attendance.getRoster(query);
  }

  // Per-driver attendance history for the detail page. Declared before the
  // legacy `:id` routes so Nest doesn't try to ParseUUIDPipe the literal
  // "drivers" segment.
  @Get('drivers/:driverId/history')
  getDriverHistory(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() query: AttendanceDriverHistoryQueryDto,
  ) {
    return this.attendance.getDriverHistory(driverId, query);
  }

  @Post('days/:dayId/punches')
  @HttpCode(HttpStatus.CREATED)
  createPunch(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: CreateAttendancePunchDto,
  ) {
    return this.attendance.createPunch(dayId, dto);
  }

  @Patch('days/:dayId')
  updateDay(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: UpdateAttendanceDayDtoNew,
  ) {
    return this.attendance.updateDayNew(dayId, dto);
  }

  @Patch('punches/:punchId')
  updatePunch(
    @Param('punchId', ParseUUIDPipe) punchId: string,
    @Body() dto: UpdateAttendancePunchDto,
  ) {
    return this.attendance.updatePunch(punchId, dto);
  }

  @Delete('punches/:punchId')
  deletePunch(@Param('punchId', ParseUUIDPipe) punchId: string) {
    return this.attendance.voidPunch(punchId);
  }

  // ---------------------------------------------------------------------
  // Legacy attendance routes (preserved for backwards compatibility).
  // ---------------------------------------------------------------------

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
