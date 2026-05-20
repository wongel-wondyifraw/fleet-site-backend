import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { FuelType, VehicleStatus, VehicleType } from '../../common/enums';
import { Attendance } from '../attendance/attendance.entity';
import { FuelLog } from '../fuel/fuel-log.entity';

@Entity({ name: 'vehicles' })
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  plateNumber!: string;

  @Column()
  make!: string;

  @Column()
  model!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'varchar', length: 32, default: VehicleType.TRUCK })
  type!: VehicleType;

  @Column({ type: 'varchar', length: 32, default: VehicleStatus.ACTIVE })
  status!: VehicleStatus;

  @Column({ type: 'varchar', length: 16, default: FuelType.DIESEL })
  fuelType!: FuelType;

  @Column({ type: 'float', default: 0 })
  fuelCapacity!: number;

  @Column({ type: 'float', default: 0 })
  currentOdometer!: number;

  @Column({ type: 'varchar', nullable: true })
  assignedSite?: string | null;

  @OneToMany(() => FuelLog, (log) => log.vehicle)
  fuelLogs!: FuelLog[];

  @OneToMany(() => Attendance, (att) => att.vehicle)
  attendanceRecords!: Attendance[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
