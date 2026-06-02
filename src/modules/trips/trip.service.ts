import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, Repository } from 'typeorm';

import {
  buildNextCursor,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
import { TripStatus, UserRole } from '../../common/enums';
import {
  NOTIFICATION_EVENT,
  NotificationDomainEvent,
} from '../notifications/notification-events';
import { NotificationKind, NotificationSeverity } from '../notifications/notification.entity';
import { TripTargetService } from '../trip-targets/trip-target.service';
import { DriverService } from '../drivers/driver.service';
import { VehicleService } from '../vehicles/vehicle.service';
import { CreateTripDto, TripQueryDto, UpdateTripDto } from './trip.dto';
import { Trip } from './trip.entity';
import {
  toTripListItem,
  TripListItem,
  TripsListMeta,
} from './trip-list.types';

// Whitelist of state transitions allowed through the checkout / check-in /
// cancel actions. Anything else is rejected with 400 so the UI can never
// move a trip into an inconsistent state by clicking the wrong button.
const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  [TripStatus.PLANNED]: [TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  [TripStatus.IN_PROGRESS]: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  [TripStatus.COMPLETED]: [],
  [TripStatus.CANCELLED]: [],
};

const EFFECTIVE_DATE_SQL = `DATE(timezone(:tz, COALESCE(trip.completedAt, trip.startedAt, trip.scheduledAt, trip.createdAt)))`;

@Injectable()
export class TripService {
  constructor(
    @InjectRepository(Trip)
    private readonly repo: Repository<Trip>,
    private readonly vehicles: VehicleService,
    private readonly drivers: DriverService,
    private readonly tripTargets: TripTargetService,
    private readonly events: EventEmitter2,
  ) {}

  async findAll(
    query: TripQueryDto = {},
  ): Promise<PageResponse<TripListItem, TripsListMeta>> {
    this.assertListQuery(query);

    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const tz = query.timezone?.trim() || 'UTC';

    const qb = this.repo
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.vehicle', 'vehicle')
      .leftJoinAndSelect('trip.driver', 'driver');

    if (query.vehicleId) {
      qb.andWhere('trip.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    }
    if (query.driverId) {
      qb.andWhere('trip.driverId = :driverId', { driverId: query.driverId });
    }
    if (query.status) {
      qb.andWhere('trip.status = :status', { status: query.status });
    }

    const dateFrom = query.dateFrom ?? query.date;
    const dateTo = query.dateTo ?? query.date;
    if (dateFrom && dateTo) {
      qb.andWhere(`${EFFECTIVE_DATE_SQL} >= :dateFrom::date`, {
        tz,
        dateFrom,
      });
      qb.andWhere(`${EFFECTIVE_DATE_SQL} <= :dateTo::date`, {
        tz,
        dateTo,
      });
    }

    if (cursor) {
      qb.andWhere(
        '(trip.createdAt < :cursorAt OR (trip.createdAt = :cursorAt AND trip.id < :cursorId))',
        { cursorAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    qb.orderBy('trip.createdAt', 'DESC').addOrderBy('trip.id', 'DESC');
    qb.take(limit + 1);

    const rows = await qb.getMany();
    const nextCursor = buildNextCursor(rows, limit);
    const data = rows.slice(0, limit).map(toTripListItem);

    const meta: TripsListMeta = {};
    if (query.includeTarget && query.date) {
      meta.targetForDate = await this.tripTargets.getEffective(query.date);
    }

    return { data, nextCursor, meta };
  }

  private assertListQuery(query: TripQueryDto): void {
    const hasScope =
      !!query.vehicleId ||
      !!query.driverId ||
      !!query.date ||
      !!query.dateFrom ||
      !!query.dateTo ||
      query.status === TripStatus.IN_PROGRESS;

    if (!hasScope) {
      throw new BadRequestException(
        'Provide date, dateFrom/dateTo, vehicleId, driverId, or status=IN_PROGRESS.',
      );
    }
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
      await this.assertDriverNotBusy(dto.driverId);
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

    if (trip.status !== TripStatus.PLANNED) {
      throw new ConflictException(
        `Only planned trips can be edited (current status: ${trip.status}).`,
      );
    }

    if (dto.vehicleId && dto.vehicleId !== trip.vehicleId) {
      await this.vehicles.findOne(dto.vehicleId);
    }
    if (dto.driverId) {
      await this.drivers.findOne(dto.driverId);
      if (dto.driverId !== trip.driverId) {
        await this.assertDriverNotBusy(dto.driverId);
      }
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

    if (dto.status && dto.status !== previousStatus) {
      stampStatusTimestamps(trip, dto.status);
    }

    await this.repo.save(trip);
    const updated = await this.findOne(id);
    if (dto.status && dto.status !== previousStatus) {
      this.emitTripStatusNotification(updated, dto.status);
    }
    return updated;
  }

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
    if (next === TripStatus.IN_PROGRESS && trip.driverId) {
      await this.assertDriverNotBusy(trip.driverId, trip.id);
    }

    trip.status = next;
    stampStatusTimestamps(trip, next);
    if (
      next === TripStatus.COMPLETED &&
      typeof distanceKm === 'number' &&
      Number.isFinite(distanceKm) &&
      distanceKm >= 0 &&
      (trip.distanceKm === null || trip.distanceKm === undefined)
    ) {
      trip.distanceKm = distanceKm;
    }
    await this.repo.save(trip);
    const updated = await this.findOne(id);
    this.emitTripStatusNotification(updated, next);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const trip = await this.repo.findOne({ where: { id } });
    if (!trip) {
      throw new NotFoundException(`Trip ${id} not found`);
    }
    if (trip.status === TripStatus.IN_PROGRESS) {
      throw new ConflictException(
        'An in-progress trip cannot be deleted. Check it in or cancel it first.',
      );
    }
    await this.repo.delete(id);
  }

  private async assertDriverNotBusy(
    driverId: string,
    excludeTripId?: string,
  ): Promise<void> {
    const where: FindOptionsWhere<Trip> = {
      driverId,
      status: TripStatus.IN_PROGRESS,
    };
    if (excludeTripId) where.id = Not(excludeTripId);
    const busy = await this.repo.findOne({ where });
    if (busy) {
      throw new ConflictException(
        'This driver already has an in-progress trip. Check it in or cancel it before adding another.',
      );
    }
  }

  private emitTripStatusNotification(trip: Trip, status: TripStatus): void {
    const vehicleName = trip.vehicle?.assetNumber ?? trip.vehicle?.plateNumber ?? 'Vehicle';
    const driverName = trip.driver
      ? `${trip.driver.firstName} ${trip.driver.lastName}`
      : 'Unassigned driver';
    const route = `${trip.startAddress} to ${trip.endAddress}`;
    const siteName = trip.vehicle?.assignedSite ?? null;

    const eventByStatus: Partial<Record<TripStatus, NotificationDomainEvent>> = {
      [TripStatus.IN_PROGRESS]: {
        eventName: 'trip.dispatched',
        kind: NotificationKind.TRIP,
        severity: NotificationSeverity.INFO,
        title: `Trip dispatched: ${vehicleName}`,
        message: `${driverName} started ${route}.`,
        href: '/trips',
        siteName,
        targetRoles: [UserRole.SITE_MANAGER],
        dedupeKey: `trip.dispatched:${trip.id}`,
        payload: { tripId: trip.id, status },
      },
      [TripStatus.COMPLETED]: {
        eventName: 'trip.completed',
        kind: NotificationKind.TRIP,
        severity: NotificationSeverity.SUCCESS,
        title: `Trip completed: ${vehicleName}`,
        message: `${driverName} completed ${route}.`,
        href: '/trips',
        siteName,
        targetRoles: [UserRole.SITE_MANAGER],
        dedupeKey: `trip.completed:${trip.id}`,
        payload: { tripId: trip.id, status },
      },
      [TripStatus.CANCELLED]: {
        eventName: 'trip.cancelled',
        kind: NotificationKind.TRIP,
        severity: NotificationSeverity.WARNING,
        title: `Trip cancelled: ${vehicleName}`,
        message: `${driverName}'s trip from ${route} was cancelled.`,
        href: '/trips',
        siteName,
        targetRoles: [UserRole.SITE_MANAGER],
        dedupeKey: `trip.cancelled:${trip.id}`,
        payload: { tripId: trip.id, status },
      },
    };

    const event = eventByStatus[status];
    if (event) this.events.emit(NOTIFICATION_EVENT, event);
  }
}

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
