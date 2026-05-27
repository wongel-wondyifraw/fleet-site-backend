import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { TripStatus } from '../../common/enums';
import { DriverService } from '../drivers/driver.service';
import { VehicleService } from '../vehicles/vehicle.service';
import { CreateTripDto, TripQueryDto, UpdateTripDto } from './trip.dto';
import { Trip } from './trip.entity';

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

    Object.assign(trip, {
      ...dto,
      scheduledAt:
        dto.scheduledAt === undefined
          ? trip.scheduledAt
          : dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : null,
    });
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
