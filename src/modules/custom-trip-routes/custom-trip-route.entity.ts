import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// A reusable, admin-defined start -> end pairing surfaced on the
// Trip-creation form as a "Custom" preset. The start and end are
// captured as Name + City + State (no lat/lon) and the manually
// entered driving distance between them is persisted so the trip
// form can reuse it without a routing API round-trip.
@Entity({ name: 'custom_trip_routes' })
@Index(['startName', 'endName'])
export class CustomTripRoute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  startName!: string;

  // City / state are persisted silently — the trip-creation autocomplete
  // populates them from LocationIQ when available, but the settings UI
  // no longer asks the admin to fill them in directly. Nullable so older
  // rows (and form submissions that don't carry them) stay valid.
  @Column({ type: 'varchar', length: 128, nullable: true })
  startCity?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  startState?: string | null;

  @Column({ type: 'varchar', length: 128 })
  endName!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  endCity?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  endState?: string | null;

  // Driving distance the admin recorded for this route in kilometres.
  // Float so half-kilometre precision is possible (e.g. 12.5 km).
  @Column({ type: 'float' })
  distanceKm!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
