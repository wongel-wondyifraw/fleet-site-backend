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

  @OneToMany(() => AttendancePunch, (punch) => punch.day)
  punches!: AttendancePunch[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
