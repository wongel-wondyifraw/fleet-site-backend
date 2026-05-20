import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

import { FuelType, VehicleStatus, VehicleType } from '../../common/enums';

export class CreateVehicleDto {
  @IsString()
  @Length(2, 16)
  plateNumber!: string;

  @IsString()
  make!: string;

  @IsString()
  model!: string;

  @IsInt()
  @Min(1950)
  @Max(new Date().getFullYear() + 1)
  year!: number;

  @IsEnum(VehicleType)
  type!: VehicleType;

  @IsEnum(FuelType)
  fuelType!: FuelType;

  @IsNumber()
  @Min(0)
  fuelCapacity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentOdometer?: number;

  @IsOptional()
  @IsString()
  assignedSite?: string;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fuelCapacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentOdometer?: number;

  @IsOptional()
  @IsString()
  assignedSite?: string | null;
}

export class VehicleQueryDto {
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @IsOptional()
  @IsString()
  site?: string;
}
