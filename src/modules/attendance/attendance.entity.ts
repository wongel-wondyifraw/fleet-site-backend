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

import { AttendanceStatus, SiteShift } from '../../common/enums';
import { Vehicle } from '../vehicles/vehicle.entity';

@Entity({ name: 'attendance' })
@Index(['employeeId', 'checkInTime'])
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  employeeId!: string;

  @Column({ nullable: true })
  vehicleId?: string | null;

  @ManyToOne(() => Vehicle, (vehicle) => vehicle.attendanceRecords, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'vehicleId' })
  vehicle?: Vehicle | null;

  @Column()
  siteLocation!: string;

  @Column({ type: 'varchar', length: 16, default: SiteShift.DAY })
  shift!: SiteShift;

  @Column({ type: 'datetime' })
  checkInTime!: Date;

  @Column({ type: 'datetime', nullable: true })
  checkOutTime?: Date | null;

  @Column({ type: 'varchar', length: 32, default: AttendanceStatus.CHECKED_IN })
  status!: AttendanceStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
