import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import { AttendanceStatus, SiteShift } from '../../common/enums';

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
