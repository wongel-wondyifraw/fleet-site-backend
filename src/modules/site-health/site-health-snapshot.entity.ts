import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Site } from '../sites/site.entity';
import { SiteHealthStatus } from './site-health-status.enum';
import type {
  SiteHealthDimensionsJson,
  SiteHealthFuelJson,
  SiteHealthTripsJson,
  SiteHealthTrucksJson,
} from './site-health.types';

@Entity({ name: 'site_health_snapshots' })
export class SiteHealthSnapshot {
  @PrimaryColumn({ type: 'uuid' })
  siteId!: string;

  @ManyToOne(() => Site, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'siteId' })
  site?: Site;

  /** YYYY-MM-DD calendar day scored. */
  @PrimaryColumn({ type: 'date' })
  date!: string;

  @Column({ type: 'float', nullable: true })
  score?: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  status?: SiteHealthStatus | null;

  @Column({ type: 'jsonb' })
  dimensions!: SiteHealthDimensionsJson;

  @Column({ type: 'jsonb' })
  trucks!: SiteHealthTrucksJson;

  @Column({ type: 'jsonb' })
  trips!: SiteHealthTripsJson;

  @Column({ type: 'jsonb' })
  fuel!: SiteHealthFuelJson;

  @Column({ type: 'boolean', default: false })
  insufficientData!: boolean;

  @Column({ type: 'timestamptz' })
  computedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
