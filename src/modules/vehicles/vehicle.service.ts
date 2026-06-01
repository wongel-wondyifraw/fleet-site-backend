import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';

import {
  buildNextCursor,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
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

  async findAll(query: VehicleQueryDto = {}): Promise<PageResponse<Vehicle>> {
    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const qb = this.repo.createQueryBuilder('vehicle');

    if (query.status) {
      qb.andWhere('vehicle.status = :status', { status: query.status });
    }
    if (query.type) {
      qb.andWhere('vehicle.type = :type', { type: query.type });
    }
    if (query.site) {
      qb.andWhere('vehicle.assignedSite = :site', { site: query.site });
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

  async findAllLookup(): Promise<
    Pick<
      Vehicle,
      'id' | 'assetNumber' | 'plateNumber' | 'type' | 'status' | 'assignedSite'
    >[]
  > {
    return this.repo.find({
      select: {
        id: true,
        assetNumber: true,
        plateNumber: true,
        type: true,
        status: true,
        assignedSite: true,
      },
      order: { assetNumber: 'ASC', plateNumber: 'ASC' },
    });
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
