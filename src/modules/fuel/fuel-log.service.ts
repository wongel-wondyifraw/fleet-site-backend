import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';

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

  async findAll(query: FuelLogQueryDto = {}): Promise<FuelLog[]> {
    const where: FindOptionsWhere<FuelLog> = {};
    if (query.vehicleId) where.vehicleId = query.vehicleId;
    if (query.driverId) where.driverId = query.driverId;
    if (query.from && query.to) {
      where.fillDate = Between(new Date(query.from), new Date(query.to));
    }
    return this.repo.find({
      where,
      relations: { vehicle: true },
      order: { fillDate: 'DESC' },
    });
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
