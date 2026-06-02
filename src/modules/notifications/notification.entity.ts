import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum NotificationKind {
  SYSTEM = 'system',
  TRIP = 'trip',
  FUEL = 'fuel',
  VEHICLE = 'vehicle',
  DRIVER = 'driver',
  ATTENDANCE = 'attendance',
  SITE_HEALTH = 'site_health',
}

export enum NotificationSeverity {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  DANGER = 'danger',
}

@Entity({ name: 'notifications' })
@Index(['userId', 'createdAt', 'id'])
@Index(['userId', 'readAt'])
@Index(['userId', 'dismissedAt'])
@Index(['userId', 'dedupeKey'], { unique: true, where: '"dedupeKey" IS NOT NULL' })
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: NotificationKind;

  @Column({ type: 'varchar', length: 16 })
  severity!: NotificationSeverity;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', nullable: true })
  href?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  dedupeKey?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dismissedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
