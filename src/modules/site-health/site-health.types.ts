import { SiteHealthStatus } from './site-health-status.enum';

export type SiteHealthDimensionKey =
  | 'driverAttendance'
  | 'vehicleAvailability'
  | 'tripTargetAchievement'
  | 'scheduleCompliance'
  | 'fuelEfficiencyVariance'
  | 'dataCompleteness';

export interface SiteHealthDimensionSnapshot {
  /** Raw ratio 0..1 (or NaN when not applicable). */
  value: number;
  /** Normalized 0..100 for this dimension. */
  normalized: number;
  /** Config weight 0..1 before rescaling. */
  weight: number;
  /** Weight after dropping inapplicable dimensions. */
  rescaledWeight: number;
  applicable: boolean;
}

export interface SiteHealthDimensionsJson {
  driverAttendance: SiteHealthDimensionSnapshot;
  vehicleAvailability: SiteHealthDimensionSnapshot;
  tripTargetAchievement: SiteHealthDimensionSnapshot;
  scheduleCompliance: SiteHealthDimensionSnapshot;
  fuelEfficiencyVariance: SiteHealthDimensionSnapshot;
  dataCompleteness: SiteHealthDimensionSnapshot;
}

export interface SiteHealthTrucksJson {
  total: number;
  onsite: number;
}

export interface SiteHealthTripsJson {
  completed: number;
  total: number;
  target: number;
}

export interface SiteHealthFuelJson {
  liters: number;
}

export interface SiteScoringWeights {
  driverAttendance: number;
  vehicleAvailability: number;
  tripTargetAchievement: number;
  scheduleCompliance: number;
  fuelEfficiencyVariance: number;
  dataCompleteness: number;
}

export interface SiteScoringBands {
  goodMin: number;
  watchMin: number;
}

export interface SiteScoringConfigData {
  weights: SiteScoringWeights;
  bands: SiteScoringBands;
  dataCompletenessFloor: number;
}

export const DEFAULT_SITE_SCORING_CONFIG: SiteScoringConfigData = {
  weights: {
    driverAttendance: 0.25,
    vehicleAvailability: 0.2,
    tripTargetAchievement: 0.2,
    scheduleCompliance: 0.15,
    fuelEfficiencyVariance: 0.1,
    dataCompleteness: 0.1,
  },
  bands: {
    goodMin: 75,
    watchMin: 60,
  },
  dataCompletenessFloor: 0.5,
};

export interface SiteHealthRawInput {
  date: string;
  todayKey: string;
  attendanceDays: Array<{
    status: string;
    expected: boolean;
    punches: Array<{ type: string; at: string; isVoided: boolean }>;
  }>;
  vehicles: Array<{ status: string; siteId: string | null }>;
  trips: Array<{
    status: string;
    distanceKm: number | null;
    vehicleSiteId: string | null;
  }>;
  fuelRows: Array<{
    estimatedLiters: number | null;
    workDistanceKm: string | null;
    ratedKmPerLitre: number | null;
  }>;
  tripTargetCount: number;
  siteId: string;
}

export interface ScoreSnapshotResult {
  score: number | null;
  status: SiteHealthStatus | null;
  insufficientData: boolean;
  dimensions: SiteHealthDimensionsJson;
  trucks: SiteHealthTrucksJson;
  trips: SiteHealthTripsJson;
  fuel: SiteHealthFuelJson;
}
