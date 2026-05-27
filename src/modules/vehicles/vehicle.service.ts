import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';

import { VehicleStatus } from '../../common/enums';
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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.backfillMissingAssetNumbers();
  }

  async findAll(query: VehicleQueryDto = {}): Promise<Vehicle[]> {
    const where: FindOptionsWhere<Vehicle> = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.site) where.assignedSite = query.site;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.repo.findOne({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }
    return vehicle;
  }

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
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
        return await this.repo.save(vehicle);
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

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    Object.assign(vehicle, dto);
    return this.repo.save(vehicle);
  }

  async setStatus(id: string, status: VehicleStatus): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    vehicle.status = status;
    return this.repo.save(vehicle);
  }

  async remove(id: string): Promise<void> {
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
    const existing = await this.repo.find({ select: { assetNumber: true } });
    let max = 0;
    for (const v of existing) {
      const match = v.assetNumber?.match(/^AST-(\d+)$/);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (Number.isFinite(num) && num > max) max = num;
      }
    }
    return `AST-${String(max + 1).padStart(3, '0')}`;
  }

  private async backfillMissingAssetNumbers(): Promise<void> {
    const vehicles = await this.repo.find({ order: { createdAt: 'ASC' } });
    for (const vehicle of vehicles) {
      if (vehicle.assetNumber) continue;
      vehicle.assetNumber = await this.nextAssetNumber();
      await this.repo.save(vehicle);
    }
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
