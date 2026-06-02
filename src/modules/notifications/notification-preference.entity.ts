import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'notification_prefs' })
export class NotificationPreference {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  inAppPerKind!: Record<string, boolean>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  osToastPerKind!: Record<string, boolean>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  webPushPerKind!: Record<string, boolean>;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
