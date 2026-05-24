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

  @Column()
  state!: string;

  @ManyToMany(() => User, (user) => user.sites)
  users!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
