import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';
import { FuelType, VehicleStatus, VehicleType } from '../../common/enums';

export class CreateVehicleDto {
  @IsString()
  @Length(2, 16)
  plateNumber!: string;

  @IsEnum(VehicleType)
  type!: VehicleType;

  @IsEnum(FuelType)
  fuelType!: FuelType;

  @IsNumber()
  @Min(0)
  fuelCapacity!: number;

  // Fuel economy in km/L. Optional - defaults to 0 server-side.
  @IsOptional()
  @IsNumber()
  @Min(0)
  mileage?: number;

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
  @Length(2, 16)
  plateNumber?: string;

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
  mileage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentOdometer?: number;

  @IsOptional()
  @IsString()
  assignedSite?: string | null;
}

export class VehicleQueryDto extends PaginationDto {
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
