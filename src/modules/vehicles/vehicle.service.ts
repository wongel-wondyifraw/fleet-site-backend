import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';

import {
  buildNextCursor,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
import { SiteScopeService } from '../../common/site-scope/site-scope.service';
import { VehicleStatus } from '../../common/enums';
import { ROLE_SITE_MANAGER } from '../access/role-keys';
import { SiteService } from '../sites/site.service';
import { User } from '../users/user.entity';
import { NotificationKind, NotificationSeverity } from '../notifications/notification.entity';
import {
  NOTIFICATION_EVENT,
  NotificationDomainEvent,
} from '../notifications/notification-events';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleQueryDto,
} from './vehicle.dto';
import { Vehicle } from './vehicle.entity';

@Injectable()
export class VehicleService implements OnModuleInit {
  constructor(
    @InjectRepository(Vehicle)
    private readonly repo: Repository<Vehicle>,
    private readonly events: EventEmitter2,
    private readonly siteScope: SiteScopeService,
    private readonly sites: SiteService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillMissingAssetNumbers();
  }

  async findAll(
    user: User,
    query: VehicleQueryDto = {},
  ): Promise<PageResponse<Vehicle>> {
    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const qb = this.repo.createQueryBuilder('vehicle');

    if (query.siteId) {
      this.siteScope.assertAccess(user, [query.siteId]);
      qb.andWhere('vehicle.siteId = :siteId', { siteId: query.siteId });
    }
    this.siteScope.applyTo(qb, user, {
      alias: 'vehicle',
      allowNull: true,
    });

    if (query.status) {
      qb.andWhere('vehicle.status = :status', { status: query.status });
    }
    if (query.type) {
      qb.andWhere('vehicle.type = :type', { type: query.type });
    }
    if (cursor) {
      qb.andWhere(
        '(vehicle.createdAt < :cursorAt OR (vehicle.createdAt = :cursorAt AND vehicle.id < :cursorId))',
        { cursorAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    qb.orderBy('vehicle.createdAt', 'DESC').addOrderBy('vehicle.id', 'DESC');
    qb.take(limit + 1);

    const rows = await qb.getMany();
    return {
      data: rows.slice(0, limit),
      nextCursor: buildNextCursor(rows, limit),
    };
  }

  async findAllLookup(user: User): Promise<
    Pick<
      Vehicle,
      | 'id'
      | 'assetNumber'
      | 'plateNumber'
      | 'type'
      | 'status'
      | 'fuelType'
      | 'fuelCapacity'
      | 'mileage'
      | 'currentOdometer'
      | 'siteId'
    >[]
  > {
    const qb = this.repo
      .createQueryBuilder('vehicle')
      .select([
        'vehicle.id',
        'vehicle.assetNumber',
        'vehicle.plateNumber',
        'vehicle.type',
        'vehicle.status',
        'vehicle.fuelType',
        'vehicle.fuelCapacity',
        'vehicle.mileage',
        'vehicle.currentOdometer',
        'vehicle.siteId',
      ])
      .orderBy('vehicle.assetNumber', 'ASC')
      .addOrderBy('vehicle.plateNumber', 'ASC');
    this.siteScope.applyTo(qb, user, {
      alias: 'vehicle',
      allowNull: true,
    });
    return qb.getMany();
  }

  async findOne(user: User, id: string): Promise<Vehicle> {
    const vehicle = await this.repo.findOne({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }
    this.siteScope.assertCanAccessSite(user, vehicle.siteId ?? null);
    return vehicle;
  }

  async create(user: User, dto: CreateVehicleDto): Promise<Vehicle> {
    if (dto.siteId) {
      this.siteScope.assertCanAccessSite(user, dto.siteId);
    }
    const existingPlate = await this.repo.findOne({
      where: { plateNumber: dto.plateNumber },
      select: { id: true },
    });
    if (existingPlate) {
      throw new ConflictException(
        `Vehicle plate number ${dto.plateNumber} is already registered`,
      );
    }

    // Asset numbers are server-issued so the UI doesn't have to guess. We
    // assign sequentially (AST-001, AST-002, ...) based on the highest
    // existing AST-NNN suffix - good enough for our scale.
    for (let attempt = 0; attempt < 3; attempt++) {
      const assetNumber = await this.nextAssetNumber();
      const vehicle = this.repo.create({
        ...dto,
        assetNumber,
        status: VehicleStatus.ACTIVE,
        mileage: dto.mileage ?? 0,
        currentOdometer: dto.currentOdometer ?? 0,
      });

      try {
        const saved = await this.repo.save(vehicle);
        await this.emitRegisteredNotification(saved);
        return saved;
      } catch (err) {
        if (isUniqueViolation(err, 'assetNumber')) {
          continue;
        }
        if (isUniqueViolation(err, 'plateNumber')) {
          throw new ConflictException(
            `Vehicle plate number ${dto.plateNumber} is already registered`,
          );
        }
        throw err;
      }
    }

    throw new ConflictException(
      'Could not allocate a vehicle asset number. Please try again.',
    );
  }

  async update(
    user: User,
    id: string,
    dto: UpdateVehicleDto,
  ): Promise<Vehicle> {
    const vehicle = await this.findOne(user, id);
    const previousStatus = vehicle.status;
    const previousSite = vehicle.siteId ?? null;
    if (dto.siteId) {
      this.siteScope.assertCanAccessSite(user, dto.siteId);
    }
    Object.assign(vehicle, dto);
    const saved = await this.repo.save(vehicle);
    if (dto.status && dto.status !== previousStatus) {
      await this.emitStatusNotification(saved);
    }
    if (dto.siteId !== undefined && (dto.siteId ?? null) !== previousSite) {
      await this.emitSiteChangeNotification(saved, previousSite);
    }
    return saved;
  }

  async setStatus(
    user: User,
    id: string,
    status: VehicleStatus,
  ): Promise<Vehicle> {
    const vehicle = await this.findOne(user, id);
    const previousStatus = vehicle.status;
    vehicle.status = status;
    const saved = await this.repo.save(vehicle);
    if (status !== previousStatus) await this.emitStatusNotification(saved);
    return saved;
  }

  async remove(user: User, id: string): Promise<void> {
    await this.findOne(user, id);
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }
  }

  // Compute the next AST-NNN asset number by parsing every existing one.
  // We scan instead of relying on string ordering because "AST-100" sorts
  // before "AST-99" lexicographically, which would break sequencing once we
  // cross the 99 -> 100 boundary.
  private async nextAssetNumber(): Promise<string> {
    const row = await this.repo
      .createQueryBuilder('vehicle')
      .select(
        `MAX(CAST(SUBSTRING(vehicle.assetNumber FROM 'AST-([0-9]+)') AS INTEGER))`,
        'maxNum',
      )
      .where("vehicle.assetNumber ~ '^AST-[0-9]+$'")
      .getRawOne<{ maxNum: string | null }>();
    const max = row?.maxNum ? Number.parseInt(row.maxNum, 10) : 0;
    return `AST-${String((Number.isFinite(max) ? max : 0) + 1).padStart(3, '0')}`;
  }

  private async backfillMissingAssetNumbers(): Promise<void> {
    const vehicles = await this.repo.find({ order: { createdAt: 'ASC' } });
    for (const vehicle of vehicles) {
      if (vehicle.assetNumber) continue;
      vehicle.assetNumber = await this.nextAssetNumber();
      await this.repo.save(vehicle);
    }
  }

  private async siteNameForId(siteId: string | null | undefined): Promise<string | null> {
    if (!siteId) return null;
    try {
      const site = await this.sites.findOne(siteId);
      return site.name;
    } catch {
      return null;
    }
  }

  private async emitStatusNotification(vehicle: Vehicle): Promise<void> {
    const severity =
      vehicle.status === VehicleStatus.IN_MAINTENANCE ||
      vehicle.status === VehicleStatus.OUT_OF_SERVICE
        ? NotificationSeverity.WARNING
        : NotificationSeverity.INFO;
    const event: NotificationDomainEvent = {
      eventName: 'vehicle.status_changed',
      kind: NotificationKind.VEHICLE,
      severity,
      title: `Vehicle status changed: ${vehicle.assetNumber ?? vehicle.plateNumber}`,
      message: `${vehicle.assetNumber ?? vehicle.plateNumber} is now ${vehicle.status.replaceAll('_', ' ').toLowerCase()}.`,
      href: '/vehicles',
      siteName: await this.siteNameForId(vehicle.siteId),
      siteId: vehicle.siteId ?? null,
      targetRoles: [ROLE_SITE_MANAGER],
      dedupeKey: `vehicle.status:${vehicle.id}:${vehicle.status}`,
      payload: { vehicleId: vehicle.id, status: vehicle.status },
    };
    this.events.emit(NOTIFICATION_EVENT, event);
  }

  private async emitRegisteredNotification(vehicle: Vehicle): Promise<void> {
    const label = vehicle.assetNumber ?? vehicle.plateNumber;
    const event: NotificationDomainEvent = {
      eventName: 'vehicle.registered',
      kind: NotificationKind.VEHICLE,
      severity: NotificationSeverity.SUCCESS,
      title: 'New vehicle registered',
      message: `${label} (${vehicle.type.toLowerCase()}) was added to the fleet.`,
      href: '/vehicles',
      siteName: await this.siteNameForId(vehicle.siteId),
      siteId: vehicle.siteId ?? null,
      targetRoles: [ROLE_SITE_MANAGER],
      dedupeKey: `vehicle.registered:${vehicle.id}`,
      payload: {
        vehicleId: vehicle.id,
        assetNumber: vehicle.assetNumber,
        plateNumber: vehicle.plateNumber,
      },
    };
    this.events.emit(NOTIFICATION_EVENT, event);
  }

  // Emits a notification for the NEW site whenever a vehicle moves between
  // sites. We deliberately target the new site (admins always receive it via
  // includeAdmins) — the old site's manager loses operational interest in
  // the vehicle the moment it's reassigned.
  private async emitSiteChangeNotification(
    vehicle: Vehicle,
    previousSiteId: string | null,
  ): Promise<void> {
    const label = vehicle.assetNumber ?? vehicle.plateNumber;
    const nextSiteId = vehicle.siteId ?? null;
    const [fromName, toName] = await Promise.all([
      this.siteNameForId(previousSiteId),
      this.siteNameForId(nextSiteId),
    ]);
    const from = fromName ?? 'unassigned';
    const to = toName ?? 'unassigned';
    const event: NotificationDomainEvent = {
      eventName: 'vehicle.site_changed',
      kind: NotificationKind.VEHICLE,
      severity: NotificationSeverity.INFO,
      title: 'Vehicle reassigned to a new site',
      message: `${label} moved from ${from} to ${to}.`,
      href: '/vehicles',
      siteName: toName,
      siteId: nextSiteId,
      targetRoles: [ROLE_SITE_MANAGER],
      dedupeKey: `vehicle.site_changed:${vehicle.id}:${nextSiteId ?? 'none'}`,
      payload: {
        vehicleId: vehicle.id,
        previousSiteId,
        siteId: nextSiteId,
      },
    };
    this.events.emit(NOTIFICATION_EVENT, event);
  }
}

function isUniqueViolation(err: unknown, column?: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverError = err.driverError as
    | { code?: string; detail?: string; constraint?: string }
    | undefined;
  if (driverError?.code !== '23505') return false;
  if (!column) return true;
  return (
    driverError.detail?.includes(`(${column})`) === true ||
    driverError.detail?.includes(`"${column}"`) === true ||
    driverError.constraint?.includes(column) === true
  );
}
