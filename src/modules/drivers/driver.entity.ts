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

import { DriverStatus, LicenseClass } from '../../common/enums';
import { Site } from '../sites/site.entity';
import { Vehicle } from '../vehicles/vehicle.entity';

@Entity({ name: 'drivers' })
@Index(['lastName', 'firstName'])
@Index(['status', 'siteId'])
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  employeeId!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ unique: true })
  licenseNumber!: string;

  @Column({ type: 'varchar', length: 32, default: LicenseClass.PUBLIC_1 })
  licenseClass!: LicenseClass;

  @Column({ type: 'date' })
  licenseExpiry!: Date;

  @Column()
  phoneNumber!: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string | null;

  @Column({ type: 'date' })
  hireDate!: Date;

  @Column({ type: 'varchar', length: 32, default: DriverStatus.ACTIVE })
  status!: DriverStatus;

  @Column({ type: 'uuid', nullable: true })
  assignedVehicleId?: string | null;

  @ManyToOne(() => Vehicle, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedVehicleId' })
  assignedVehicle?: Vehicle | null;

  @Column({ type: 'uuid', nullable: true })
  siteId?: string | null;

  @ManyToOne(() => Site, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'siteId' })
  site?: Site | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
