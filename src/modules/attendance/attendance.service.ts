import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';

import { CalculatedService } from '../../common/calculated.service';
import { AttendanceStatus, SiteShift } from '../../common/enums';
import {
  AttendanceQueryDto,
  CheckInDto,
  CheckOutDto,
  UpdateAttendanceDto,
} from './attendance.dto';
import { Attendance } from './attendance.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly repo: Repository<Attendance>,
    private readonly calculated: CalculatedService,
  ) {}

  async findAll(query: AttendanceQueryDto = {}): Promise<Attendance[]> {
    const where: FindOptionsWhere<Attendance> = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.site) where.siteLocation = query.site;
    if (query.status) where.status = query.status;
    if (query.from && query.to) {
      where.checkInTime = Between(new Date(query.from), new Date(query.to));
    }
    return this.repo.find({
      where,
      relations: { vehicle: true },
      order: { checkInTime: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Attendance> {
    const record = await this.repo.findOne({
      where: { id },
      relations: { vehicle: true },
    });
    if (!record) {
      throw new NotFoundException(`Attendance record ${id} not found`);
    }
    return record;
  }

  async checkIn(dto: CheckInDto): Promise<Attendance> {
    const open = await this.repo.findOne({
      where: {
        employeeId: dto.employeeId,
        status: AttendanceStatus.CHECKED_IN,
      },
    });
    if (open) {
      throw new BadRequestException(
        `Employee ${dto.employeeId} already has an open check-in.`,
      );
    }
    const record = this.repo.create({
      employeeId: dto.employeeId,
      siteLocation: dto.siteLocation,
      vehicleId: dto.vehicleId ?? null,
      shift: dto.shift ?? SiteShift.DAY,
      checkInTime: dto.checkInTime ? new Date(dto.checkInTime) : new Date(),
      status: AttendanceStatus.CHECKED_IN,
      notes: dto.notes ?? null,
    });
    return this.repo.save(record);
  }

  async checkOut(id: string, dto: CheckOutDto): Promise<Attendance> {
    const record = await this.findOne(id);
    if (record.status === AttendanceStatus.CHECKED_OUT) {
      throw new BadRequestException('Attendance is already checked out.');
    }
    record.checkOutTime = dto.checkOutTime
      ? new Date(dto.checkOutTime)
      : new Date();
    record.status = AttendanceStatus.CHECKED_OUT;
    if (dto.notes !== undefined) record.notes = dto.notes;
    return this.repo.save(record);
  }

  async update(id: string, dto: UpdateAttendanceDto): Promise<Attendance> {
    const record = await this.findOne(id);
    Object.assign(record, dto);
    return this.repo.save(record);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Attendance record ${id} not found`);
    }
  }

  async totalHoursForEmployee(
    employeeId: string,
    from?: string,
    to?: string,
  ): Promise<{ employeeId: string; totalHours: number; records: number }> {
    const records = await this.findAll({ employeeId, from, to });
    return {
      employeeId,
      totalHours: this.calculated.computeTotalHours(records),
      records: records.length,
    };
  }
}
