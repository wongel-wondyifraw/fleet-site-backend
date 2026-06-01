import { Injectable } from '@nestjs/common';

import { Attendance } from '../modules/attendance/attendance.entity';
import { FuelLog } from '../modules/fuel/fuel-log.entity';

const MS_PER_HOUR = 1000 * 60 * 60;

@Injectable()
export class CalculatedService {
  /**
   * Estimated fuel consumption in litres for a shift, derived from
   * odometer distance and the vehicle's rated km/L.
   */
  computeEstimatedLiters(
    distanceKm: number,
    ratedKmPerLitre: number,
  ): number | null {
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return null;
    if (!Number.isFinite(ratedKmPerLitre) || ratedKmPerLitre <= 0) {
      return null;
    }
    return Number((distanceKm / ratedKmPerLitre).toFixed(2));
  }

  /**
   * Fuel efficiency in km per litre based on the change in odometer
   * between two fuel logs for the same vehicle.
   */
  computeFuelEfficiency(previous: FuelLog, current: FuelLog): number | null {
    if (!previous || !current) return null;
    if (current.liters <= 0) return null;
    const distance = current.odometerReading - previous.odometerReading;
    if (distance <= 0) return null;
    return Number((distance / current.liters).toFixed(2));
  }

  /**
   * Total cost per kilometer across a vehicle's fuel history.
   */
  computeCostPerKm(logs: FuelLog[]): number | null {
    if (!logs || logs.length < 2) return null;
    const ordered = [...logs].sort(
      (a, b) => a.odometerReading - b.odometerReading,
    );
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const distance = last.odometerReading - first.odometerReading;
    if (distance <= 0) return null;
    const totalCost = ordered.reduce((sum, log) => sum + Number(log.cost), 0);
    return Number((totalCost / distance).toFixed(4));
  }

  /**
   * Number of hours an attendance record spans (checkOut - checkIn).
   * Returns 0 if the record is open or invalid.
   */
  computeShiftHours(attendance: Attendance): number {
    if (!attendance?.checkInTime || !attendance?.checkOutTime) return 0;
    const diff =
      new Date(attendance.checkOutTime).getTime() -
      new Date(attendance.checkInTime).getTime();
    if (diff <= 0) return 0;
    return Number((diff / MS_PER_HOUR).toFixed(2));
  }

  /**
   * Aggregate total hours worked for a list of attendance entries.
   */
  computeTotalHours(records: Attendance[]): number {
    if (!records?.length) return 0;
    const total = records.reduce(
      (sum, rec) => sum + this.computeShiftHours(rec),
      0,
    );
    return Number(total.toFixed(2));
  }

  /**
   * Utilization ratio of a vehicle over a window of days,
   * defined as active hours / available hours (24h * days).
   */
  computeUtilization(activeHours: number, days: number): number {
    if (days <= 0) return 0;
    const ratio = activeHours / (days * 24);
    return Number(Math.min(Math.max(ratio, 0), 1).toFixed(4));
  }
}
