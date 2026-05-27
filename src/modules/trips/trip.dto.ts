import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

import { TripStatus } from '../../common/enums';

export class CreateTripDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsString()
  @Length(1, 255)
  startAddress!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  startCity?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  startState?: string;

  @IsOptional()
  @IsNumber()
  startLat?: number;

  @IsOptional()
  @IsNumber()
  startLon?: number;

  @IsString()
  @Length(1, 255)
  endAddress!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  endCity?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  endState?: string;

  @IsOptional()
  @IsNumber()
  endLat?: number;

  @IsOptional()
  @IsNumber()
  endLon?: number;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTripDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string | null;

  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  startAddress?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  startCity?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  startState?: string | null;

  @IsOptional()
  @IsNumber()
  startLat?: number | null;

  @IsOptional()
  @IsNumber()
  startLon?: number | null;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  endAddress?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  endCity?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  endState?: string | null;

  @IsOptional()
  @IsNumber()
  endLat?: number | null;

  @IsOptional()
  @IsNumber()
  endLon?: number | null;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class TripQueryDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;
}
