import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { TripStatus } from '../../common/enums';
import { Driver } from '../drivers/driver.entity';
import { Vehicle } from '../vehicles/vehicle.entity';

@Entity({ name: 'trips' })
@Index(['vehicleId', 'status'])
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  vehicleId!: string;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vehicleId' })
  vehicle!: Vehicle;

  @Column({ type: 'uuid', nullable: true })
  driverId?: string | null;

  @ManyToOne(() => Driver, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driverId' })
  driver?: Driver | null;

  @Column({ type: 'varchar', length: 32, default: TripStatus.PLANNED })
  status!: TripStatus;

  @Column()
  startAddress!: string;

  @Column({ type: 'varchar', nullable: true })
  startCity?: string | null;

  @Column({ type: 'varchar', nullable: true })
  startState?: string | null;

  @Column({ type: 'float', nullable: true })
  startLat?: number | null;

  @Column({ type: 'float', nullable: true })
  startLon?: number | null;

  @Column()
  endAddress!: string;

  @Column({ type: 'varchar', nullable: true })
  endCity?: string | null;

  @Column({ type: 'varchar', nullable: true })
  endState?: string | null;

  @Column({ type: 'float', nullable: true })
  endLat?: number | null;

  @Column({ type: 'float', nullable: true })
  endLon?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt?: Date | null;

  // Stamped automatically when the trip transitions to IN_PROGRESS via the
  // checkout action. Used by the UI to render a live elapsed-time counter
  // and to derive total duration once the trip is completed.
  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  // Stamped automatically when the trip transitions to COMPLETED via the
  // check-in action. Persisted so downstream reporting (timesheets, fuel
  // logs, etc.) can attribute totals to a specific trip window.
  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date | null;

  // Distance travelled for this trip in kilometres. Populated by the
  // client at check-in time (computed from the LocationIQ Directions
  // API, with a haversine straight-line fallback) and then persisted
  // here so the row stat can show the final number without recomputing
  // every time the list is loaded. Nullable so older trips that were
  // never checked in via the new flow keep working.
  @Column({ type: 'float', nullable: true })
  distanceKm?: number | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
