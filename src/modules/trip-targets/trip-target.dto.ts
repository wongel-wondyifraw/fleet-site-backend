import { IsInt, IsISO8601, Matches, Max, Min } from 'class-validator';

// Calendar-day filter shared by the effective-target endpoints. We
// validate the YYYY-MM-DD shape explicitly rather than `IsDateString`
// because the latter also accepts full ISO datetimes which would silently
// produce mismatched override rows.
export class TargetDateQueryDto {
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

// Body for setting either the default target or a per-day override.
// 0 is treated as a valid choice (driver day off) but values above
// 1_000 are almost certainly user error so we cap there.
export class SetTargetCountDto {
  @IsInt()
  @Min(0)
  @Max(1000)
  count!: number;
}
