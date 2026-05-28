import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

// Per-day override of the global "expected trips per day" target. Only
// dates the user has explicitly customised get a row — every other day
// falls back to the default stored in `app_settings`. The date is the
// primary key so each calendar day can only have one override.
@Entity({ name: 'daily_trip_target_overrides' })
export class DailyTripTargetOverride {
  // YYYY-MM-DD calendar day, stored as DATE so Postgres handles the
  // formatting. The pg driver returns this as a string in YYYY-MM-DD
  // form which lines up with the client-side `toLocalDateKey`.
  @PrimaryColumn({ type: 'date' })
  date!: string;

  // Integer trip count expected for the given day. >= 0 enforced in the
  // DTO; we keep it as a plain int column here.
  @Column({ type: 'int' })
  count!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
