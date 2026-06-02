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

import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import {
  AttendanceDriverHistoryQueryDto,
  AttendanceQueryDto,
  AttendanceRosterBulkQueryDto,
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
  @RequiresPermissions('attendance.read')
  getRoster(@Query() query: AttendanceRosterQueryDto) {
    return this.attendance.getRoster(query);
  }

  @Get('roster/bulk')
  @RequiresPermissions('attendance.read')
  getRosterBulk(@Query() query: AttendanceRosterBulkQueryDto) {
    return this.attendance.getRosterBulk(query);
  }

  // Per-driver attendance history for the detail page. Declared before the
  // legacy `:id` routes so Nest doesn't try to ParseUUIDPipe the literal
  // "drivers" segment.
  @Get('drivers/:driverId/history')
  @RequiresPermissions('attendance.read')
  getDriverHistory(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() query: AttendanceDriverHistoryQueryDto,
  ) {
    return this.attendance.getDriverHistory(driverId, query);
  }

  @Post('days/:dayId/punches')
  @RequiresPermissions('attendance.create')
  @HttpCode(HttpStatus.CREATED)
  createPunch(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: CreateAttendancePunchDto,
  ) {
    return this.attendance.createPunch(dayId, dto);
  }

  @Patch('days/:dayId')
  @RequiresPermissions('attendance.update')
  updateDay(
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: UpdateAttendanceDayDtoNew,
  ) {
    return this.attendance.updateDayNew(dayId, dto);
  }

  @Patch('punches/:punchId')
  @RequiresPermissions('attendance.update')
  updatePunch(
    @Param('punchId', ParseUUIDPipe) punchId: string,
    @Body() dto: UpdateAttendancePunchDto,
  ) {
    return this.attendance.updatePunch(punchId, dto);
  }

  @Delete('punches/:punchId')
  @RequiresPermissions('attendance.delete')
  deletePunch(@Param('punchId', ParseUUIDPipe) punchId: string) {
    return this.attendance.voidPunch(punchId);
  }

  // ---------------------------------------------------------------------
  // Legacy attendance routes (preserved for backwards compatibility).
  // ---------------------------------------------------------------------

  @Get()
  @RequiresPermissions('attendance.read')
  findAll(@Query() query: AttendanceQueryDto) {
    return this.attendance.findAll(query);
  }

  @Get('summary/employee/:employeeId')
  @RequiresPermissions('attendance.read')
  summary(
    @Param('employeeId') employeeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.totalHoursForEmployee(employeeId, from, to);
  }

  @Get(':id')
  @RequiresPermissions('attendance.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.findOne(id);
  }

  @Post('check-in')
  @RequiresPermissions('attendance.create')
  @HttpCode(HttpStatus.CREATED)
  checkIn(@Body() dto: CheckInDto) {
    return this.attendance.checkIn(dto);
  }

  @Patch(':id/check-out')
  @RequiresPermissions('attendance.update')
  checkOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckOutDto,
  ) {
    return this.attendance.checkOut(id, dto);
  }

  @Patch(':id')
  @RequiresPermissions('attendance.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.attendance.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermissions('attendance.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendance.remove(id);
  }
}
