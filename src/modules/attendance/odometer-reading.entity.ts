import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AttendancePunchType } from '../../common/enums';
import { Driver } from '../drivers/driver.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { AttendanceDay } from './attendance-day.entity';
import { AttendancePunch } from './attendance-punch.entity';

// Captures the vehicle's odometer at the moment of a clock event so the
// downstream fuel module can compute distance-burnt-per-litre per shift.
//
// One reading per non-voided punch is the rule we enforce at the service
// layer (`@Index unique`). We denormalise `driverId` and `punchType` here
// so simple queries (e.g. "give me every DAY_IN reading this month") don't
// have to JOIN through AttendancePunch every time.
@Entity({ name: 'odometer_readings' })
@Index('uq_odometer_reading_punch', ['punchId'], { unique: true })
@Index(['dayId'])
@Index(['driverId', 'capturedAt'])
export class OdometerReading {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // FK to the punch this reading was captured against. Cascading delete
  // mirrors AttendancePunch -> AttendanceDay so a hard-deleted day cleans
  // up its punches *and* their readings in one shot.
  @Column({ type: 'uuid' })
  punchId!: string;

  @ManyToOne(() => AttendancePunch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'punchId' })
  punch?: AttendancePunch;

  @Column({ type: 'uuid' })
  dayId!: string;

  @ManyToOne(() => AttendanceDay, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dayId' })
  day?: AttendanceDay;

  @Column({ type: 'uuid' })
  driverId!: string;

  @ManyToOne(() => Driver, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driverId' })
  driver?: Driver | null;

  // Vehicle the driver was operating at the time. Nullable because a driver
  // might not have a vehicle assigned for a shift (rare, but allowed by the
  // Driver entity), in which case we still record the reading from whatever
  // odometer the timekeeper read off the dash.
  @Column({ type: 'uuid', nullable: true })
  vehicleId?: string | null;

  @ManyToOne(() => Vehicle, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'vehicleId' })
  vehicle?: Vehicle | null;

  // Denormalised punch type for faster filtering (DAY_IN / LUNCH_OUT / ...).
  @Column({ type: 'varchar', length: 16 })
  punchType!: AttendancePunchType;

  // Odometer reading in kilometres. `numeric(12,2)` lets us store mileage
  // up to 9,999,999,999.99 km with two decimals — more than enough headroom
  // for any vehicle's lifetime odometer.
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  value!: string;

  // When the reading was captured. Mirrors the punch's `at` timestamp in
  // the normal path; lives on this row so the fuel module can query
  // readings without joining back to the punch table.
  @Column({ type: 'timestamptz' })
  capturedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
