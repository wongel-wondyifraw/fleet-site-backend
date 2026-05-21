import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { SiteStatus, SiteType } from '../../common/enums';
import { User } from '../users/user.entity';

@Entity({ name: 'sites' })
@Index(['city', 'name'])
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', length: 32, default: SiteType.CONSTRUCTION })
  type!: SiteType;

  @Column({ type: 'varchar', length: 32, default: SiteStatus.PLANNING })
  status!: SiteStatus;

  @Column()
  address!: string;

  @Column()
  city!: string;

  @Column({ type: 'varchar', nullable: true })
  region?: string | null;

  @Column({ type: 'varchar', nullable: true })
  country?: string | null;

  @Column({ type: 'float', nullable: true })
  latitude?: number | null;

  @Column({ type: 'float', nullable: true })
  longitude?: number | null;

  @Column({ type: 'date', nullable: true })
  startDate?: Date | null;

  @Column({ type: 'date', nullable: true })
  endDate?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  managerEmployeeId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactPhone?: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactEmail?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @ManyToMany(() => User, (user) => user.sites)
  users!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
