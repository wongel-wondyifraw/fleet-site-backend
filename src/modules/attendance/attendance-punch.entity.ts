import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AttendancePunchType } from '../../common/enums';
import { AttendanceDay } from './attendance-day.entity';

// Append-only event log for a single AttendanceDay. We never hard-delete a
// punch: DELETE flips `isVoided` so the audit trail (who/when/correctedFrom)
// remains intact. `correctedFromPunchId` is set when a new punch supersedes
// a voided one (e.g. timekeeper fixed the wrong DAY_IN time).
@Entity({ name: 'attendance_punches' })
@Index(['dayId', 'at'])
export class AttendancePunch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  dayId!: string;

  @ManyToOne(() => AttendanceDay, (day) => day.punches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dayId' })
  day!: AttendanceDay;

  @Column({ type: 'varchar', length: 16 })
  type!: AttendancePunchType;

  @Column({ type: 'timestamptz' })
  at!: Date;

  @Column({ type: 'uuid', nullable: true })
  actorUserId?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'uuid', nullable: true })
  correctedFromPunchId?: string | null;

  @Column({ type: 'boolean', default: false })
  isVoided!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  // Transient: populated by AttendanceService when serializing roster/history
  // responses so the UI can pre-fill odometer corrections. Not a DB column.
  odometer?: string | null;
}
