import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';
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
  @IsBoolean()
  isRoundTrip?: boolean;

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
  @IsNumber()
  distanceKm?: number | null;

  @IsOptional()
  @IsBoolean()
  isRoundTrip?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

// Body for PATCH /trips/:id/status. Status is required; distanceKm is
// optional and only honoured for the COMPLETED transition — the client
// sends the route distance it computed when the user tapped Check-in so
// we can persist it without having to call LocationIQ from the server.
export class SetTripStatusDto {
  @IsEnum(TripStatus)
  status!: TripStatus;

  @IsOptional()
  @IsNumber()
  distanceKm?: number | null;
}

export class TripQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  /** Single calendar day (YYYY-MM-DD) matched against the trip effective date. */
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /** IANA timezone for date matching (defaults to UTC). */
  @IsOptional()
  @IsString()
  timezone?: string;

  /** When true and `date` is set, include `meta.targetForDate` in the list response. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  includeTarget?: boolean;
}
