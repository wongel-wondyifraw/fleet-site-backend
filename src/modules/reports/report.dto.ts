import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export enum FleetActivityExportFormat {
  XLSX = 'xlsx',
  PDF = 'pdf',
}

export class FleetActivityQueryDto {
  /** YYYY-MM-DD inclusive start (defaults to 7 days before `to`). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** YYYY-MM-DD inclusive end (defaults to today). */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Comma-separated site UUIDs; intersected with the user's site scope. */
  @IsOptional()
  @IsString()
  siteIds?: string;
}

export class FleetActivityExportQueryDto extends FleetActivityQueryDto {
  @IsEnum(FleetActivityExportFormat)
  format!: FleetActivityExportFormat;
}
