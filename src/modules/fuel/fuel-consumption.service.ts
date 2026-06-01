import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CalculatedService } from '../../common/calculated.service';
import { AttendancePunchType } from '../../common/enums';
import { AttendanceDay } from '../attendance/attendance-day.entity';
import { AttendancePunch } from '../attendance/attendance-punch.entity';
import { AttendanceService } from '../attendance/attendance.service';
import { OdometerReading } from '../attendance/odometer-reading.entity';
import { Driver } from '../drivers/driver.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import {
  FuelConsumptionDayDto,
  FuelConsumptionDriverDto,
  FuelConsumptionDriverHistoryQueryDto,
  FuelConsumptionRosterBulkQueryDto,
  FuelConsumptionRosterQueryDto,
  FuelConsumptionSiteDto,
  FuelConsumptionVehicleDto,
  FuelOdometerSummaryDto,
} from './fuel-consumption.dto';

const INCOMPLETE_DISTANCE = 'INCOMPLETE_DISTANCE';

@Injectable()
export class FuelConsumptionService {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly calculated: CalculatedService,
    @InjectRepository(OdometerReading)
    private readonly odometerReadings: Repository<OdometerReading>,
  ) {}

  async getRoster(
    query: FuelConsumptionRosterQueryDto,
  ): Promise<FuelConsumptionDayDto[]> {
    const days = await this.attendance.getRoster({
      date: query.date,
      siteId: query.siteId,
      search: query.search,
    });
    return days.map((day) => this.mapDay(day));
  }

  async getRosterBulk(
    query: FuelConsumptionRosterBulkQueryDto,
  ): Promise<{ bySite: Record<string, FuelConsumptionDayDto[]> }> {
    const bulk = await this.attendance.getRosterBulk({
      date: query.date,
      siteIds: query.siteIds,
      search: query.search,
    });
    const bySite: Record<string, FuelConsumptionDayDto[]> = {};
    for (const [siteId, days] of Object.entries(bulk.bySite)) {
      bySite[siteId] = days.map((day) => this.mapDay(day));
    }
    return { bySite };
  }

  async getDriverHistory(
    driverId: string,
    query: FuelConsumptionDriverHistoryQueryDto,
  ): Promise<{ driver: Driver | null; days: FuelConsumptionDayDto[] }> {
    const { driver, days } = await this.attendance.getDriverFuelDays(
      driverId,
      query,
    );
    const summaries = await this.loadOdometerSummaries(days.map((day) => day.id));
    return {
      driver,
      days: days.map((day) =>
        this.mapDay(day, driver, summaries.get(day.id) ?? null),
      ),
    };
  }

  private mapDay(
    day: AttendanceDay,
    fallbackDriver?: Driver | null,
    odometerSummary?: FuelOdometerSummaryDto | null,
  ): FuelConsumptionDayDto {
    const driver = day.driver ?? fallbackDriver ?? null;
    const vehicle = driver?.assignedVehicle ?? null;
    const vehicleId = driver?.assignedVehicleId ?? vehicle?.id ?? null;
    const vehicleSnapshot = vehicle ? this.toVehicleSnapshot(vehicle) : null;

    const distanceKm = this.parseDistanceKm(day.workDistanceKm);
    const ratedKmPerLitre = this.resolveRatedKmPerLitre(vehicle);
    const estimatedLiters =
      distanceKm !== null && ratedKmPerLitre !== null
        ? this.calculated.computeEstimatedLiters(distanceKm, ratedKmPerLitre)
        : null;

    const resolvedSummary =
      odometerSummary ??
      (day.punches?.length
        ? this.buildOdometerSummary(day.punches)
        : null);

    return {
      attendanceDayId: day.id,
      date: day.date,
      driverId: day.driverId,
      siteId: day.siteId,
      workDistanceKm: day.workDistanceKm ?? null,
      autoCloseReason: day.autoCloseReason ?? null,
      driver: driver ? this.toDriverSnapshot(driver) : null,
      site: day.site ? this.toSiteSnapshot(day.site) : null,
      vehicleId,
      vehicle: vehicleSnapshot,
      ratedKmPerLitre,
      estimatedLiters,
      distanceIncomplete: this.isDistanceIncomplete(day.autoCloseReason),
      odometerSummary: resolvedSummary,
    };
  }

  private toDriverSnapshot(driver: Driver): FuelConsumptionDriverDto {
    return {
      id: driver.id,
      employeeId: driver.employeeId,
      firstName: driver.firstName,
      lastName: driver.lastName,
    };
  }

  private toSiteSnapshot(site: { id: string; name: string }): FuelConsumptionSiteDto {
    return {
      id: site.id,
      name: site.name,
    };
  }

  private toVehicleSnapshot(vehicle: Vehicle): FuelConsumptionVehicleDto {
    return {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      assetNumber: vehicle.assetNumber ?? null,
      mileage: vehicle.mileage,
      fuelType: vehicle.fuelType,
    };
  }

  private async loadOdometerSummaries(
    dayIds: string[],
  ): Promise<Map<string, FuelOdometerSummaryDto>> {
    if (dayIds.length === 0) return new Map();

    const readings = await this.odometerReadings.find({
      where: { dayId: In(dayIds) },
      select: {
        dayId: true,
        punchType: true,
        value: true,
        capturedAt: true,
      },
      order: { capturedAt: 'ASC' },
    });

    const latestByDay = new Map<string, Map<AttendancePunchType, number>>();
    for (const reading of readings) {
      const num = parseFloat(String(reading.value));
      if (!Number.isFinite(num)) continue;
      const byType =
        latestByDay.get(reading.dayId) ??
        new Map<AttendancePunchType, number>();
      byType.set(reading.punchType, num);
      latestByDay.set(reading.dayId, byType);
    }

    const summaries = new Map<string, FuelOdometerSummaryDto>();
    for (const [dayId, byType] of latestByDay.entries()) {
      summaries.set(dayId, {
        dayIn: byType.get(AttendancePunchType.DAY_IN) ?? null,
        lunchOut: byType.get(AttendancePunchType.LUNCH_OUT) ?? null,
        lunchIn: byType.get(AttendancePunchType.LUNCH_IN) ?? null,
        dayOut: byType.get(AttendancePunchType.DAY_OUT) ?? null,
      });
    }
    return summaries;
  }

  private parseDistanceKm(raw: string | null | undefined): number | null {
    if (raw === null || raw === undefined) return null;
    const parsed = parseFloat(String(raw));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private resolveRatedKmPerLitre(vehicle: Vehicle | null): number | null {
    if (!vehicle) return null;
    const mileage = Number(vehicle.mileage);
    if (!Number.isFinite(mileage) || mileage <= 0) return null;
    return mileage;
  }

  private isDistanceIncomplete(
    autoCloseReason: string | null | undefined,
  ): boolean {
    if (!autoCloseReason) return false;
    return autoCloseReason
      .split(',')
      .map((part) => part.trim())
      .includes(INCOMPLETE_DISTANCE);
  }

  private buildOdometerSummary(
    punches: AttendancePunch[],
  ): FuelOdometerSummaryDto | null {
    const live = punches
      .filter((p) => !p.isVoided)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const latestByType = new Map<AttendancePunchType, number>();
    for (const punch of live) {
      if (punch.odometer === null || punch.odometer === undefined) continue;
      const num = parseFloat(String(punch.odometer));
      if (Number.isFinite(num)) {
        latestByType.set(punch.type, num);
      }
    }

    if (latestByType.size === 0) return null;

    return {
      dayIn: latestByType.get(AttendancePunchType.DAY_IN) ?? null,
      lunchOut: latestByType.get(AttendancePunchType.LUNCH_OUT) ?? null,
      lunchIn: latestByType.get(AttendancePunchType.LUNCH_IN) ?? null,
      dayOut: latestByType.get(AttendancePunchType.DAY_OUT) ?? null,
    };
  }
}
