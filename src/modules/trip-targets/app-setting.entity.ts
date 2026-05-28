import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

// Lightweight key/value store for global app-wide settings. Kept generic
// (string key, string value) so future settings (logo URL, default
// currency, etc.) can land here without another migration. Today the
// only key we use is `defaultExpectedTripsPerDay`, set by the trip
// targets feature.
@Entity({ name: 'app_settings' })
export class AppSetting {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'varchar', length: 512 })
  value!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
