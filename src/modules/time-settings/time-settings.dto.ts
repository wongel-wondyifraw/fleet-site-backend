import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class TimeSettingsDto {
  // IANA timezone identifier (e.g. "Africa/Addis_Ababa"). Validated for
  // shape only; runtime validity is checked against Intl.DateTimeFormat
  // in the service so unknown zones are rejected before we store them.
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  timezone!: string;

  @IsIn(['12', '24'])
  timeFormat!: '12' | '24';
}
