import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets } from 'typeorm';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { SiteScopeService } from '../../common/site-scope/site-scope.service';
import { TripStatus, AttendancePunchType } from '../../common/enums';
import { AttendanceDay } from '../attendance/attendance-day.entity';
import { AttendancePunch } from '../attendance/attendance-punch.entity';
import { AttendanceRulesService } from '../attendance-rules/attendance-rules.service';
import {
  evaluateDayScheduleCompliance,
  type DayScheduleFlags,
} from '../site-health/schedule-compliance.util';
import { FuelLog } from '../fuel/fuel-log.entity';
import { Site } from '../sites/site.entity';
import { Trip } from '../trips/trip.entity';
import { User } from '../users/user.entity';
import {
  FleetActivityExportFormat,
  FleetActivityQueryDto,
} from './report.dto';

export interface FleetActivitySiteRow {
  siteId: string;
  siteName: string;
  tripsCompleted: number;
  tripsStarted: number;
  fuelLiters: number;
  fuelCost: number;
  checkIns: number;
  checkOuts: number;
}

export interface FleetActivitySnapshot {
  windowStart: string;
  windowEnd: string;
  totals: {
    tripsCompleted: number;
    tripsStarted: number;
    fuelLiters: number;
    fuelCost: number;
    checkIns: number;
    checkOuts: number;
    activeSites: number;
  };
  perSite: FleetActivitySiteRow[];
}

export interface AttendanceDetailRow {
  date: string;
  driverName: string;
  employeeId: string;
  shift: string;
  status: string;
  dayIn: string | null;
  dayOut: string | null;
  lunchOut: string | null;
  lunchIn: string | null;
  lateCheckIn: boolean;
  earlyCheckIn: boolean;
  missedCheckIn: boolean;
  missedCheckOut: boolean;
  lateCheckOut: boolean;
  workDistanceKm: number | null;
  autoCloseReason: string | null;
}

export interface TripDetailRow {
  date: string;
  vehicle: string;
  driver: string;
  status: string;
  from: string;
  to: string;
  distanceKm: number | null;
}

export interface FuelDetailRow {
  date: string;
  vehicle: string;
  fuelType: string;
  liters: number;
  cost: number;
  station: string | null;
  odometer: number;
}

export interface SiteDetail {
  siteId: string;
  siteName: string;
  summary: FleetActivitySiteRow;
  lateCheckIns: number;
  missedCheckIns: number;
  attendance: AttendanceDetailRow[];
  trips: TripDetailRow[];
  fuel: FuelDetailRow[];
}

export interface FleetActivityDetailed {
  snapshot: FleetActivitySnapshot;
  sites: SiteDetail[];
}

const DEFAULT_RANGE_DAYS = 7;

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Trip)
    private readonly trips: Repository<Trip>,
    @InjectRepository(FuelLog)
    private readonly fuelLogs: Repository<FuelLog>,
    @InjectRepository(AttendancePunch)
    private readonly punches: Repository<AttendancePunch>,
    @InjectRepository(AttendanceDay)
    private readonly attendanceDays: Repository<AttendanceDay>,
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
    private readonly siteScope: SiteScopeService,
    private readonly attendanceRules: AttendanceRulesService,
  ) {}

  async buildFleetActivity(
    user: User,
    query: FleetActivityQueryDto,
  ): Promise<FleetActivitySnapshot> {
    const { windowStart, windowEnd } = this.resolveWindow(query);
    const filterSiteIds = this.resolveFilterSiteIds(user, query.siteIds);

    const allSites = await this.sites.find();
    const siteNameById = new Map(allSites.map((s) => [s.id, s.name]));

    const completedTrips = await this.fetchCompletedTrips(
      windowStart,
      windowEnd,
      filterSiteIds,
    );
    const startedTrips = await this.fetchStartedTrips(
      windowStart,
      windowEnd,
      filterSiteIds,
    );
    const fuelLogs = await this.fetchFuelLogs(
      windowStart,
      windowEnd,
      filterSiteIds,
    );
    const punchRows = await this.fetchPunches(
      windowStart,
      windowEnd,
      filterSiteIds,
    );

    const perSiteMap = new Map<string, FleetActivitySiteRow>();
    const upsertSite = (siteId: string | null | undefined): FleetActivitySiteRow => {
      const id = siteId ?? 'unassigned';
      const name = (siteId && siteNameById.get(siteId)) || 'Unassigned';
      let entry = perSiteMap.get(id);
      if (!entry) {
        entry = {
          siteId: id,
          siteName: name,
          tripsCompleted: 0,
          tripsStarted: 0,
          fuelLiters: 0,
          fuelCost: 0,
          checkIns: 0,
          checkOuts: 0,
        };
        perSiteMap.set(id, entry);
      }
      return entry;
    };

    for (const trip of completedTrips) {
      upsertSite(trip.vehicle?.siteId ?? null).tripsCompleted += 1;
    }
    for (const trip of startedTrips) {
      if (trip.status === TripStatus.CANCELLED) continue;
      upsertSite(trip.vehicle?.siteId ?? null).tripsStarted += 1;
    }
    for (const log of fuelLogs) {
      const entry = upsertSite(log.vehicle?.siteId ?? null);
      entry.fuelLiters += Number(log.liters) || 0;
      entry.fuelCost += Number(log.cost) || 0;
    }
    for (const punch of punchRows) {
      const entry = upsertSite(punch.day?.siteId ?? null);
      if (punch.type === AttendancePunchType.DAY_IN) entry.checkIns += 1;
      else if (punch.type === AttendancePunchType.DAY_OUT) entry.checkOuts += 1;
    }

    const perSite = [...perSiteMap.values()].sort((a, b) =>
      a.siteName.localeCompare(b.siteName),
    );

    const totals = perSite.reduce(
      (acc, row) => ({
        tripsCompleted: acc.tripsCompleted + row.tripsCompleted,
        tripsStarted: acc.tripsStarted + row.tripsStarted,
        fuelLiters: acc.fuelLiters + row.fuelLiters,
        fuelCost: acc.fuelCost + row.fuelCost,
        checkIns: acc.checkIns + row.checkIns,
        checkOuts: acc.checkOuts + row.checkOuts,
        activeSites: acc.activeSites,
      }),
      {
        tripsCompleted: 0,
        tripsStarted: 0,
        fuelLiters: 0,
        fuelCost: 0,
        checkIns: 0,
        checkOuts: 0,
        activeSites: perSite.filter((s) => this.isSiteActive(s)).length,
      },
    );

    return {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      totals,
      perSite,
    };
  }

  /**
   * Richer variant used by the Excel export: in addition to the per-site
   * summary it returns the underlying attendance days (with schedule
   * compliance flags like late check-ins), trips, and fuel rows so the
   * workbook can render one detailed sheet per site.
   */
  async buildDetailed(
    user: User,
    query: FleetActivityQueryDto,
  ): Promise<FleetActivityDetailed> {
    const snapshot = await this.buildFleetActivity(user, query);

    const { windowStart, windowEnd } = this.resolveWindow(query);
    const filterSiteIds = this.resolveFilterSiteIds(user, query.siteIds);
    const fromKey = this.toDateKey(windowStart);
    const toKey = this.toDateKey(windowEnd);
    const todayKey = this.toDateKey(new Date());

    const rules = await this.attendanceRules.getRules();

    const [attendanceDays, trips, fuelLogs] = await Promise.all([
      this.fetchAttendanceDaysDetailed(fromKey, toKey, filterSiteIds),
      this.fetchTripsDetailed(windowStart, windowEnd, filterSiteIds),
      this.fetchFuelLogsDetailed(windowStart, windowEnd, filterSiteIds),
    ]);

    const detailBySite = new Map<string, SiteDetail>();
    const summaryById = new Map(snapshot.perSite.map((s) => [s.siteId, s]));
    const ensureSite = (
      siteId: string | null | undefined,
      fallbackName?: string | null,
    ): SiteDetail => {
      const id = siteId ?? 'unassigned';
      let entry = detailBySite.get(id);
      if (!entry) {
        const summary = summaryById.get(id);
        entry = {
          siteId: id,
          siteName: summary?.siteName ?? fallbackName ?? 'Unassigned',
          summary:
            summary ?? {
              siteId: id,
              siteName: fallbackName ?? 'Unassigned',
              tripsCompleted: 0,
              tripsStarted: 0,
              fuelLiters: 0,
              fuelCost: 0,
              checkIns: 0,
              checkOuts: 0,
            },
          lateCheckIns: 0,
          missedCheckIns: 0,
          attendance: [],
          trips: [],
          fuel: [],
        };
        detailBySite.set(id, entry);
      }
      return entry;
    };

    for (const day of attendanceDays) {
      const entry = ensureSite(day.siteId, day.site?.name);
      const livePunches = (day.punches ?? []).map((p) => ({
        type: p.type,
        at: p.at instanceof Date ? p.at.toISOString() : String(p.at),
        isVoided: p.isVoided,
      }));
      const flags: DayScheduleFlags = evaluateDayScheduleCompliance(
        { status: day.status, date: day.date, punches: livePunches },
        rules,
        todayKey,
      );
      const driverName = day.driver
        ? `${day.driver.firstName} ${day.driver.lastName}`.trim()
        : 'Unknown driver';
      entry.attendance.push({
        date: day.date,
        driverName,
        employeeId: day.driver?.employeeId ?? '',
        shift: day.shift,
        status: day.status,
        dayIn: this.punchTime(day.punches, AttendancePunchType.DAY_IN, 'first'),
        dayOut: this.punchTime(day.punches, AttendancePunchType.DAY_OUT, 'last'),
        lunchOut: this.punchTime(
          day.punches,
          AttendancePunchType.LUNCH_OUT,
          'first',
        ),
        lunchIn: this.punchTime(
          day.punches,
          AttendancePunchType.LUNCH_IN,
          'last',
        ),
        lateCheckIn: flags.lateCheckIn,
        earlyCheckIn: flags.earlyCheckIn,
        missedCheckIn: flags.missedCheckIn,
        missedCheckOut: flags.missedCheckOut,
        lateCheckOut: flags.lateCheckOut,
        workDistanceKm:
          day.workDistanceKm != null ? Number(day.workDistanceKm) : null,
        autoCloseReason: day.autoCloseReason ?? null,
      });
      if (flags.lateCheckIn) entry.lateCheckIns += 1;
      if (flags.missedCheckIn) entry.missedCheckIns += 1;
    }

    for (const trip of trips) {
      const entry = ensureSite(trip.vehicle?.siteId ?? null);
      const when = trip.completedAt ?? trip.startedAt ?? trip.scheduledAt ?? null;
      entry.trips.push({
        date: when ? this.toDateTimeLabel(when) : '',
        vehicle:
          trip.vehicle?.assetNumber ||
          trip.vehicle?.plateNumber ||
          'Unknown vehicle',
        driver: trip.driver
          ? `${trip.driver.firstName} ${trip.driver.lastName}`.trim()
          : '',
        status: trip.status,
        from: trip.startAddress,
        to: trip.endAddress,
        distanceKm: trip.distanceKm ?? null,
      });
    }

    for (const log of fuelLogs) {
      const entry = ensureSite(log.vehicle?.siteId ?? null);
      entry.fuel.push({
        date: this.toDateTimeLabel(log.fillDate),
        vehicle:
          log.vehicle?.assetNumber ||
          log.vehicle?.plateNumber ||
          'Unknown vehicle',
        fuelType: log.fuelType,
        liters: Number(log.liters) || 0,
        cost: Number(log.cost) || 0,
        station: log.station ?? null,
        odometer: Number(log.odometerReading) || 0,
      });
    }

    const sites = [...detailBySite.values()].sort((a, b) =>
      a.siteName.localeCompare(b.siteName),
    );

    return { snapshot, sites };
  }

  async toXlsx(detailed: FleetActivityDetailed): Promise<Buffer> {
    const { snapshot, sites } = detailed;
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();

    this.buildSummarySheet(workbook, snapshot, sites);

    const usedNames = new Set<string>(['Summary']);
    for (const site of sites) {
      this.buildSiteSheet(workbook, site, snapshot, usedNames);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildSummarySheet(
    workbook: ExcelJS.Workbook,
    snapshot: FleetActivitySnapshot,
    sites: SiteDetail[],
  ): void {
    const sheet = workbook.addWorksheet('Summary');
    sheet.mergeCells('A1:I1');
    const title = sheet.getCell('A1');
    title.value = 'Fleet Activity Report';
    title.font = { bold: true, size: 16 };
    sheet.mergeCells('A2:I2');
    sheet.getCell('A2').value = `Period: ${snapshot.windowStart.slice(
      0,
      10,
    )} to ${snapshot.windowEnd.slice(0, 10)}`;

    const headerRowIndex = 4;
    const headers = [
      'Site',
      'Trips Completed',
      'Trips Started',
      'Fuel (L)',
      'Fuel Cost',
      'Check-ins',
      'Check-outs',
      'Late Check-ins',
      'Missed Check-ins',
    ];
    const headerRow = sheet.getRow(headerRowIndex);
    headers.forEach((h, i) => {
      headerRow.getCell(i + 1).value = h;
    });
    headerRow.font = { bold: true };

    const lateBySite = new Map(
      sites.map((s) => [s.siteId, { late: s.lateCheckIns, missed: s.missedCheckIns }]),
    );

    for (const row of snapshot.perSite) {
      const extra = lateBySite.get(row.siteId) ?? { late: 0, missed: 0 };
      sheet.addRow([
        row.siteName,
        row.tripsCompleted,
        row.tripsStarted,
        this.round1(row.fuelLiters),
        this.round1(row.fuelCost),
        row.checkIns,
        row.checkOuts,
        extra.late,
        extra.missed,
      ]);
    }

    const t = snapshot.totals;
    const totalLate = sites.reduce((acc, s) => acc + s.lateCheckIns, 0);
    const totalMissed = sites.reduce((acc, s) => acc + s.missedCheckIns, 0);
    const totalsRow = sheet.addRow([
      'TOTAL',
      t.tripsCompleted,
      t.tripsStarted,
      this.round1(t.fuelLiters),
      this.round1(t.fuelCost),
      t.checkIns,
      t.checkOuts,
      totalLate,
      totalMissed,
    ]);
    totalsRow.font = { bold: true };

    this.autoSizeColumns(sheet, headers.length);
  }

  private buildSiteSheet(
    workbook: ExcelJS.Workbook,
    site: SiteDetail,
    snapshot: FleetActivitySnapshot,
    usedNames: Set<string>,
  ): void {
    const sheet = workbook.addWorksheet(this.safeSheetName(site.siteName, usedNames));
    let maxCols = 1;
    const writeSectionHeader = (label: string): void => {
      const row = sheet.addRow([label]);
      row.font = { bold: true, size: 13 };
    };
    const writeTableHeader = (cols: string[]): void => {
      const row = sheet.addRow(cols);
      row.font = { bold: true };
      maxCols = Math.max(maxCols, cols.length);
    };

    const titleRow = sheet.addRow([site.siteName]);
    titleRow.font = { bold: true, size: 16 };
    sheet.addRow([
      `Period: ${snapshot.windowStart.slice(0, 10)} to ${snapshot.windowEnd.slice(0, 10)}`,
    ]);
    sheet.addRow([]);

    writeSectionHeader('Site Summary');
    writeTableHeader(['Metric', 'Value']);
    const s = site.summary;
    const summaryPairs: Array<[string, string | number]> = [
      ['Trips completed', s.tripsCompleted],
      ['Trips started', s.tripsStarted],
      ['Fuel (L)', this.round1(s.fuelLiters)],
      ['Fuel cost', this.round1(s.fuelCost)],
      ['Check-ins', s.checkIns],
      ['Check-outs', s.checkOuts],
      ['Late check-ins', site.lateCheckIns],
      ['Missed check-ins', site.missedCheckIns],
    ];
    for (const [metric, value] of summaryPairs) {
      sheet.addRow([metric, value]);
    }
    sheet.addRow([]);

    writeSectionHeader('Attendance Detail');
    const attHeaders = [
      'Date',
      'Driver',
      'Employee ID',
      'Shift',
      'Status',
      'Day In',
      'Day Out',
      'Lunch Out',
      'Lunch In',
      'Late In',
      'Early In',
      'Missed In',
      'Missed Out',
      'Late Out',
      'Work Km',
      'Auto-close Reason',
    ];
    writeTableHeader(attHeaders);
    if (site.attendance.length === 0) {
      sheet.addRow(['No attendance records for this period.']);
    } else {
      const sorted = [...site.attendance].sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.driverName.localeCompare(b.driverName),
      );
      for (const a of sorted) {
        const row = sheet.addRow([
          a.date,
          a.driverName,
          a.employeeId,
          a.shift,
          a.status,
          a.dayIn ?? '',
          a.dayOut ?? '',
          a.lunchOut ?? '',
          a.lunchIn ?? '',
          this.yesNo(a.lateCheckIn),
          this.yesNo(a.earlyCheckIn),
          this.yesNo(a.missedCheckIn),
          this.yesNo(a.missedCheckOut),
          this.yesNo(a.lateCheckOut),
          a.workDistanceKm != null ? this.round1(a.workDistanceKm) : '',
          a.autoCloseReason ?? '',
        ]);
        if (a.lateCheckIn || a.missedCheckIn) {
          row.getCell(10).font = { color: { argb: 'FFC0392B' }, bold: a.lateCheckIn };
          row.getCell(12).font = { color: { argb: 'FFC0392B' }, bold: a.missedCheckIn };
        }
      }
    }
    sheet.addRow([]);

    writeSectionHeader('Trips Detail');
    const tripHeaders = [
      'Date',
      'Vehicle',
      'Driver',
      'Status',
      'From',
      'To',
      'Distance Km',
    ];
    writeTableHeader(tripHeaders);
    if (site.trips.length === 0) {
      sheet.addRow(['No trips for this period.']);
    } else {
      const sorted = [...site.trips].sort((a, b) => a.date.localeCompare(b.date));
      for (const trip of sorted) {
        sheet.addRow([
          trip.date,
          trip.vehicle,
          trip.driver,
          trip.status,
          trip.from,
          trip.to,
          trip.distanceKm != null ? this.round1(trip.distanceKm) : '',
        ]);
      }
    }
    sheet.addRow([]);

    writeSectionHeader('Fuel Detail');
    const fuelHeaders = [
      'Date',
      'Vehicle',
      'Fuel Type',
      'Liters',
      'Cost',
      'Station',
      'Odometer',
    ];
    writeTableHeader(fuelHeaders);
    if (site.fuel.length === 0) {
      sheet.addRow(['No fuel logs for this period.']);
    } else {
      const sorted = [...site.fuel].sort((a, b) => a.date.localeCompare(b.date));
      for (const log of sorted) {
        sheet.addRow([
          log.date,
          log.vehicle,
          log.fuelType,
          this.round1(log.liters),
          this.round1(log.cost),
          log.station ?? '',
          this.round1(log.odometer),
        ]);
      }
    }

    this.autoSizeColumns(sheet, maxCols);
  }

  private autoSizeColumns(sheet: ExcelJS.Worksheet, columnCount: number): void {
    for (let i = 1; i <= columnCount; i++) {
      const column = sheet.getColumn(i);
      let maxLength = 10;
      column.eachCell({ includeEmpty: false }, (cell) => {
        const len = cell.value != null ? String(cell.value).length : 0;
        if (len > maxLength) maxLength = len;
      });
      column.width = Math.min(maxLength + 2, 48);
    }
  }

  private safeSheetName(name: string, used: Set<string>): string {
    // Excel sheet names: <= 31 chars and cannot contain : \ / ? * [ ]
    let base = (name || 'Site').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28);
    if (!base) base = 'Site';
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      const suffix = ` ${n}`;
      candidate = base.slice(0, 28 - suffix.length) + suffix;
      n += 1;
    }
    used.add(candidate);
    return candidate;
  }

  private yesNo(value: boolean): string {
    return value ? 'Yes' : '';
  }

  private round1(value: number): number {
    return Number.isFinite(value) ? Number(value.toFixed(1)) : 0;
  }

  async toPdf(snapshot: FleetActivitySnapshot): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fromLabel = snapshot.windowStart.slice(0, 10);
      const toLabel = snapshot.windowEnd.slice(0, 10);

      doc.fontSize(18).text('Fleet Activity Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Period: ${fromLabel} to ${toLabel}`, { align: 'center' });
      doc.moveDown(1);

      const cols = [
        { label: 'Site', width: 120 },
        { label: 'Trips Done', width: 55 },
        { label: 'Started', width: 50 },
        { label: 'Fuel L', width: 45 },
        { label: 'Cost', width: 45 },
        { label: 'In', width: 35 },
        { label: 'Out', width: 35 },
      ];
      const startX = 40;
      let y = doc.y;

      doc.fontSize(8).font('Helvetica-Bold');
      let x = startX;
      for (const col of cols) {
        doc.text(col.label, x, y, { width: col.width, lineBreak: false });
        x += col.width;
      }
      y += 14;
      doc.font('Helvetica');

      const drawRow = (cells: string[]) => {
        if (y > 750) {
          doc.addPage();
          y = 40;
        }
        x = startX;
        doc.fontSize(8);
        for (let i = 0; i < cols.length; i++) {
          doc.text(cells[i] ?? '', x, y, {
            width: cols[i].width,
            lineBreak: false,
          });
          x += cols[i].width;
        }
        y += 12;
      };

      for (const row of snapshot.perSite) {
        drawRow([
          row.siteName,
          String(row.tripsCompleted),
          String(row.tripsStarted),
          this.fmtNumber(row.fuelLiters),
          this.fmtNumber(row.fuelCost),
          String(row.checkIns),
          String(row.checkOuts),
        ]);
      }

      const t = snapshot.totals;
      doc.font('Helvetica-Bold');
      drawRow([
        'TOTAL',
        String(t.tripsCompleted),
        String(t.tripsStarted),
        this.fmtNumber(t.fuelLiters),
        this.fmtNumber(t.fuelCost),
        String(t.checkIns),
        String(t.checkOuts),
      ]);

      doc.end();
    });
  }

  getExportContentType(format: FleetActivityExportFormat): string {
    return format === FleetActivityExportFormat.XLSX
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf';
  }

  getExportExtension(format: FleetActivityExportFormat): string {
    return format === FleetActivityExportFormat.XLSX ? 'xlsx' : 'pdf';
  }

  buildExportFilename(
    snapshot: FleetActivitySnapshot,
    format: FleetActivityExportFormat,
  ): string {
    const from = snapshot.windowStart.slice(0, 10);
    const to = snapshot.windowEnd.slice(0, 10);
    return `fleet-activity-${from}_${to}.${this.getExportExtension(format)}`;
  }

  private resolveWindow(query: FleetActivityQueryDto): {
    windowStart: Date;
    windowEnd: Date;
  } {
    const endDate = query.to ? this.parseDateEnd(query.to) : new Date();
    const startDate = query.from
      ? this.parseDateStart(query.from)
      : new Date(endDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
    if (startDate > endDate) {
      return { windowStart: endDate, windowEnd: startDate };
    }
    return { windowStart: startDate, windowEnd: endDate };
  }

  private parseDateStart(yyyyMmDd: string): Date {
    const d = new Date(`${yyyyMmDd}T00:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  private parseDateEnd(yyyyMmDd: string): Date {
    const d = new Date(`${yyyyMmDd}T23:59:59.999`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  private resolveFilterSiteIds(
    user: User,
    siteIdsParam?: string,
  ): string[] | null {
    const requested = siteIdsParam
      ? siteIdsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return this.siteScope.resolveFilterSiteIds(user, requested);
  }

  private async fetchCompletedTrips(
    windowStart: Date,
    windowEnd: Date,
    filterSiteIds: string[] | null,
  ): Promise<Trip[]> {
    const qb = this.trips
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .where('trip.completedAt BETWEEN :start AND :end', {
        start: windowStart,
        end: windowEnd,
      });
    this.applyVehicleSiteFilter(qb, filterSiteIds);
    return qb.getMany();
  }

  private async fetchStartedTrips(
    windowStart: Date,
    windowEnd: Date,
    filterSiteIds: string[] | null,
  ): Promise<Trip[]> {
    const qb = this.trips
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .where('trip.startedAt BETWEEN :start AND :end', {
        start: windowStart,
        end: windowEnd,
      });
    this.applyVehicleSiteFilter(qb, filterSiteIds);
    return qb.getMany();
  }

  private async fetchFuelLogs(
    windowStart: Date,
    windowEnd: Date,
    filterSiteIds: string[] | null,
  ): Promise<FuelLog[]> {
    const qb = this.fuelLogs
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.vehicle', 'vehicle')
      .where('log.fillDate BETWEEN :start AND :end', {
        start: windowStart,
        end: windowEnd,
      });
    this.applyVehicleSiteFilter(qb, filterSiteIds, 'vehicle');
    return qb.getMany();
  }

  private async fetchPunches(
    windowStart: Date,
    windowEnd: Date,
    filterSiteIds: string[] | null,
  ): Promise<AttendancePunch[]> {
    const qb = this.punches
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.day', 'day')
      .where('p.at BETWEEN :start AND :end', {
        start: windowStart,
        end: windowEnd,
      })
      .andWhere('p.isVoided = false');
    if (filterSiteIds !== null) {
      if (filterSiteIds.length === 0) {
        return [];
      }
      qb.andWhere('day.siteId IN (:...siteIds)', { siteIds: filterSiteIds });
    }
    return qb.getMany();
  }

  private applyVehicleSiteFilter(
    qb: SelectQueryBuilder<ObjectLiteral>,
    filterSiteIds: string[] | null,
    vehicleAlias = 'vehicle',
  ): void {
    if (filterSiteIds === null) return;
    if (filterSiteIds.length === 0) {
      qb.andWhere('1 = 0');
      return;
    }
    qb.andWhere(`${vehicleAlias}.siteId IN (:...siteIds)`, {
      siteIds: filterSiteIds,
    });
  }

  private async fetchAttendanceDaysDetailed(
    fromKey: string,
    toKey: string,
    filterSiteIds: string[] | null,
  ): Promise<AttendanceDay[]> {
    if (filterSiteIds !== null && filterSiteIds.length === 0) return [];
    const qb = this.attendanceDays
      .createQueryBuilder('day')
      .leftJoinAndSelect('day.driver', 'driver')
      .leftJoinAndSelect('day.punches', 'punch')
      .leftJoinAndSelect('day.site', 'site')
      .where('day.date BETWEEN :from AND :to', { from: fromKey, to: toKey });
    if (filterSiteIds !== null) {
      qb.andWhere('day.siteId IN (:...siteIds)', { siteIds: filterSiteIds });
    }
    return qb.getMany();
  }

  private async fetchTripsDetailed(
    windowStart: Date,
    windowEnd: Date,
    filterSiteIds: string[] | null,
  ): Promise<Trip[]> {
    const qb = this.trips
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .leftJoinAndSelect('trip.driver', 'driver')
      .where(
        new Brackets((sub) => {
          sub
            .where('trip.completedAt BETWEEN :start AND :end', {
              start: windowStart,
              end: windowEnd,
            })
            .orWhere('trip.startedAt BETWEEN :start AND :end', {
              start: windowStart,
              end: windowEnd,
            });
        }),
      );
    this.applyVehicleSiteFilter(qb, filterSiteIds);
    return qb.getMany();
  }

  private async fetchFuelLogsDetailed(
    windowStart: Date,
    windowEnd: Date,
    filterSiteIds: string[] | null,
  ): Promise<FuelLog[]> {
    return this.fetchFuelLogs(windowStart, windowEnd, filterSiteIds);
  }

  private punchTime(
    punches: AttendancePunch[] | undefined,
    type: AttendancePunchType,
    pick: 'first' | 'last',
  ): string | null {
    const live = (punches ?? [])
      .filter((p) => !p.isVoided && p.type === type)
      .sort((a, b) => this.toMillis(a.at) - this.toMillis(b.at));
    if (live.length === 0) return null;
    const chosen = pick === 'first' ? live[0] : live[live.length - 1];
    return this.toTimeLabel(chosen.at);
  }

  private toMillis(value: Date | string): number {
    return value instanceof Date
      ? value.getTime()
      : new Date(value).getTime();
  }

  private toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private toTimeLabel(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private toDateTimeLabel(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${this.toDateKey(d)} ${this.toTimeLabel(d)}`;
  }

  private isSiteActive(row: FleetActivitySiteRow): boolean {
    return (
      row.tripsCompleted +
        row.tripsStarted +
        row.checkIns +
        row.checkOuts +
        row.fuelLiters >
      0
    );
  }

  private fmtNumber(value: number): string {
    return Number.isFinite(value)
      ? Number(value.toFixed(1)).toLocaleString()
      : '0';
  }
}
