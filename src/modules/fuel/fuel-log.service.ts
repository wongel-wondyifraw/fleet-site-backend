import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  buildNextCursorByDateField,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
import { CalculatedService } from '../../common/calculated.service';
import { SiteScopeService } from '../../common/site-scope/site-scope.service';
import { ROLE_SITE_MANAGER } from '../access/role-keys';
import { NotificationKind, NotificationSeverity } from '../notifications/notification.entity';
import {
  NOTIFICATION_EVENT,
  NotificationDomainEvent,
} from '../notifications/notification-events';
import { SiteService } from '../sites/site.service';
import { User } from '../users/user.entity';
import { VehicleService } from '../vehicles/vehicle.service';
import {
  CreateFuelLogDto,
  FuelEfficiencyQueryDto,
  FuelLogQueryDto,
  UpdateFuelLogDto,
} from './fuel-log.dto';
import { FuelLog } from './fuel-log.entity';

const EFFICIENCY_DEFAULT_WINDOW_DAYS = 90;

@Injectable()
export class FuelLogService {
  constructor(
    @InjectRepository(FuelLog)
    private readonly repo: Repository<FuelLog>,
    private readonly vehicles: VehicleService,
    private readonly calculated: CalculatedService,
    private readonly events: EventEmitter2,
    private readonly siteScope: SiteScopeService,
    private readonly sites: SiteService,
  ) {}

  async findAll(
    user: User,
    query: FuelLogQueryDto = {},
  ): Promise<PageResponse<FuelLog>> {
    if (!query.vehicleId && !(query.from && query.to)) {
      throw new BadRequestException(
        'Provide vehicleId or both from and to date filters.',
      );
    }

    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const qb = this.repo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.vehicle', 'vehicle');

    if (query.vehicleId) {
      await this.vehicles.findOne(user, query.vehicleId);
      qb.andWhere('log.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    }
    this.siteScope.applyTo(qb, user, { alias: 'vehicle', allowNull: false });

    if (query.driverId) {
      qb.andWhere('log.driverId = :driverId', { driverId: query.driverId });
    }
    if (query.from && query.to) {
      qb.andWhere('log.fillDate BETWEEN :from AND :to', {
        from: new Date(query.from),
        to: new Date(query.to),
      });
    }
    if (cursor) {
      qb.andWhere(
        '(log.fillDate < :cursorAt OR (log.fillDate = :cursorAt AND log.id < :cursorId))',
        { cursorAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    qb.orderBy('log.fillDate', 'DESC').addOrderBy('log.id', 'DESC');
    qb.take(limit + 1);

    const rows = await qb.getMany();
    return {
      data: rows.slice(0, limit),
      nextCursor: buildNextCursorByDateField(
        rows.map((row) => ({ sortAt: row.fillDate, id: row.id })),
        limit,
      ),
    };
  }

  async findOne(user: User, id: string): Promise<FuelLog> {
    const log = await this.repo.findOne({
      where: { id },
      relations: { vehicle: true },
    });
    if (!log) {
      throw new NotFoundException(`Fuel log ${id} not found`);
    }
    this.siteScope.assertCanAccessSite(user, log.vehicle?.siteId ?? null);
    return log;
  }

  async create(user: User, dto: CreateFuelLogDto): Promise<FuelLog> {
    const vehicle = await this.vehicles.findOne(user, dto.vehicleId);
    const log = this.repo.create({
      ...dto,
      fillDate: new Date(dto.fillDate),
    });
    const saved = await this.repo.save(log);

    if (dto.odometerReading > vehicle.currentOdometer) {
      await this.vehicles.update(user, vehicle.id, {
        currentOdometer: dto.odometerReading,
      });
    }
    if (vehicle.fuelCapacity > 0 && dto.liters > vehicle.fuelCapacity) {
      let siteName: string | null = null;
      if (vehicle.siteId) {
        try {
          siteName = (await this.sites.findOne(vehicle.siteId)).name;
        } catch {
          siteName = null;
        }
      }
      const event: NotificationDomainEvent = {
        eventName: 'fuel.variance_flagged',
        kind: NotificationKind.FUEL,
        severity: NotificationSeverity.WARNING,
        title: 'Fuel variance flagged',
        message: `${vehicle.assetNumber ?? vehicle.plateNumber} logged ${dto.liters}L, above the ${vehicle.fuelCapacity}L configured capacity.`,
        href: '/fuel',
        siteName,
        siteId: vehicle.siteId ?? null,
        targetRoles: [ROLE_SITE_MANAGER],
        dedupeKey: `fuel.variance:${vehicle.id}:${toDateKey(new Date(dto.fillDate))}`,
        payload: {
          fuelLogId: saved.id,
          vehicleId: vehicle.id,
          liters: dto.liters,
          fuelCapacity: vehicle.fuelCapacity,
        },
      };
      this.events.emit(NOTIFICATION_EVENT, event);
    }
    return saved;
  }

  async update(
    user: User,
    id: string,
    dto: UpdateFuelLogDto,
  ): Promise<FuelLog> {
    const log = await this.findOne(user, id);
    Object.assign(log, {
      ...dto,
      fillDate: dto.fillDate ? new Date(dto.fillDate) : log.fillDate,
    });
    return this.repo.save(log);
  }

  async remove(user: User, id: string): Promise<void> {
    await this.findOne(user, id);
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Fuel log ${id} not found`);
    }
  }

  async efficiencyForVehicle(
    user: User,
    vehicleId: string,
    query: FuelEfficiencyQueryDto,
  ) {
    await this.vehicles.findOne(user, vehicleId);
    const from = query.from
      ? new Date(query.from)
      : new Date(
          Date.now() - EFFICIENCY_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );
    const to = query.to ? new Date(query.to) : new Date();
    const logs = await this.repo.find({
      where: { vehicleId },
      order: { fillDate: 'ASC' },
    });
    const inRange = logs.filter(
      (l) => l.fillDate >= from && l.fillDate <= to,
    );
    const segments: Array<{
      fromLogId: string;
      toLogId: string;
      kmPerLitre: number | null;
    }> = [];
    for (let i = 1; i < inRange.length; i++) {
      segments.push({
        fromLogId: inRange[i - 1].id,
        toLogId: inRange[i].id,
        kmPerLitre: this.calculated.computeFuelEfficiency(
          inRange[i - 1],
          inRange[i],
        ),
      });
    }
    return {
      vehicleId,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      costPerKm: this.calculated.computeCostPerKm(inRange),
      segments,
    };
  }
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
