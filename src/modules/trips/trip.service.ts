import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { TripStatus } from '../../common/enums';
import { DriverService } from '../drivers/driver.service';
import { VehicleService } from '../vehicles/vehicle.service';
import { CreateTripDto, TripQueryDto, UpdateTripDto } from './trip.dto';
import { Trip } from './trip.entity';

// Whitelist of state transitions allowed through the checkout / check-in /
// cancel actions. Anything else is rejected with 400 so the UI can never
// move a trip into an inconsistent state by clicking the wrong button.
const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  [TripStatus.PLANNED]: [TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  [TripStatus.IN_PROGRESS]: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  [TripStatus.COMPLETED]: [],
  [TripStatus.CANCELLED]: [],
};

@Injectable()
export class TripService {
  constructor(
    @InjectRepository(Trip)
    private readonly repo: Repository<Trip>,
    private readonly vehicles: VehicleService,
    private readonly drivers: DriverService,
  ) {}

  async findAll(query: TripQueryDto = {}): Promise<Trip[]> {
    const where: FindOptionsWhere<Trip> = {};
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.driverId) where.driverId = query.driverId;
    if (query.status) where.status = query.status;
    return this.repo.find({
      where,
      relations: { vehicle: true, driver: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Trip> {
    const trip = await this.repo.findOne({
      where: { id },
      relations: { vehicle: true, driver: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${id} not found`);
    }
    return trip;
  }

  async create(dto: CreateTripDto): Promise<Trip> {
    await this.vehicles.findOne(dto.vehicleId);
    if (dto.driverId) {
      await this.drivers.findOne(dto.driverId);
    }

    const trip = this.repo.create({
      ...dto,
      status: dto.status ?? TripStatus.PLANNED,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    });
    const saved = await this.repo.save(trip);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateTripDto): Promise<Trip> {
    const trip = await this.findOne(id);

    if (dto.vehicleId && dto.vehicleId !== trip.vehicleId) {
      await this.vehicles.findOne(dto.vehicleId);
    }
    if (dto.driverId) {
      await this.drivers.findOne(dto.driverId);
    }

    const previousStatus = trip.status;
    Object.assign(trip, {
      ...dto,
      scheduledAt:
        dto.scheduledAt === undefined
          ? trip.scheduledAt
          : dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : null,
    });

    // Mirror the auto-stamping that setStatus does so updates that touch
    // status from any path (form edit or status action) keep the trip
    // timestamps in sync.
    if (dto.status && dto.status !== previousStatus) {
      stampStatusTimestamps(trip, dto.status);
    }

    await this.repo.save(trip);
    return this.findOne(id);
  }

  // Dedicated status-transition endpoint used by the row action buttons
  // (Trip Checkout / Trip Checkin / Cancel Trip). Centralises the
  // start/complete timestamp side-effects so the UI doesn't have to manage
  // them or risk drifting clocks across client devices.
  //
  // The optional `distanceKm` is honoured only for the COMPLETED
  // transition. The client computes it via the LocationIQ Directions
  // API at check-in time and sends it here so we can persist the final
  // route distance with the trip record. We don't recalculate or
  // overwrite an existing value — if a trip is already completed and
  // has a distance, it stays as-is.
  async setStatus(
    id: string,
    next: TripStatus,
    distanceKm?: number | null,
  ): Promise<Trip> {
    const trip = await this.findOne(id);
    if (trip.status === next) {
      return trip;
    }
    const allowed = ALLOWED_TRANSITIONS[trip.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot move trip from ${trip.status} to ${next}`,
      );
    }
    trip.status = next;
    stampStatusTimestamps(trip, next);
    if (
      next === TripStatus.COMPLETED &&
      typeof distanceKm === 'number' &&
      Number.isFinite(distanceKm) &&
      distanceKm >= 0 &&
      // Only fill in the distance if we don't already have one — keeps
      // an inadvertent re-check-in from clobbering an authoritative
      // value (e.g. one set later via the regular update endpoint).
      (trip.distanceKm === null || trip.distanceKm === undefined)
    ) {
      trip.distanceKm = distanceKm;
    }
    await this.repo.save(trip);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Trip ${id} not found`);
    }
  }
}

// Mutates the trip in place to record the start/complete timestamps that
// correspond to a target status. We never overwrite an existing timestamp
// so re-saving an already-progressed trip can't corrupt audit history.
function stampStatusTimestamps(trip: Trip, next: TripStatus): void {
  const now = new Date();
  if (next === TripStatus.IN_PROGRESS && !trip.startedAt) {
    trip.startedAt = now;
  }
  if (next === TripStatus.COMPLETED) {
    if (!trip.startedAt) trip.startedAt = now;
    if (!trip.completedAt) trip.completedAt = now;
  }
}
