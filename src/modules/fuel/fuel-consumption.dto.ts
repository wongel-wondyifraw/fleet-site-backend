import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class FuelConsumptionRosterQueryDto {
  /** YYYY-MM-DD calendar day. */
  @IsDateString()
  date!: string;

  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class FuelConsumptionRosterBulkQueryDto {
  @IsDateString()
  date!: string;

  /** Comma-separated site UUIDs. */
  @IsString()
  siteIds!: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class FuelConsumptionDriverHistoryQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

/** Slim driver snapshot embedded in consumption roster rows. */
export class FuelConsumptionDriverDto {
  id!: string;
  employeeId!: string;
  firstName!: string;
  lastName!: string;
}

/** Slim site snapshot embedded in consumption roster rows. */
export class FuelConsumptionSiteDto {
  id!: string;
  name!: string;
}

/** Slim vehicle snapshot embedded in consumption roster rows. */
export class FuelConsumptionVehicleDto {
  id!: string;
  plateNumber!: string;
  assetNumber?: string | null;
  mileage!: number;
  fuelType!: string;
}

/** Latest odometer reading per punch type for the day. */
export class FuelOdometerSummaryDto {
  dayIn?: number | null;
  lunchOut?: number | null;
  lunchIn?: number | null;
  dayOut?: number | null;
}

/** One driver-day row in the fuel consumption roster. */
export class FuelConsumptionDayDto {
  attendanceDayId!: string;
  date!: string;
  driverId!: string;
  siteId!: string;
  workDistanceKm?: string | null;
  autoCloseReason?: string | null;
  driver?: FuelConsumptionDriverDto | null;
  site?: FuelConsumptionSiteDto | null;
  vehicleId?: string | null;
  vehicle?: FuelConsumptionVehicleDto | null;
  ratedKmPerLitre?: number | null;
  estimatedLiters?: number | null;
  distanceIncomplete!: boolean;
  odometerSummary?: FuelOdometerSummaryDto | null;
}
