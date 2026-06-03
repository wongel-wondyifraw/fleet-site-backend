import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, LessThanOrEqual, Repository } from 'typeorm';

import {
  buildNextCursor,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
import { SiteScopeService } from '../../common/site-scope/site-scope.service';
import { DriverStatus, LicenseClass } from '../../common/enums';
import { ROLE_SITE_MANAGER } from '../access/role-keys';
import { User } from '../users/user.entity';
import { NotificationKind, NotificationSeverity } from '../notifications/notification.entity';
import {
  NOTIFICATION_EVENT,
  NotificationDomainEvent,
} from '../notifications/notification-events';
import { SiteService } from '../sites/site.service';
import { Vehicle } from '../vehicles/vehicle.entity';
import { VehicleService } from '../vehicles/vehicle.service';
import {
  AssignVehicleDto,
  CreateDriverDto,
  DriverQueryDto,
  UpdateDriverDto,
} from './driver.dto';
import { Driver } from './driver.entity';

@Injectable()
export class DriverService implements OnModuleInit {
  constructor(
    @InjectRepository(Driver)
    private readonly repo: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly vehicles: VehicleService,
    private readonly sites: SiteService,
    private readonly events: EventEmitter2,
    private readonly siteScope: SiteScopeService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillMissingEmployeeIds();
    await this.backfillLegacyLicenseClasses();
  }

  async findAll(
    user: User,
    query: DriverQueryDto = {},
  ): Promise<PageResponse<Driver>> {
    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);

    const qb = this.repo
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.assignedVehicle', 'assignedVehicle');

    if (query.siteId) {
      this.siteScope.assertAccess(user, [query.siteId]);
      qb.andWhere('driver.siteId = :siteId', { siteId: query.siteId });
    }
    this.siteScope.applyTo(qb, user, {
      alias: 'driver',
      allowNull: true,
    });

    if (query.status) {
      qb.andWhere('driver.status = :status', { status: query.status });
    }
    if (query.licenseClass) {
      qb.andWhere('driver.licenseClass = :licenseClass', {
        licenseClass: query.licenseClass,
      });
    }
    if (query.search) {
      const needle = `%${query.search}%`;
      qb.andWhere(
        '(driver.firstName ILIKE :needle OR driver.lastName ILIKE :needle OR driver.employeeId ILIKE :needle OR driver.licenseNumber ILIKE :needle)',
        { needle },
      );
    }
    if (cursor) {
      qb.andWhere(
        '(driver.createdAt < :cursorAt OR (driver.createdAt = :cursorAt AND driver.id < :cursorId))',
        { cursorAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    qb.orderBy('driver.createdAt', 'DESC').addOrderBy('driver.id', 'DESC');
    qb.take(limit + 1);

    const rows = await qb.getMany();
    return {
      data: rows.slice(0, limit),
      nextCursor: buildNextCursor(rows, limit),
    };
  }

  async findAllLookup(user: User): Promise<
    Pick<
      Driver,
      | 'id'
      | 'firstName'
      | 'lastName'
      | 'employeeId'
      | 'licenseNumber'
      | 'licenseClass'
      | 'licenseExpiry'
      | 'phoneNumber'
      | 'email'
      | 'hireDate'
      | 'assignedVehicleId'
      | 'status'
      | 'siteId'
    >[]
  > {
    const qb = this.repo
      .createQueryBuilder('driver')
      .select([
        'driver.id',
        'driver.firstName',
        'driver.lastName',
        'driver.employeeId',
        'driver.licenseNumber',
        'driver.licenseClass',
        'driver.licenseExpiry',
        'driver.phoneNumber',
        'driver.email',
        'driver.hireDate',
        'driver.assignedVehicleId',
        'driver.status',
        'driver.siteId',
      ])
      .orderBy('driver.lastName', 'ASC')
      .addOrderBy('driver.firstName', 'ASC');
    this.siteScope.applyTo(qb, user, {
      alias: 'driver',
      allowNull: true,
    });
    return qb.getMany();
  }

  async findOne(user: User, id: string): Promise<Driver> {
    const driver = await this.repo.findOne({
      where: { id },
      relations: { assignedVehicle: true },
    });
    if (!driver) {
      throw new NotFoundException(`Driver ${id} not found`);
    }
    this.siteScope.assertCanAccessSite(user, driver.siteId ?? null);
    return driver;
  }

  async findByEmployeeId(user: User, employeeId: string): Promise<Driver> {
    const driver = await this.repo.findOne({
      where: { employeeId },
      relations: { assignedVehicle: true },
    });
    if (!driver) {
      throw new NotFoundException(
        `Driver with employee id ${employeeId} not found`,
      );
    }
    this.siteScope.assertCanAccessSite(user, driver.siteId ?? null);
    return driver;
  }

  async findWithExpiringLicense(
    user: User,
    withinDays = 30,
  ): Promise<Driver[]> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + withinDays);
    const qb = this.repo
      .createQueryBuilder('driver')
      .where('driver.licenseExpiry <= :threshold', { threshold })
      .orderBy('driver.licenseExpiry', 'ASC');
    this.siteScope.applyTo(qb, user, {
      alias: 'driver',
      allowNull: true,
    });
    return qb.getMany();
  }

  async create(user: User, dto: CreateDriverDto): Promise<Driver> {
    await this.ensureUnique(undefined, dto.licenseNumber);

    if (dto.assignedVehicleId) {
      await this.vehicles.findOne(user, dto.assignedVehicleId);
    }
    if (dto.siteId) {
      this.siteScope.assertCanAccessSite(user, dto.siteId);
    }

    // Employee IDs are server-issued (EMP-001, EMP-002, ...) so the UI
    // doesn't have to guess. Matches how vehicle asset numbers work.
    const employeeId = await this.nextEmployeeId();

    const driver = this.repo.create({
      ...dto,
      employeeId,
      licenseExpiry: new Date(dto.licenseExpiry),
      hireDate: new Date(dto.hireDate),
      status: DriverStatus.ACTIVE,
      assignedVehicleId: dto.assignedVehicleId ?? null,
      siteId:
        dto.siteId ??
        (await this.siteIdFromVehicleId(dto.assignedVehicleId ?? null)),
    });
    const saved = await this.repo.save(driver);
    const siteName = await this.siteNameForId(saved.siteId);
    const event: NotificationDomainEvent = {
      eventName: 'driver.onboarded',
      kind: NotificationKind.DRIVER,
      severity: NotificationSeverity.SUCCESS,
      title: 'New driver onboarded',
      message: `${saved.firstName} ${saved.lastName} joined the driver roster.`,
      href: '/drivers',
      siteName,
      siteId: saved.siteId ?? null,
      targetRoles: [ROLE_SITE_MANAGER],
      dedupeKey: `driver.onboarded:${saved.id}`,
      payload: { driverId: saved.id },
    };
    this.events.emit(NOTIFICATION_EVENT, event);
    if (saved.assignedVehicleId) {
      await this.emitVehicleAssignment(user, saved, saved.assignedVehicleId);
    }
    return saved;
  }

  async update(user: User, id: string, dto: UpdateDriverDto): Promise<Driver> {
    const driver = await this.findOne(user, id);
    const previousVehicleId = driver.assignedVehicleId ?? null;

    if (dto.licenseNumber && dto.licenseNumber !== driver.licenseNumber) {
      await this.ensureUnique(undefined, dto.licenseNumber);
    }

    if (dto.assignedVehicleId) {
      await this.vehicles.findOne(user, dto.assignedVehicleId);
    }
    if (dto.siteId) {
      this.siteScope.assertCanAccessSite(user, dto.siteId);
    }

    Object.assign(driver, {
      ...dto,
      licenseExpiry: dto.licenseExpiry
        ? new Date(dto.licenseExpiry)
        : driver.licenseExpiry,
    });
    if (dto.assignedVehicleId !== undefined) {
      driver.siteId = await this.siteIdFromVehicleId(dto.assignedVehicleId);
    } else if (dto.siteId !== undefined) {
      driver.siteId = dto.siteId;
    }
    const saved = await this.repo.save(driver);
    if (
      dto.assignedVehicleId !== undefined &&
      dto.assignedVehicleId &&
      dto.assignedVehicleId !== previousVehicleId
    ) {
      await this.emitVehicleAssignment(user, saved, dto.assignedVehicleId);
    }
    return saved;
  }

  async assignVehicle(
    user: User,
    id: string,
    dto: AssignVehicleDto,
  ): Promise<Driver> {
    const driver = await this.findOne(user, id);
    if (driver.status !== DriverStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot assign vehicle to a driver with status ${driver.status}`,
      );
    }
    await this.vehicles.findOne(user, dto.vehicleId);
    const previousVehicleId = driver.assignedVehicleId ?? null;
    driver.assignedVehicleId = dto.vehicleId;
    driver.siteId = await this.siteIdFromVehicleId(dto.vehicleId);
    const saved = await this.repo.save(driver);
    if (dto.vehicleId !== previousVehicleId) {
      await this.emitVehicleAssignment(user, saved, dto.vehicleId);
    }
    return saved;
  }

  async unassignVehicle(user: User, id: string): Promise<Driver> {
    const driver = await this.findOne(user, id);
    driver.assignedVehicleId = null;
    return this.repo.save(driver);
  }

  async setStatus(
    user: User,
    id: string,
    status: DriverStatus,
  ): Promise<Driver> {
    const driver = await this.findOne(user, id);
    driver.status = status;
    if (status !== DriverStatus.ACTIVE) {
      driver.assignedVehicleId = null;
    }
    return this.repo.save(driver);
  }

  async remove(user: User, id: string): Promise<void> {
    await this.findOne(user, id);
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Driver ${id} not found`);
    }
  }

  // Notifies the new site's manager (plus admins) that a driver has been
  // assigned to a vehicle. Dedupe key embeds both ids so re-assigning the
  // same driver/vehicle pair is idempotent within a notification cycle.
  private async emitVehicleAssignment(
    user: User,
    driver: Driver,
    vehicleId: string,
  ): Promise<void> {
    let vehicleLabel = vehicleId;
    const siteId = driver.siteId ?? null;
    const siteName = await this.siteNameForId(siteId);
    try {
      const vehicle = await this.vehicles.findOne(user, vehicleId);
      vehicleLabel = vehicle.assetNumber ?? vehicle.plateNumber ?? vehicleId;
    } catch {
      // Vehicle lookup is best-effort here; the assignment itself already
      // succeeded so we still want to fire the notification.
    }

    const event: NotificationDomainEvent = {
      eventName: 'driver.assigned_to_vehicle',
      kind: NotificationKind.DRIVER,
      severity: NotificationSeverity.INFO,
      title: 'Driver assigned to a vehicle',
      message: `${driver.firstName} ${driver.lastName} is now driving ${vehicleLabel}.`,
      href: '/drivers',
      siteName,
      siteId,
      targetRoles: [ROLE_SITE_MANAGER],
      dedupeKey: `driver.assigned_to_vehicle:${driver.id}:${vehicleId}`,
      payload: { driverId: driver.id, vehicleId },
    };
    this.events.emit(NOTIFICATION_EVENT, event);
  }

  private async siteNameForId(
    siteId: string | null | undefined,
  ): Promise<string | null> {
    if (!siteId) return null;
    try {
      return (await this.sites.findOne(siteId)).name;
    } catch {
      return null;
    }
  }

  /** Driver site is derived from the assigned vehicle's site. */
  private async siteIdFromVehicleId(
    vehicleId: string | null,
  ): Promise<string | null> {
    if (!vehicleId) return null;
    const vehicle = await this.vehicleRepo.findOne({
      where: { id: vehicleId },
      select: { id: true, siteId: true },
    });
    return vehicle?.siteId ?? null;
  }

  private async ensureUnique(
    employeeId?: string,
    licenseNumber?: string,
  ): Promise<void> {
    if (employeeId) {
      const existing = await this.repo.findOne({ where: { employeeId } });
      if (existing) {
        throw new ConflictException(
          `Driver with employee id ${employeeId} already exists`,
        );
      }
    }
    if (licenseNumber) {
      const existing = await this.repo.findOne({ where: { licenseNumber } });
      if (existing) {
        throw new ConflictException(
          `Driver with license number ${licenseNumber} already exists`,
        );
      }
    }
  }

  // Compute the next EMP-NNN employee id by parsing every existing one.
  // We scan instead of relying on string ordering because "EMP-100" sorts
  // before "EMP-99" lexicographically, which would break sequencing once
  // we cross the 99 -> 100 boundary.
  private async nextEmployeeId(): Promise<string> {
    const row = await this.repo
      .createQueryBuilder('driver')
      .select(
        `MAX(CAST(SUBSTRING(driver.employeeId FROM 'EMP-([0-9]+)') AS INTEGER))`,
        'maxNum',
      )
      .where("driver.employeeId ~ '^EMP-[0-9]+$'")
      .getRawOne<{ maxNum: string | null }>();
    const max = row?.maxNum ? Number.parseInt(row.maxNum, 10) : 0;
    return `EMP-${String((Number.isFinite(max) ? max : 0) + 1).padStart(3, '0')}`;
  }

  // One-shot rewrite of legacy employee ids that don't follow the EMP-NNN
  // convention (e.g. drivers seeded manually before this change). Runs once
  // per boot via OnModuleInit. Anything already matching is left alone.
  private async backfillMissingEmployeeIds(): Promise<void> {
    const drivers = await this.repo.find({ order: { createdAt: 'ASC' } });
    for (const driver of drivers) {
      if (driver.employeeId && /^EMP-\d+$/.test(driver.employeeId)) continue;
      driver.employeeId = await this.nextEmployeeId();
      await this.repo.save(driver);
    }
  }

  // One-shot migration from the previous A/B/C/D/E/HEAVY_EQUIPMENT license
  // classes to the new Ethiopian PUBLIC_* / DRY_CARGO_* classes. Runs once
  // per boot via OnModuleInit. Rows already using the new values are left
  // alone. Best-effort mapping by "weight" - admins can adjust afterward.
  private async backfillLegacyLicenseClasses(): Promise<void> {
    const legacyToNew: Record<string, LicenseClass> = {
      A: LicenseClass.PUBLIC_1,
      B: LicenseClass.PUBLIC_2,
      C: LicenseClass.PUBLIC_3,
      D: LicenseClass.DRY_CARGO_1,
      E: LicenseClass.DRY_CARGO_2,
      HEAVY_EQUIPMENT: LicenseClass.DRY_CARGO_3,
    };
    const validValues = new Set<string>(Object.values(LicenseClass));
    const drivers = await this.repo.find({ order: { createdAt: 'ASC' } });
    for (const driver of drivers) {
      const current = driver.licenseClass as unknown as string;
      if (validValues.has(current)) continue;
      driver.licenseClass = legacyToNew[current] ?? LicenseClass.PUBLIC_1;
      await this.repo.save(driver);
    }
  }
}
