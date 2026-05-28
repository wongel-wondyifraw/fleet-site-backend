import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import {
  AttendanceDayStatus,
  AttendancePunchType,
  AttendanceStatus,
  SiteShift,
} from '../../common/enums';

// ---------------------------------------------------------------------------
// Legacy DTOs (kept so the original /attendance, /attendance/check-in, etc.
// endpoints continue to work against the original Attendance entity).
// ---------------------------------------------------------------------------

export class CheckInDto {
  @IsString()
  employeeId!: string;

  @IsString()
  siteLocation!: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsEnum(SiteShift)
  shift?: SiteShift;

  @IsOptional()
  @IsDateString()
  checkInTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CheckOutDto {
  @IsOptional()
  @IsDateString()
  checkOutTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAttendanceDto {
  @IsOptional()
  @IsString()
  siteLocation?: string;

  @IsOptional()
  @IsEnum(SiteShift)
  shift?: SiteShift;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsUUID()
  vehicleId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class AttendanceQueryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  site?: string;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

// ---------------------------------------------------------------------------
// New event-log DTOs for the AttendanceDay + AttendancePunch model.
// ---------------------------------------------------------------------------

export class AttendanceRosterQueryDto {
  // YYYY-MM-DD; the service uses this as the literal `date` column value.
  @IsDateString()
  date!: string;

  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsEnum(AttendanceDayStatus)
  status?: AttendanceDayStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateAttendancePunchDto {
  @IsEnum(AttendancePunchType)
  type!: AttendancePunchType;

  // When omitted the service stamps `new Date()` so the typical "punch now"
  // flow doesn't have to send a timestamp from the client.
  @IsOptional()
  @IsDateString()
  at?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}

// Only EXPECTED and ON_LEAVE are user-settable from the day endpoint. All
// other states are derived from punches and would be overwritten on the next
// recalculation anyway, so we reject them at the DTO layer.
export class UpdateAttendanceDayDtoNew {
  @IsOptional()
  @IsEnum(AttendanceDayStatus)
  status?: AttendanceDayStatus;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateAttendancePunchDto {
  @IsOptional()
  @IsDateString()
  at?: string;

  @IsOptional()
  @IsString()
  note?: string | null;
}
