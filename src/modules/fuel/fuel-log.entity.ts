import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { FuelType } from '../../common/enums';
import { Vehicle } from '../vehicles/vehicle.entity';

@Entity({ name: 'fuel_logs' })
@Index(['vehicleId', 'fillDate'])
@Index(['fillDate', 'id'])
export class FuelLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  vehicleId!: string;

  @ManyToOne(() => Vehicle, (vehicle) => vehicle.fuelLogs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vehicleId' })
  vehicle!: Vehicle;

  @Column()
  driverId!: string;

  @Column({ type: 'varchar', length: 16, default: FuelType.DIESEL })
  fuelType!: FuelType;

  @Column({ type: 'float' })
  liters!: number;

  @Column({ type: 'float' })
  cost!: number;

  @Column({ type: 'float' })
  odometerReading!: number;

  @Column({ type: 'timestamptz' })
  fillDate!: Date;

  @Column({ type: 'varchar', nullable: true })
  station?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
