import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'notification_prefs' })
export class NotificationPreference {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  // Master switch the settings UI drives. When false, the server skips
  // creating notifications for this user entirely — no bell entry, no SSE
  // push, no OS toast, no web push. The per-kind maps below still gate
  // individual channels when this flag is true, but until the user has
  // explicitly opted in they receive nothing.
  @Column({ type: 'boolean', default: false })
  notificationsEnabled!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  inAppPerKind!: Record<string, boolean>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  osToastPerKind!: Record<string, boolean>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  webPushPerKind!: Record<string, boolean>;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
