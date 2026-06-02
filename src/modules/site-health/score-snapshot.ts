import { AttendanceDayStatus, TripStatus, VehicleStatus } from '../../common/enums';
import type { AttendanceRules } from '../attendance-rules/attendance-rules.service';
import { SiteHealthStatus } from './site-health-status.enum';
import {
  countScheduleViolations,
  evaluateDayScheduleCompliance,
  EXPECTED_PUNCH_CHECKS_PER_DAY,
} from './schedule-compliance.util';
import type {
  ScoreSnapshotResult,
  SiteHealthDimensionSnapshot,
  SiteHealthRawInput,
  SiteScoringConfigData,
} from './site-health.types';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function toNormalized(ratio: number): number {
  return Math.round(clamp01(ratio) * 100);
}

function dim(
  value: number,
  weight: number,
  applicable: boolean,
): SiteHealthDimensionSnapshot {
  const normalized = applicable ? toNormalized(value) : 0;
  return {
    value: applicable ? value : NaN,
    normalized,
    weight,
    rescaledWeight: 0,
    applicable,
  };
}

function isOnsiteVehicle(status: VehicleStatus): boolean {
  return status === VehicleStatus.ACTIVE || status === VehicleStatus.IDLE;
}

function dayHasCompletePunches(
  day: SiteHealthRawInput['attendanceDays'][number],
): boolean {
  const live = day.punches.filter((p) => !p.isVoided);
  const types = new Set(live.map((p) => p.type));
  return types.has('DAY_IN') && types.has('DAY_OUT');
}

export function scoreSnapshot(
  raw: SiteHealthRawInput,
  config: SiteScoringConfigData,
  rules: AttendanceRules,
): ScoreSnapshotResult {
  const siteId = raw.siteId;
  const weights = config.weights;

  const siteVehicles = raw.vehicles.filter((v) => v.siteId === siteId);
  const totalTrucks = siteVehicles.length;
  const onsiteTrucks = siteVehicles.filter((v) =>
    isOnsiteVehicle(v.status as VehicleStatus),
  ).length;

  const siteTrips = raw.trips.filter((t) => t.vehicleSiteId === siteId);
  const completedTrips = siteTrips.filter(
    (t) => t.status === TripStatus.COMPLETED,
  ).length;
  const tripTarget = Math.max(1, raw.tripTargetCount);

  const expectedDays = raw.attendanceDays.filter(
    (d) => d.expected && d.status !== AttendanceDayStatus.ON_LEAVE,
  );
  const attendedCount = expectedDays.filter(
    (d) =>
      d.status === AttendanceDayStatus.PRESENT ||
      d.status === AttendanceDayStatus.DONE ||
      d.status === AttendanceDayStatus.ON_BREAK,
  ).length;

  const attendanceApplicable = expectedDays.length > 0;
  const attendanceRatio = attendanceApplicable
    ? attendedCount / expectedDays.length
    : NaN;

  const vehicleApplicable = totalTrucks > 0;
  const vehicleRatio = vehicleApplicable ? onsiteTrucks / totalTrucks : NaN;

  const tripApplicable = tripTarget > 0;
  const tripRatio = tripApplicable
    ? Math.min(1, completedTrips / tripTarget)
    : NaN;

  let scheduleViolations = 0;
  let scheduleChecks = 0;
  for (const day of expectedDays) {
    const flags = evaluateDayScheduleCompliance(
      { status: day.status, date: raw.date, punches: day.punches },
      rules,
      raw.todayKey,
    );
    scheduleViolations += countScheduleViolations(flags);
    scheduleChecks += EXPECTED_PUNCH_CHECKS_PER_DAY;
  }
  const scheduleApplicable = scheduleChecks > 0;
  const scheduleRatio = scheduleApplicable
    ? 1 - scheduleViolations / scheduleChecks
    : NaN;

  let actualFuel = 0;
  let expectedFuel = 0;
  for (const row of raw.fuelRows) {
    if (typeof row.estimatedLiters === 'number' && row.estimatedLiters > 0) {
      actualFuel += row.estimatedLiters;
    }
    const dist = row.workDistanceKm ? Number(row.workDistanceKm) : NaN;
    const rated = row.ratedKmPerLitre ?? 0;
    if (Number.isFinite(dist) && dist > 0 && rated > 0) {
      expectedFuel += dist / rated;
    }
  }
  const fuelApplicable = expectedFuel > 0;
  const fuelVariance = fuelApplicable
    ? Math.abs(actualFuel - expectedFuel) / expectedFuel
    : NaN;
  const fuelRatio = fuelApplicable ? 1 - clamp01(fuelVariance) : NaN;

  const attendanceCompleteDays = expectedDays.filter(dayHasCompletePunches).length;
  const attendanceCompleteness =
    expectedDays.length > 0 ? attendanceCompleteDays / expectedDays.length : 0;

  const completedWithDistance = siteTrips.filter(
    (t) =>
      t.status === TripStatus.COMPLETED &&
      typeof t.distanceKm === 'number' &&
      Number.isFinite(t.distanceKm),
  ).length;
  const tripCompleteness =
    completedTrips > 0 ? completedWithDistance / completedTrips : 1;

  const dataCompletenessRatio =
    (attendanceCompleteness + tripCompleteness) / 2;

  const dimensions = {
    driverAttendance: dim(
      attendanceRatio,
      weights.driverAttendance,
      attendanceApplicable,
    ),
    vehicleAvailability: dim(
      vehicleRatio,
      weights.vehicleAvailability,
      vehicleApplicable,
    ),
    tripTargetAchievement: dim(tripRatio, weights.tripTargetAchievement, tripApplicable),
    scheduleCompliance: dim(
      scheduleRatio,
      weights.scheduleCompliance,
      scheduleApplicable,
    ),
    fuelEfficiencyVariance: dim(
      fuelRatio,
      weights.fuelEfficiencyVariance,
      fuelApplicable,
    ),
    dataCompleteness: dim(
      dataCompletenessRatio,
      weights.dataCompleteness,
      true,
    ),
  };

  const emptySite = totalTrucks === 0 && expectedDays.length === 0;
  if (emptySite) {
    return {
      score: null,
      status: null,
      insufficientData: true,
      dimensions,
      trucks: { total: 0, onsite: 0 },
      trips: { completed: 0, total: siteTrips.length, target: tripTarget },
      fuel: { liters: Math.round(actualFuel) },
    };
  }

  const insufficientData =
    dataCompletenessRatio < config.dataCompletenessFloor;

  const applicableDims = Object.values(dimensions).filter((d) => d.applicable);
  const weightSum = applicableDims.reduce((s, d) => s + d.weight, 0);

  let composite = 0;
  if (weightSum > 0) {
    for (const d of applicableDims) {
      d.rescaledWeight = d.weight / weightSum;
      composite += d.normalized * d.rescaledWeight;
    }
  }

  const score = insufficientData ? null : Math.round(composite);
  let status: SiteHealthStatus | null = null;
  if (score != null) {
    if (score >= config.bands.goodMin) status = SiteHealthStatus.GOOD;
    else if (score >= config.bands.watchMin) status = SiteHealthStatus.WATCH;
    else status = SiteHealthStatus.CRITICAL;
  }

  return {
    score,
    status,
    insufficientData,
    dimensions,
    trucks: { total: totalTrucks, onsite: onsiteTrucks },
    trips: {
      completed: completedTrips,
      total: siteTrips.length,
      target: tripTarget,
    },
    fuel: { liters: Math.round(actualFuel) },
  };
}
