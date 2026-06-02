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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermissions } from '../../common/decorators/permissions.decorator';
import { User } from '../users/user.entity';
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

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('roster')
  @RequiresPermissions('attendance.read')
  getRoster(
    @CurrentUser() user: User,
    @Query() query: AttendanceRosterQueryDto,
  ) {
    return this.attendance.getRoster(user, query);
  }

  @Get('roster/bulk')
  @RequiresPermissions('attendance.read')
  getRosterBulk(
    @CurrentUser() user: User,
    @Query() query: AttendanceRosterBulkQueryDto,
  ) {
    return this.attendance.getRosterBulk(user, query);
  }

  @Get('drivers/:driverId/history')
  @RequiresPermissions('attendance.read')
  getDriverHistory(
    @CurrentUser() user: User,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() query: AttendanceDriverHistoryQueryDto,
  ) {
    return this.attendance.getDriverHistory(user, driverId, query);
  }

  @Post('days/:dayId/punches')
  @RequiresPermissions('attendance.create')
  @HttpCode(HttpStatus.CREATED)
  createPunch(
    @CurrentUser() user: User,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: CreateAttendancePunchDto,
  ) {
    return this.attendance.createPunch(user, dayId, dto);
  }

  @Patch('days/:dayId')
  @RequiresPermissions('attendance.update')
  updateDay(
    @CurrentUser() user: User,
    @Param('dayId', ParseUUIDPipe) dayId: string,
    @Body() dto: UpdateAttendanceDayDtoNew,
  ) {
    return this.attendance.updateDayNew(user, dayId, dto);
  }

  @Patch('punches/:punchId')
  @RequiresPermissions('attendance.update')
  updatePunch(
    @CurrentUser() user: User,
    @Param('punchId', ParseUUIDPipe) punchId: string,
    @Body() dto: UpdateAttendancePunchDto,
  ) {
    return this.attendance.updatePunch(user, punchId, dto);
  }

  @Delete('punches/:punchId')
  @RequiresPermissions('attendance.delete')
  deletePunch(
    @CurrentUser() user: User,
    @Param('punchId', ParseUUIDPipe) punchId: string,
  ) {
    return this.attendance.voidPunch(user, punchId);
  }

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
