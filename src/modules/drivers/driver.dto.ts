import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';
import { DriverStatus, LicenseClass } from '../../common/enums';

export class CreateDriverDto {
  // Employee IDs are server-issued (EMP-001, EMP-002, ...) so the UI doesn't
  // have to guess. The field is intentionally omitted from this DTO; clients
  // sending one will be rejected by the global validation pipe.

  @IsString()
  @Length(1, 64)
  firstName!: string;

  @IsString()
  @Length(1, 64)
  lastName!: string;

  @IsString()
  @Length(2, 32)
  licenseNumber!: string;

  @IsEnum(LicenseClass)
  licenseClass!: LicenseClass;

  @IsDateString()
  licenseExpiry!: string;

  @IsString()
  @Matches(/^[+\d][\d\s\-()]{5,}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsDateString()
  hireDate!: string;

  @IsOptional()
  @IsUUID()
  assignedVehicleId?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsEnum(LicenseClass)
  licenseClass?: LicenseClass;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsUUID()
  assignedVehicleId?: string | null;

  @IsOptional()
  @IsUUID()
  siteId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class AssignVehicleDto {
  @IsUUID()
  vehicleId!: string;
}

export class DriverQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsEnum(LicenseClass)
  licenseClass?: LicenseClass;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
