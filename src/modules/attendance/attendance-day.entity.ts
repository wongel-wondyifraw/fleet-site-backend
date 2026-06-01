import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AttendanceDayStatus, SiteShift } from '../../common/enums';
import { Driver } from '../drivers/driver.entity';
import { Site } from '../sites/site.entity';
import { AttendancePunch } from './attendance-punch.entity';

// One row per (driver, site, calendar day). Created lazily by the roster
// endpoint so we never need a nightly batch job — the first time someone
// loads a date for a site, we fill in any missing rows on demand. Status
// is the derived roll-up of the punches plus any manual ON_LEAVE override.
@Entity({ name: 'attendance_days' })
@Index('uq_attendance_day_driver_site_date', ['driverId', 'siteId', 'date'], {
  unique: true,
})
@Index(['siteId', 'date'])
@Index(['driverId', 'date'])
export class AttendanceDay {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  driverId!: string;

  @ManyToOne(() => Driver, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driverId' })
  driver?: Driver | null;

  @Column({ type: 'uuid' })
  siteId!: string;

  @ManyToOne(() => Site, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'siteId' })
  site?: Site | null;

  // YYYY-MM-DD calendar day. The pg driver returns this column as a string in
  // that form which matches the client-side date keys.
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 16, default: SiteShift.DAY })
  shift!: SiteShift;

  // `expected=false` lets us materialise rows for days where the driver isn't
  // scheduled (e.g. a planned day off) without flipping them to ABSENT.
  @Column({ type: 'boolean', default: true })
  expected!: boolean;

  @Column({
    type: 'varchar',
    length: 32,
    default: AttendanceDayStatus.EXPECTED,
  })
  status!: AttendanceDayStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  // Cached "work distance" for the shift, in kilometres. Derived from the
  // odometer readings attached to punches as:
  //   (LUNCH_OUT - DAY_IN) + (DAY_OUT - LUNCH_IN)
  // i.e. the morning leg + the afternoon leg, excluding the lunch window.
  // Recomputed on every punch create/update/void so the fuel module can
  // join on this value without re-running the math itself. Null until we
  // have enough readings to compute it (at minimum DAY_IN + LUNCH_OUT for
  // the morning leg).
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  workDistanceKm?: string | null;

  // When the system auto-closed this day because the driver forgot to
  // punch out (or forgot to return from lunch/maintenance). Null on days
  // that were closed normally. Set lazily on the next read after midnight
  // — see AttendanceService.autoCloseIfStale for the synthesis logic.
  @Column({ type: 'timestamptz', nullable: true })
  autoClosedAt?: Date | null;

  // Comma-separated list of which conditions triggered the auto-close on
  // this day. Values come from a fixed vocabulary so the UI can render a
  // human-friendly badge per reason:
  //   MISSING_DAY_OUT       — driver forgot to punch out for the day
  //   MISSING_LUNCH_RETURN  — driver started lunch but never punched back in
  //   MISSING_MAINT_RETURN  — driver started a maintenance break and never returned
  // Multiple reasons can co-occur (e.g. "MISSING_LUNCH_RETURN,MISSING_DAY_OUT"
  // when the driver left at lunch and never came back).
  @Column({ type: 'varchar', length: 128, nullable: true })
  autoCloseReason?: string | null;

  @OneToMany(() => AttendancePunch, (punch) => punch.day)
  punches!: AttendancePunch[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
