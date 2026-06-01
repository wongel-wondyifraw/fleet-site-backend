import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import {
  buildNextCursor,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
import { CalculatedService } from '../../common/calculated.service';
import { VehicleService } from '../vehicles/vehicle.service';
import {
  CreateFuelLogDto,
  FuelLogQueryDto,
  UpdateFuelLogDto,
} from './fuel-log.dto';
import { FuelLog } from './fuel-log.entity';

@Injectable()
export class FuelLogService {
  constructor(
    @InjectRepository(FuelLog)
    private readonly repo: Repository<FuelLog>,
    private readonly vehicles: VehicleService,
    private readonly calculated: CalculatedService,
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
        '(log.createdAt < :cursorAt OR (log.createdAt = :cursorAt AND log.id < :cursorId))',
        { cursorAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    qb.orderBy('log.fillDate', 'DESC').addOrderBy('log.id', 'DESC');
    qb.take(limit + 1);

    const rows = await qb.getMany();
    return {
      data: rows.slice(0, limit),
      nextCursor: buildNextCursor(rows, limit),
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

  async efficiencyForVehicle(vehicleId: string): Promise<{
    vehicleId: string;
    samples: number;
    latestKmPerLitre: number | null;
    averageKmPerLitre: number | null;
    costPerKm: number | null;
  }> {
    const logs = await this.repo.find({
      where: { vehicleId },
      order: { fillDate: 'ASC' },
    });

    const efficiencies: number[] = [];
    for (let i = 1; i < logs.length; i++) {
      const eff = this.calculated.computeFuelEfficiency(logs[i - 1], logs[i]);
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
      samples: logs.length,
      latestKmPerLitre: efficiencies.length
        ? efficiencies[efficiencies.length - 1]
        : null,
      averageKmPerLitre: average,
      costPerKm: this.calculated.computeCostPerKm(logs),
    };
  }
}
