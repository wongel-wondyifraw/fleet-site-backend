import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';
import { FuelType } from '../../common/enums';

export class CreateFuelLogDto {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  driverId!: string;

  @IsEnum(FuelType)
  fuelType!: FuelType;

  @IsNumber()
  @Min(0.1)
  liters!: number;

  @IsNumber()
  @Min(0)
  cost!: number;

  @IsNumber()
  @Min(0)
  odometerReading!: number;

  @IsDateString()
  fillDate!: string;

  @IsOptional()
  @IsString()
  station?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFuelLogDto {
  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  liters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  odometerReading?: number;

  @IsOptional()
  @IsDateString()
  fillDate?: string;

  @IsOptional()
  @IsString()
  station?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class FuelLogQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  driverId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
