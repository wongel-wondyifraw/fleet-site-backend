import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, LessThanOrEqual, Repository } from 'typeorm';

import { DriverStatus } from '../../common/enums';
import { VehicleService } from '../vehicles/vehicle.service';
import {
  AssignVehicleDto,
  CreateDriverDto,
  DriverQueryDto,
  UpdateDriverDto,
} from './driver.dto';
import { Driver } from './driver.entity';

@Injectable()
export class DriverService {
  constructor(
    @InjectRepository(Driver)
    private readonly repo: Repository<Driver>,
    private readonly vehicles: VehicleService,
  ) {}

  async findAll(query: DriverQueryDto = {}): Promise<Driver[]> {
    const baseWhere: FindOptionsWhere<Driver> = {};
    if (query.status) baseWhere.status = query.status;
    if (query.licenseClass) baseWhere.licenseClass = query.licenseClass;
    if (query.site) baseWhere.homeSite = query.site;

    const where: FindOptionsWhere<Driver>[] = query.search
      ? [
          { ...baseWhere, firstName: ILike(`%${query.search}%`) },
          { ...baseWhere, lastName: ILike(`%${query.search}%`) },
          { ...baseWhere, employeeId: ILike(`%${query.search}%`) },
          { ...baseWhere, licenseNumber: ILike(`%${query.search}%`) },
        ]
      : [baseWhere];

    return this.repo.find({
      where,
      relations: { assignedVehicle: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Driver> {
    const driver = await this.repo.findOne({
      where: { id },
      relations: { assignedVehicle: true },
    });
    if (!driver) {
      throw new NotFoundException(`Driver ${id} not found`);
    }
    return driver;
  }

  async findByEmployeeId(employeeId: string): Promise<Driver> {
    const driver = await this.repo.findOne({
      where: { employeeId },
      relations: { assignedVehicle: true },
    });
    if (!driver) {
      throw new NotFoundException(
        `Driver with employee id ${employeeId} not found`,
      );
    }
    return driver;
  }

  async findWithExpiringLicense(withinDays = 30): Promise<Driver[]> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + withinDays);
    return this.repo.find({
      where: { licenseExpiry: LessThanOrEqual(threshold) },
      order: { licenseExpiry: 'ASC' },
    });
  }

  async create(dto: CreateDriverDto): Promise<Driver> {
    await this.ensureUnique(dto.employeeId, dto.licenseNumber);

    if (dto.assignedVehicleId) {
      await this.vehicles.findOne(dto.assignedVehicleId);
    }

    const driver = this.repo.create({
      ...dto,
      licenseExpiry: new Date(dto.licenseExpiry),
      hireDate: new Date(dto.hireDate),
      status: DriverStatus.ACTIVE,
      assignedVehicleId: dto.assignedVehicleId ?? null,
    });
    return this.repo.save(driver);
  }

  async update(id: string, dto: UpdateDriverDto): Promise<Driver> {
    const driver = await this.findOne(id);

    if (dto.licenseNumber && dto.licenseNumber !== driver.licenseNumber) {
      await this.ensureUnique(undefined, dto.licenseNumber);
    }

    if (dto.assignedVehicleId) {
      await this.vehicles.findOne(dto.assignedVehicleId);
    }

    Object.assign(driver, {
      ...dto,
      licenseExpiry: dto.licenseExpiry
        ? new Date(dto.licenseExpiry)
        : driver.licenseExpiry,
    });
    return this.repo.save(driver);
  }

  async assignVehicle(id: string, dto: AssignVehicleDto): Promise<Driver> {
    const driver = await this.findOne(id);
    if (driver.status !== DriverStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot assign vehicle to a driver with status ${driver.status}`,
      );
    }
    await this.vehicles.findOne(dto.vehicleId);
    driver.assignedVehicleId = dto.vehicleId;
    return this.repo.save(driver);
  }

  async unassignVehicle(id: string): Promise<Driver> {
    const driver = await this.findOne(id);
    driver.assignedVehicleId = null;
    return this.repo.save(driver);
  }

  async setStatus(id: string, status: DriverStatus): Promise<Driver> {
    const driver = await this.findOne(id);
    driver.status = status;
    if (status !== DriverStatus.ACTIVE) {
      driver.assignedVehicleId = null;
    }
    return this.repo.save(driver);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Driver ${id} not found`);
    }
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
}
