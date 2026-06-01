import type { EffectiveTarget } from '../trip-targets/trip-target.service';
import type { Trip } from './trip.entity';

export interface TripVehicleSummary {
  id: string;
  assetNumber?: string | null;
  plateNumber: string;
  type: string;
}

export interface TripDriverSummary {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
}

export interface TripListItem {
  id: string;
  vehicleId: string;
  driverId?: string | null;
  status: string;
  startAddress: string;
  startCity?: string | null;
  startState?: string | null;
  startLat?: number | null;
  startLon?: number | null;
  endAddress: string;
  endCity?: string | null;
  endState?: string | null;
  endLat?: number | null;
  endLon?: number | null;
  scheduledAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  distanceKm?: number | null;
  isRoundTrip: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  vehicle: TripVehicleSummary | null;
  driver: TripDriverSummary | null;
}

export interface TripsListMeta {
  targetForDate?: EffectiveTarget;
}

export function toTripListItem(trip: Trip): TripListItem {
  return {
    id: trip.id,
    vehicleId: trip.vehicleId,
    driverId: trip.driverId ?? null,
    status: trip.status,
    startAddress: trip.startAddress,
    startCity: trip.startCity ?? null,
    startState: trip.startState ?? null,
    startLat: trip.startLat ?? null,
    startLon: trip.startLon ?? null,
    endAddress: trip.endAddress,
    endCity: trip.endCity ?? null,
    endState: trip.endState ?? null,
    endLat: trip.endLat ?? null,
    endLon: trip.endLon ?? null,
    scheduledAt: trip.scheduledAt ?? null,
    startedAt: trip.startedAt ?? null,
    completedAt: trip.completedAt ?? null,
    distanceKm: trip.distanceKm ?? null,
    isRoundTrip: trip.isRoundTrip,
    notes: trip.notes ?? null,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
    vehicle: trip.vehicle
      ? {
          id: trip.vehicle.id,
          assetNumber: trip.vehicle.assetNumber ?? null,
          plateNumber: trip.vehicle.plateNumber,
          type: trip.vehicle.type,
        }
      : null,
    driver: trip.driver
      ? {
          id: trip.driver.id,
          employeeId: trip.driver.employeeId,
          firstName: trip.driver.firstName,
          lastName: trip.driver.lastName,
        }
      : null,
  };
}
