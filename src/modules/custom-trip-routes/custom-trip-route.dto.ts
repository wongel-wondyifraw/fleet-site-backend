import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

// Body for POST /custom-trip-routes. All address fields are required —
// the panel form already validates the same constraints client-side so
// duplicating them here keeps the API safe even when called directly.
export class CreateCustomTripRouteDto {
  @IsString()
  @Length(1, 128)
  startName!: string;

  // City / state are accepted but optional — the trip form silently
  // forwards whatever the autocomplete resolved; the settings UI no
  // longer exposes these as inputs.
  @IsOptional()
  @IsString()
  @Length(0, 128)
  startCity?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  startState?: string;

  @IsString()
  @Length(1, 128)
  endName!: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  endCity?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  endState?: string;

  // Distance in kilometres. We allow fractional values for short
  // urban routes while capping at an arbitrarily large upper bound to
  // catch obvious data-entry slips (e.g. metres entered as km).
  @IsNumber()
  @Min(0)
  @Max(100000)
  distanceKm!: number;
}

// Body for PATCH /custom-trip-routes/:id — every field is optional so
// partial updates work; class-validator still enforces shape/length when
// the caller does send a value.
export class UpdateCustomTripRouteDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  startName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  startCity?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  startState?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  endName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  endCity?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  endState?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  distanceKm?: number;
}
