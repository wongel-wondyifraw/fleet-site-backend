import { Matches, Max, Min } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AttendanceRulesDto {
  @Matches(TIME_PATTERN, { message: 'dayInTime must be HH:MM (24-hour)' })
  dayInTime!: string;

  @Matches(TIME_PATTERN, { message: 'lunchOutTime must be HH:MM (24-hour)' })
  lunchOutTime!: string;

  @Matches(TIME_PATTERN, { message: 'lunchInTime must be HH:MM (24-hour)' })
  lunchInTime!: string;

  @Matches(TIME_PATTERN, { message: 'dayOutTime must be HH:MM (24-hour)' })
  dayOutTime!: string;

  @Min(0)
  @Max(24)
  targetHours!: number;
}
