import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, ILike, In, Repository } from 'typeorm';

import { CalculatedService } from '../../common/calculated.service';
import {
  AttendanceDayStatus,
  AttendancePunchType,
  AttendanceStatus,
  DriverStatus,
  SiteShift,
} from '../../common/enums';
import { Driver } from '../drivers/driver.entity';
import { Site } from '../sites/site.entity';
import {
  AttendanceQueryDto,
  AttendanceRosterQueryDto,
  CheckInDto,
  CheckOutDto,
  CreateAttendancePunchDto,
  UpdateAttendanceDayDtoNew,
  UpdateAttendanceDto,
  UpdateAttendancePunchDto,
} from './attendance.dto';
import { AttendanceDay } from './attendance-day.entity';
import { AttendancePunch } from './attendance-punch.entity';
import { Attendance } from './attendance.entity';

// Only these statuses are user-settable on a day. Everything else is derived
// from the punch stream and would be clobbered on the next recalculation.
const USER_SETTABLE_DAY_STATUSES = new Set<AttendanceDayStatus>([
  AttendanceDayStatus.EXPECTED,
  AttendanceDayStatus.ON_LEAVE,
]);

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly repo: Repository<Attendance>,
    @InjectRepository(AttendanceDay)
    private readonly days: Repository<AttendanceDay>,
    @InjectRepository(AttendancePunch)
    private readonly punches: Repository<AttendancePunch>,
    @InjectRepository(Driver)
    private readonly drivers: Repository<Driver>,
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
    private readonly calculated: CalculatedService,
  ) {}

  // -------------------------------------------------------------------------
  // Legacy Attendance API (preserved for backwards compatibility).
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Event-log roster API (AttendanceDay + AttendancePunch).
  // -------------------------------------------------------------------------

  // Returns every expected driver on a site for a given date. Missing day
  // rows are created lazily so the caller never has to seed them manually.
  async getRoster(query: AttendanceRosterQueryDto): Promise<AttendanceDay[]> {
    const site = await this.sites.findOne({ where: { id: query.siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${query.siteId} not found`);
    }

    // We match drivers to a site by name because `Driver.homeSite` is a free
    // text field (no FK). Keep this in sync with how drivers are assigned in
    // the UI; if we ever migrate homeSite to a UUID we'd swap this lookup.
    const rosterDrivers = await this.drivers.find({
      where: {
        status: DriverStatus.ACTIVE,
        homeSite: site.name,
      },
    });

    if (rosterDrivers.length > 0) {
      await this.ensureDaysForDrivers(rosterDrivers, site.id, query.date);
    }

    // Re-read so we get the relations (driver, site, punches) in one shot.
    let rows = await this.days.find({
      where: { siteId: query.siteId, date: query.date },
      relations: {
        punches: true,
        driver: { assignedVehicle: true },
        site: true,
      },
      order: { createdAt: 'ASC' },
    });

    // Recalculate derived statuses and persist any that drifted. ON_LEAVE is
    // a manual override and is left alone.
    rows = await this.recalcAndPersistDays(rows);

    if (query.status) {
      rows = rows.filter((day) => day.status === query.status);
    }

    if (query.search) {
      const needle = query.search.toLowerCase();
      rows = rows.filter((day) => {
        const driver = day.driver;
        if (!driver) return false;
        const haystack = [
          driver.firstName,
          driver.lastName,
          driver.employeeId,
          `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim(),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(needle);
      });
    }

    return rows;
  }

  async createPunch(
    dayId: string,
    dto: CreateAttendancePunchDto,
  ): Promise<AttendanceDay> {
    const day = await this.loadDayForWrite(dayId);
    const punchAt = dto.at ? new Date(dto.at) : new Date();
    this.assertPunchAllowed(day.punches ?? [], dto.type);

    const punch = this.punches.create({
      dayId: day.id,
      type: dto.type,
      at: punchAt,
      actorUserId: dto.actorUserId ?? null,
      note: dto.note ?? null,
      isVoided: false,
    });
    await this.punches.save(punch);

    return this.recalcSingleDay(day.id);
  }

  async updateDayNew(
    dayId: string,
    dto: UpdateAttendanceDayDtoNew,
  ): Promise<AttendanceDay> {
    const day = await this.loadDayForWrite(dayId);

    if (dto.status !== undefined) {
      if (!USER_SETTABLE_DAY_STATUSES.has(dto.status)) {
        throw new BadRequestException(
          `Status ${dto.status} is derived from punches and cannot be set directly. ` +
            `Use EXPECTED or ON_LEAVE.`,
        );
      }
      day.status = dto.status;
    }
    if (dto.notes !== undefined) {
      day.notes = dto.notes;
    }
    await this.days.save(day);

    return this.recalcSingleDay(day.id);
  }

  async updatePunch(
    punchId: string,
    dto: UpdateAttendancePunchDto,
  ): Promise<AttendanceDay> {
    const punch = await this.punches.findOne({ where: { id: punchId } });
    if (!punch) {
      throw new NotFoundException(`Attendance punch ${punchId} not found`);
    }
    if (punch.isVoided) {
      throw new BadRequestException(
        `Punch ${punchId} is voided and cannot be edited.`,
      );
    }
    if (dto.at !== undefined) {
      punch.at = new Date(dto.at);
    }
    if (dto.note !== undefined) {
      punch.note = dto.note;
    }
    await this.punches.save(punch);

    return this.recalcSingleDay(punch.dayId);
  }

  // Soft delete: mark the punch voided and append an audit note. We never
  // hard-delete so the event log keeps its full history.
  async voidPunch(punchId: string): Promise<AttendanceDay> {
    const punch = await this.punches.findOne({ where: { id: punchId } });
    if (!punch) {
      throw new NotFoundException(`Attendance punch ${punchId} not found`);
    }
    if (punch.isVoided) {
      // Idempotent: voiding an already-voided punch just returns the day.
      return this.recalcSingleDay(punch.dayId);
    }
    punch.isVoided = true;
    const stamp = new Date().toISOString();
    const auditLine = `voided at ${stamp}`;
    punch.note = punch.note ? `${punch.note} | ${auditLine}` : auditLine;
    await this.punches.save(punch);

    return this.recalcSingleDay(punch.dayId);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  // Create AttendanceDay rows for any drivers that don't have one yet for the
  // given site+date. Uses a single insert with `orIgnore` so concurrent calls
  // are safe against the unique (driverId, siteId, date) index.
  private async ensureDaysForDrivers(
    rosterDrivers: Driver[],
    siteId: string,
    date: string,
  ): Promise<void> {
    const existing = await this.days.find({
      where: {
        siteId,
        date,
        driverId: In(rosterDrivers.map((d) => d.id)),
      },
      select: { driverId: true },
    });
    const have = new Set(existing.map((d) => d.driverId));
    const toCreate = rosterDrivers.filter((d) => !have.has(d.id));
    if (toCreate.length === 0) return;

    const rows = toCreate.map((driver) =>
      this.days.create({
        driverId: driver.id,
        siteId,
        date,
        shift: SiteShift.DAY,
        expected: true,
        status: AttendanceDayStatus.EXPECTED,
      }),
    );
    // orIgnore() guards against the rare race where another roster request
    // creates the same row in between our SELECT and INSERT.
    await this.days
      .createQueryBuilder()
      .insert()
      .into(AttendanceDay)
      .values(rows)
      .orIgnore()
      .execute();
  }

  // Load a day with its punches for a write path. Punches are loaded ordered
  // by `at` ASC so the validation/derivation helpers can scan them in order.
  private async loadDayForWrite(dayId: string): Promise<AttendanceDay> {
    const day = await this.days.findOne({
      where: { id: dayId },
      relations: { punches: true },
    });
    if (!day) {
      throw new NotFoundException(`Attendance day ${dayId} not found`);
    }
    day.punches = (day.punches ?? []).sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    return day;
  }

  // Recalculate one day and return it with full relations so it can be
  // returned to the controller.
  private async recalcSingleDay(dayId: string): Promise<AttendanceDay> {
    const day = await this.days.findOne({
      where: { id: dayId },
      relations: {
        punches: true,
        driver: { assignedVehicle: true },
        site: true,
      },
    });
    if (!day) {
      throw new NotFoundException(`Attendance day ${dayId} not found`);
    }
    const recalculated = await this.recalcAndPersistDays([day]);
    return recalculated[0];
  }

  // Walk a batch of days and update their persisted status to match the
  // derivation rules. ON_LEAVE is sticky — we never overwrite it from punches
  // because it's a manual scheduling decision.
  private async recalcAndPersistDays(
    rows: AttendanceDay[],
  ): Promise<AttendanceDay[]> {
    const today = todayDateKey();
    const dirty: AttendanceDay[] = [];
    for (const day of rows) {
      const next = deriveDayStatus(day, today);
      if (next !== day.status) {
        day.status = next;
        dirty.push(day);
      }
    }
    if (dirty.length > 0) {
      await this.days.save(dirty);
    }
    return rows;
  }

  // Throws BadRequestException if `type` cannot be added to the existing
  // punch stream. Caller is responsible for sorting punches by `at` ASC.
  private assertPunchAllowed(
    existing: AttendancePunch[],
    type: AttendancePunchType,
  ): void {
    const live = existing.filter((p) => !p.isVoided);
    const hasDayIn = live.some((p) => p.type === AttendancePunchType.DAY_IN);
    const hasDayOut = live.some((p) => p.type === AttendancePunchType.DAY_OUT);
    const lunchOpen = countOpen(
      live,
      AttendancePunchType.LUNCH_OUT,
      AttendancePunchType.LUNCH_IN,
    );
    const maintOpen = countOpen(
      live,
      AttendancePunchType.MAINT_OUT,
      AttendancePunchType.MAINT_IN,
    );
    const anyBreakOpen = lunchOpen > 0 || maintOpen > 0;

    switch (type) {
      case AttendancePunchType.DAY_IN:
        if (hasDayIn) {
          throw new BadRequestException('Day already has a DAY_IN punch.');
        }
        // DAY_IN must be the first non-voided event; otherwise the timeline
        // would have a break/out before clock-in which is nonsensical.
        if (live.length > 0) {
          throw new BadRequestException(
            'DAY_IN must be the first punch of the day.',
          );
        }
        return;
      case AttendancePunchType.DAY_OUT:
        if (!hasDayIn) {
          throw new BadRequestException('DAY_OUT requires a prior DAY_IN.');
        }
        if (hasDayOut) {
          throw new BadRequestException('Day already has a DAY_OUT punch.');
        }
        if (anyBreakOpen) {
          throw new BadRequestException(
            'Close any open break (LUNCH_IN / MAINT_IN) before DAY_OUT.',
          );
        }
        return;
      case AttendancePunchType.LUNCH_OUT:
        if (!hasDayIn) {
          throw new BadRequestException('LUNCH_OUT requires a prior DAY_IN.');
        }
        if (hasDayOut) {
          throw new BadRequestException(
            'Cannot start a break after DAY_OUT.',
          );
        }
        if (anyBreakOpen) {
          throw new BadRequestException(
            'Another break is already open; close it before LUNCH_OUT.',
          );
        }
        return;
      case AttendancePunchType.LUNCH_IN:
        if (lunchOpen <= 0) {
          throw new BadRequestException(
            'LUNCH_IN requires an unmatched LUNCH_OUT.',
          );
        }
        return;
      case AttendancePunchType.MAINT_OUT:
        if (!hasDayIn) {
          throw new BadRequestException('MAINT_OUT requires a prior DAY_IN.');
        }
        if (hasDayOut) {
          throw new BadRequestException(
            'Cannot start a maintenance break after DAY_OUT.',
          );
        }
        if (anyBreakOpen) {
          throw new BadRequestException(
            'Another break is already open; close it before MAINT_OUT.',
          );
        }
        return;
      case AttendancePunchType.MAINT_IN:
        if (maintOpen <= 0) {
          throw new BadRequestException(
            'MAINT_IN requires an unmatched MAINT_OUT.',
          );
        }
        return;
      default:
        throw new BadRequestException(`Unknown punch type: ${type}`);
    }
  }
}

// Returns net opens for a paired (out, in) sequence. Positive means there is
// at least one unmatched OUT (i.e. a break is currently open).
function countOpen(
  punches: AttendancePunch[],
  outType: AttendancePunchType,
  inType: AttendancePunchType,
): number {
  let count = 0;
  for (const p of punches) {
    if (p.type === outType) count++;
    else if (p.type === inType) count--;
  }
  return count;
}

// Derive a day's effective status from its non-voided punches. ON_LEAVE is
// a manual override and is preserved as-is (the caller never recomputes it).
function deriveDayStatus(
  day: AttendanceDay,
  today: string,
): AttendanceDayStatus {
  if (day.status === AttendanceDayStatus.ON_LEAVE) {
    return AttendanceDayStatus.ON_LEAVE;
  }
  const live = (day.punches ?? []).filter((p) => !p.isVoided);
  const hasDayIn = live.some((p) => p.type === AttendancePunchType.DAY_IN);
  const hasDayOut = live.some((p) => p.type === AttendancePunchType.DAY_OUT);
  const lunchOpen = countOpen(
    live,
    AttendancePunchType.LUNCH_OUT,
    AttendancePunchType.LUNCH_IN,
  );
  const maintOpen = countOpen(
    live,
    AttendancePunchType.MAINT_OUT,
    AttendancePunchType.MAINT_IN,
  );

  if (!hasDayIn) {
    // A past day with no DAY_IN is unambiguously ABSENT; for today/future we
    // leave it as EXPECTED so the UI can still prompt for a punch-in.
    if (day.date < today) return AttendanceDayStatus.ABSENT;
    return AttendanceDayStatus.EXPECTED;
  }
  if (hasDayOut) return AttendanceDayStatus.DONE;
  if (lunchOpen > 0 || maintOpen > 0) return AttendanceDayStatus.ON_BREAK;
  return AttendanceDayStatus.PRESENT;
}

// YYYY-MM-DD for the server's local day. We compare AttendanceDay.date as
// a string against this; both are stored/returned in the same format.
function todayDateKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
