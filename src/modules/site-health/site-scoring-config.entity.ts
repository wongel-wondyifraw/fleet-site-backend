import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { SiteScoringConfigData } from './site-health.types';

export const SITE_SCORING_CONFIG_ID = 'global';

@Entity({ name: 'site_scoring_config' })
export class SiteScoringConfig {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id!: string;

  @Column({ type: 'jsonb' })
  config!: SiteScoringConfigData;

  @Column({ type: 'uuid', nullable: true })
  updatedByUserId?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
