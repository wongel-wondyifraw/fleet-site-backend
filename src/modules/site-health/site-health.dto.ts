import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SiteHealthListQueryDto {
  @IsDateString()
  date!: string;

  /** Comma-separated site UUIDs. */
  @IsOptional()
  siteIds?: string;
}

export class SiteHealthHistoryQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

/** Batched current score + rolling history for dashboard overview. */
export class SiteHealthOverviewQueryDto {
  @IsDateString()
  date!: string;

  /** Comma-separated site UUIDs. */
  @IsOptional()
  siteIds?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  historyDays?: number;
}

export class SiteScoringWeightsDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  driverAttendance!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  vehicleAvailability!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  tripTargetAchievement!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  scheduleCompliance!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  fuelEfficiencyVariance!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  dataCompleteness!: number;
}

export class SiteScoringBandsDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  goodMin!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  watchMin!: number;
}

export class UpdateSiteScoringConfigDto {
  @ValidateNested()
  @Type(() => SiteScoringWeightsDto)
  weights!: SiteScoringWeightsDto;

  @ValidateNested()
  @Type(() => SiteScoringBandsDto)
  bands!: SiteScoringBandsDto;

  @IsNumber()
  @Min(0)
  @Max(1)
  dataCompletenessFloor!: number;
}
