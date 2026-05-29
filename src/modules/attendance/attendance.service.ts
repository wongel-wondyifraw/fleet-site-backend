import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  ILike,
  In,
  IsNull,
  Repository,
} from 'typeorm';

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
  AttendanceDriverHistoryQueryDto,
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
import { OdometerReading } from './odometer-reading.entity';

// Only these statuses are user-settable on a day. Everything else is derived
// from the punch stream and would be clobbered on the next recalculation.
const USER_SETTABLE_DAY_STATUSES = new Set<AttendanceDayStatus>([
  AttendanceDayStatus.EXPECTED,
  AttendanceDayStatus.ON_LEAVE,
]);

// Auto-close reason codes persisted on AttendanceDay.autoCloseReason. The
// frontend reads these codes to render a per-reason warning badge so the
// timekeeper knows which event was synthesised by the system vs. recorded
// by a human.
const AUTO_CLOSE_MISSING_DAY_OUT = 'MISSING_DAY_OUT';
const AUTO_CLOSE_MISSING_LUNCH_RETURN = 'MISSING_LUNCH_RETURN';
const AUTO_CLOSE_MISSING_MAINT_RETURN = 'MISSING_MAINT_RETURN';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly repo: Repository<Attendance>,
    @InjectRepository(AttendanceDay)
    private readonly days: Repository<AttendanceDay>,
    @InjectRepository(AttendancePunch)
    private readonly punches: Repository<AttendancePunch>,
    @InjectRepository(OdometerReading)
    private readonly odometerReadings: Repository<OdometerReading>,
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

  // Returns every AttendanceDay row for `driverId` between `from` and `to`
  // (inclusive), ordered chronologically with punches eager-loaded. Used by
  // the per-driver detail page to render a date-range timeline, working-
  // hours chart, and the absent / late / missed-punch tallies.
  //
  // We deliberately don't materialise rows for missing dates here — those
  // are still created lazily by the roster endpoint on first view. This
  // keeps the read cheap and avoids inserting a week's worth of EXPECTED
  // rows the first time someone scrolls back through history.
  //
  // recalcAndPersistDays runs on the result so any stale past-dated rows
  // get auto-closed (DAY_OUT / LUNCH_IN synthesised at end-of-day) and
  // their status / workDistanceKm are refreshed in the same response.
  async getDriverHistory(
    driverId: string,
    query: AttendanceDriverHistoryQueryDto,
  ): Promise<{ driver: Driver | null; days: AttendanceDay[] }> {
    const driver = await this.drivers.findOne({
      where: { id: driverId },
      relations: { assignedVehicle: true },
    });
    if (!driver) {
      throw new NotFoundException(`Driver ${driverId} not found`);
    }

    // We sort punches inside each day on the query so the frontend can
    // walk them in chronological order without re-sorting.
    let days = await this.days
      .createQueryBuilder('day')
      .leftJoinAndSelect('day.punches', 'punch')
      .leftJoinAndSelect('day.site', 'site')
      .where('day.driverId = :driverId', { driverId })
      .andWhere('day.date >= :from', { from: query.from })
      .andWhere('day.date <= :to', { to: query.to })
      .orderBy('day.date', 'ASC')
      .addOrderBy('punch.at', 'ASC')
      .getMany();

    days = await this.recalcAndPersistDays(days);
    return { driver, days };
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

    // Persist the odometer reading (if any) in the same logical operation
    // as the punch. We don't wrap them in an explicit DB transaction here
    // because the unique index on (punchId) is the real safety net — even
    // if the reading insert fails we still have a valid punch, and the
    // distance recompute below simply skips the missing reading.
    if (dto.odometer !== undefined && dto.odometer !== null) {
      const driverIdForReading = day.driverId;
      const vehicleIdForReading = day.driver?.assignedVehicleId ?? null;
      const reading = this.odometerReadings.create({
        punchId: punch.id,
        dayId: day.id,
        driverId: driverIdForReading,
        vehicleId: vehicleIdForReading,
        punchType: dto.type,
        value: dto.odometer.toFixed(2),
        capturedAt: punchAt,
      });
      await this.odometerReadings.save(reading);
    }

    await this.recomputeWorkDistance(day.id);
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
      // Keep the linked odometer reading's capturedAt in lockstep with the
      // punch time so timestamps stay consistent across the two tables.
      await this.odometerReadings.update(
        { punchId: punch.id },
        { capturedAt: punch.at },
      );
    }
    if (dto.note !== undefined) {
      punch.note = dto.note;
    }
    await this.punches.save(punch);

    await this.recomputeWorkDistance(punch.dayId);
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

    // A voided punch's odometer reading is also removed from the distance
    // calculation. We delete the reading row outright (rather than soft-
    // flagging it) because nothing else points at it — the fuel module
    // only consumes readings tied to live punches.
    await this.odometerReadings.delete({ punchId: punch.id });

    await this.recomputeWorkDistance(punch.dayId);
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
  // The `driver` relation is included so we can resolve the driver's current
  // vehicle when persisting odometer readings against the new punch.
  private async loadDayForWrite(dayId: string): Promise<AttendanceDay> {
    const day = await this.days.findOne({
      where: { id: dayId },
      relations: { punches: true, driver: true },
    });
    if (!day) {
      throw new NotFoundException(`Attendance day ${dayId} not found`);
    }
    day.punches = (day.punches ?? []).sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    return day;
  }

  // Recompute and persist the AttendanceDay.workDistanceKm cache from the
  // odometer readings on this day's *live* (non-voided) punches.
  //
  // Default formula (per the product spec, when the driver took a lunch
  // break and the reading was captured on both lunch punches):
  //   total = (LUNCH_OUT - DAY_IN) + (DAY_OUT - LUNCH_IN)
  //
  // Fallback (no lunch readings at all): if the driver skipped the lunch
  // punches entirely we can't split the day into two legs, so we fall
  // back to the simpler whole-shift distance:
  //   total = DAY_OUT - DAY_IN
  //
  // We use the latest reading per punch type (matching how the UI picks
  // the latest non-voided punch). A leg with a missing endpoint
  // contributes zero. Negative legs (odometer went down — usually a
  // typo) also contribute zero so a single bad reading can't make the
  // total look like a refund.
  private async recomputeWorkDistance(dayId: string): Promise<void> {
    const day = await this.days.findOne({ where: { id: dayId } });
    if (!day) return;

    // Pull only readings whose underlying punch is still live. A voided
    // punch's reading is normally deleted by voidPunch, but we double
    // check here in case the row predates that behaviour or was inserted
    // by hand.
    const livePunchIds = (
      await this.punches.find({
        where: { dayId, isVoided: false },
        select: { id: true, type: true },
      })
    ).map((p) => p.id);

    if (livePunchIds.length === 0) {
      if (day.workDistanceKm !== null && day.workDistanceKm !== undefined) {
        await this.days.update({ id: dayId }, { workDistanceKm: null });
      }
      return;
    }

    const readings = await this.odometerReadings.find({
      where: { dayId, punchId: In(livePunchIds) },
      order: { capturedAt: 'ASC' },
    });

    const latestByType = new Map<AttendancePunchType, number>();
    for (const r of readings) {
      // numeric columns come back as strings from pg; parseFloat is fine
      // because we already validated decimals at the DTO layer.
      const num = parseFloat(r.value);
      if (Number.isFinite(num)) {
        latestByType.set(r.punchType, num);
      }
    }

    const dayInVal = latestByType.get(AttendancePunchType.DAY_IN);
    const dayOutVal = latestByType.get(AttendancePunchType.DAY_OUT);
    const lunchOutVal = latestByType.get(AttendancePunchType.LUNCH_OUT);
    const lunchInVal = latestByType.get(AttendancePunchType.LUNCH_IN);

    // Edge case: driver never punched lunch (so neither LUNCH_OUT nor
    // LUNCH_IN have readings). We use the whole-shift distance instead of
    // returning zero, otherwise a clean DAY_IN+DAY_OUT day with valid
    // readings would silently show 0 km.
    const noLunchReadings =
      lunchOutVal === undefined && lunchInVal === undefined;

    let total = 0;
    if (noLunchReadings) {
      total = legDistance(dayInVal, dayOutVal);
    } else {
      const morning = legDistance(dayInVal, lunchOutVal);
      const afternoon = legDistance(lunchInVal, dayOutVal);
      total = morning + afternoon;
    }

    // null when we have no contributing readings at all, so the UI can
    // distinguish "no data yet" from "zero kilometres driven".
    const next = readings.length === 0 ? null : total.toFixed(2);

    if (day.workDistanceKm !== next) {
      await this.days.update({ id: dayId }, { workDistanceKm: next });
    }
  }

  // Auto-close a stale AttendanceDay by synthesising end-of-day punches
  // when the driver left it open. Runs lazily on every roster read (via
  // recalcAndPersistDays) so a day that ends without a DAY_OUT — or a
  // lunch / maintenance break that was never closed — gets cleaned up
  // the next time anyone looks at it.
  //
  // Three scenarios are handled:
  //   1. DAY_IN exists, no DAY_OUT      → synthesise DAY_OUT @ 23:59:59
  //   2. LUNCH_OUT open (no LUNCH_IN)   → synthesise LUNCH_IN @ 23:59:59
  //                                       (and DAY_OUT too if also missing —
  //                                       a driver who never returned from
  //                                       lunch obviously never punched out)
  //   3. MAINT_OUT open (no MAINT_IN)   → synthesise MAINT_IN @ 23:59:59
  //
  // Synthesised punches carry an audit note and bypass assertPunchAllowed
  // because we control the conditions. They do NOT carry an odometer
  // reading — the system has no way to know what the dashboard said at
  // the time, so the afternoon leg's distance gracefully degrades to 0.
  //
  // The autoClosedAt + autoCloseReason columns are flipped in a single
  // UPDATE ... WHERE autoClosedAt IS NULL so concurrent roster reads
  // won't both insert the same synthesised punches.
  private async autoCloseIfStale(day: AttendanceDay): Promise<AttendanceDay> {
    // Today / future days are never auto-closed — the driver might still
    // punch out before midnight. We compare the date strings directly
    // (both are YYYY-MM-DD in server local time).
    if (day.date >= todayDateKey()) return day;
    if (day.autoClosedAt) return day;

    const live = (day.punches ?? []).filter((p) => !p.isVoided);
    const hasDayIn = live.some((p) => p.type === AttendancePunchType.DAY_IN);
    const hasDayOut = live.some((p) => p.type === AttendancePunchType.DAY_OUT);
    const lunchOpen =
      countOpen(
        live,
        AttendancePunchType.LUNCH_OUT,
        AttendancePunchType.LUNCH_IN,
      ) > 0;
    const maintOpen =
      countOpen(
        live,
        AttendancePunchType.MAINT_OUT,
        AttendancePunchType.MAINT_IN,
      ) > 0;

    // No DAY_IN means there's nothing to close — deriveDayStatus will
    // mark this as ABSENT instead, which is the correct signal.
    if (!hasDayIn) return day;

    // Already a normal-looking day: closed DAY_OUT, no open breaks. Skip.
    if (hasDayOut && !lunchOpen && !maintOpen) return day;

    const reasons: string[] = [];
    const synthesised: AttendancePunch[] = [];
    // 23:59:59.999 in server local time of the day's date. Mirrors what a
    // midnight cron job would have produced.
    const endOfDay = new Date(`${day.date}T23:59:59.999`);

    if (lunchOpen) {
      synthesised.push(
        this.punches.create({
          dayId: day.id,
          type: AttendancePunchType.LUNCH_IN,
          at: endOfDay,
          note: 'auto-closed: driver did not return from lunch',
          isVoided: false,
        }),
      );
      reasons.push(AUTO_CLOSE_MISSING_LUNCH_RETURN);
    }
    if (maintOpen) {
      synthesised.push(
        this.punches.create({
          dayId: day.id,
          type: AttendancePunchType.MAINT_IN,
          at: endOfDay,
          note: 'auto-closed: driver did not return from maintenance',
          isVoided: false,
        }),
      );
      reasons.push(AUTO_CLOSE_MISSING_MAINT_RETURN);
    }
    if (!hasDayOut) {
      synthesised.push(
        this.punches.create({
          dayId: day.id,
          type: AttendancePunchType.DAY_OUT,
          at: endOfDay,
          note: 'auto-closed: driver did not punch out',
          isVoided: false,
        }),
      );
      reasons.push(AUTO_CLOSE_MISSING_DAY_OUT);
    }

    if (synthesised.length === 0) return day;

    const closedAt = new Date();
    const reasonString = reasons.join(',');

    // Atomic-ish marker: only the first concurrent request that flips
    // autoClosedAt from NULL to a value gets to insert the synthesised
    // punches. The losers see affected === 0 and bail out gracefully.
    const claim = await this.days.update(
      { id: day.id, autoClosedAt: IsNull() },
      { autoClosedAt: closedAt, autoCloseReason: reasonString },
    );
    if (!claim.affected) return day;

    await this.punches.save(synthesised);

    // Reflect the new state on the in-memory entity so the caller (and
    // deriveDayStatus / the roster response) sees the synthesised punches
    // without an extra DB round-trip.
    day.autoClosedAt = closedAt;
    day.autoCloseReason = reasonString;
    day.punches = [...(day.punches ?? []), ...synthesised].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );

    // Synthesised punches don't have odometer readings, but recomputing
    // the cache still matters when the missing-lunch fallback kicks in
    // (see recomputeWorkDistance), so re-run it here.
    await this.recomputeWorkDistance(day.id);
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
  //
  // Past-dated days are first run through autoCloseIfStale so any open
  // breaks / missing DAY_OUT get synthesised end-of-day punches before
  // the status is derived. This makes the "missing data" cases visible
  // in the roster as DONE + an autoClosedAt flag rather than a stuck
  // PRESENT/ON_BREAK row that never resolves.
  private async recalcAndPersistDays(
    rows: AttendanceDay[],
  ): Promise<AttendanceDay[]> {
    const today = todayDateKey();
    for (const day of rows) {
      if (day.date < today && !day.autoClosedAt) {
        // autoCloseIfStale mutates day.punches / day.autoClosedAt in-place
        // so the subsequent deriveDayStatus call sees the updated state.
        await this.autoCloseIfStale(day);
      }
    }

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
        // A replacement DAY_IN is valid after the original DAY_IN was voided.
        // Other later punches may still exist on the audit timeline, so the
        // invariant we actually need is "only one live DAY_IN", not "DAY_IN
        // is physically the first remaining live punch".
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

// Distance for a single leg of the work-distance calculation. Returns 0
// when either reading is missing, when they're equal (driver didn't
// move), or when the result would be negative (almost always a typo —
// odometers only count up).
function legDistance(from: number | undefined, to: number | undefined): number {
  if (from === undefined || to === undefined) return 0;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const delta = to - from;
  return delta > 0 ? delta : 0;
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
