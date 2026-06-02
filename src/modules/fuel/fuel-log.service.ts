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
import { ROLE_SITE_MANAGER } from '../access/role-keys';
import { NotificationKind, NotificationSeverity } from '../notifications/notification.entity';
import {
  NOTIFICATION_EVENT,
  NotificationDomainEvent,
} from '../notifications/notification-events';
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
  ) {}

  async findAll(query: FuelLogQueryDto = {}): Promise<PageResponse<FuelLog>> {
    if (!query.vehicleId && !(query.from && query.to)) {
      throw new BadRequestException(
        'Provide vehicleId or both from and to date filters.',
      );
    }

    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const qb = this.repo.createQueryBuilder('log');

    if (query.vehicleId) {
      qb.andWhere('log.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    }
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

  async findOne(id: string): Promise<FuelLog> {
    const log = await this.repo.findOne({
      where: { id },
      relations: { vehicle: true },
    });
    if (!log) {
      throw new NotFoundException(`Fuel log ${id} not found`);
    }
    return log;
  }

  async create(dto: CreateFuelLogDto): Promise<FuelLog> {
    const vehicle = await this.vehicles.findOne(dto.vehicleId);
    const log = this.repo.create({
      ...dto,
      fillDate: new Date(dto.fillDate),
    });
    const saved = await this.repo.save(log);

    if (dto.odometerReading > vehicle.currentOdometer) {
      await this.vehicles.update(vehicle.id, {
        currentOdometer: dto.odometerReading,
      });
    }
    if (vehicle.fuelCapacity > 0 && dto.liters > vehicle.fuelCapacity) {
      const event: NotificationDomainEvent = {
        eventName: 'fuel.variance_flagged',
        kind: NotificationKind.FUEL,
        severity: NotificationSeverity.WARNING,
        title: 'Fuel variance flagged',
        message: `${vehicle.assetNumber ?? vehicle.plateNumber} logged ${dto.liters}L, above the ${vehicle.fuelCapacity}L configured capacity.`,
        href: '/fuel',
        siteName: vehicle.assignedSite ?? null,
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

  async update(id: string, dto: UpdateFuelLogDto): Promise<FuelLog> {
    const log = await this.findOne(id);
    Object.assign(log, {
      ...dto,
      fillDate: dto.fillDate ? new Date(dto.fillDate) : log.fillDate,
    });
    return this.repo.save(log);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Fuel log ${id} not found`);
    }
  }

  async efficiencyForVehicle(
    vehicleId: string,
    query: FuelEfficiencyQueryDto = {},
  ): Promise<{
    vehicleId: string;
    from: string;
    to: string;
    samples: number;
    latestKmPerLitre: number | null;
    averageKmPerLitre: number | null;
    costPerKm: number | null;
  }> {
    const { from, to } = resolveEfficiencyWindow(query);
    const logs = await this.repo
      .createQueryBuilder('log')
      .where('log.vehicleId = :vehicleId', { vehicleId })
      .andWhere('log.fillDate >= :from', { from: new Date(`${from}T00:00:00`) })
      .andWhere('log.fillDate <= :to', { to: new Date(`${to}T23:59:59.999`) })
      .orderBy('log.fillDate', 'ASC')
      .getMany();
    const windowed = logs;

    const efficiencies: number[] = [];
    for (let i = 1; i < windowed.length; i++) {
      const eff = this.calculated.computeFuelEfficiency(
        windowed[i - 1],
        windowed[i],
      );
      if (eff !== null) efficiencies.push(eff);
    }

    const average = efficiencies.length
      ? Number(
          (
            efficiencies.reduce((s, v) => s + v, 0) / efficiencies.length
          ).toFixed(2),
        )
      : null;

    return {
      vehicleId,
      from,
      to,
      samples: windowed.length,
      latestKmPerLitre: efficiencies.length
        ? efficiencies[efficiencies.length - 1]
        : null,
      averageKmPerLitre: average,
      costPerKm: this.calculated.computeCostPerKm(windowed),
    };
  }
}

function resolveEfficiencyWindow(query: FuelEfficiencyQueryDto): {
  from: string;
  to: string;
} {
  const to = query.to ?? toDateKey(new Date());
  if (query.from) {
    return { from: query.from, to };
  }
  const end = new Date(`${to}T00:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - (EFFICIENCY_DEFAULT_WINDOW_DAYS - 1));
  return { from: toDateKey(start), to };
}

function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
