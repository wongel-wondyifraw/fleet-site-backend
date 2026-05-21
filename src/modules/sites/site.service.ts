import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';

import { SiteStatus } from '../../common/enums';
import { CreateSiteDto, SiteQueryDto, UpdateSiteDto } from './site.dto';
import { Site } from './site.entity';

@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(Site)
    private readonly repo: Repository<Site>,
  ) {}

  async findAll(query: SiteQueryDto = {}): Promise<Site[]> {
    const baseWhere: FindOptionsWhere<Site> = {};
    if (query.status) baseWhere.status = query.status;
    if (query.type) baseWhere.type = query.type;
    if (query.city) baseWhere.city = query.city;

    const where: FindOptionsWhere<Site>[] = query.search
      ? [
          { ...baseWhere, name: ILike(`%${query.search}%`) },
          { ...baseWhere, code: ILike(`%${query.search}%`) },
          { ...baseWhere, address: ILike(`%${query.search}%`) },
        ]
      : [baseWhere];

    return this.repo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  async findActive(): Promise<Site[]> {
    return this.repo.find({
      where: { status: SiteStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Site> {
    const site = await this.repo.findOne({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return site;
  }

  async findByCode(code: string): Promise<Site> {
    const site = await this.repo.findOne({ where: { code } });
    if (!site) {
      throw new NotFoundException(`Site with code ${code} not found`);
    }
    return site;
  }

  async create(dto: CreateSiteDto): Promise<Site> {
    const existing = await this.repo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Site with code ${dto.code} already exists`);
    }
    this.validateDateRange(dto.startDate, dto.endDate);

    const site = this.repo.create({
      ...dto,
      status: SiteStatus.PLANNING,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
    });
    return this.repo.save(site);
  }

  async update(id: string, dto: UpdateSiteDto): Promise<Site> {
    const site = await this.findOne(id);

    const startDate =
      dto.startDate !== undefined
        ? dto.startDate
          ? new Date(dto.startDate)
          : null
        : site.startDate;
    const endDate =
      dto.endDate !== undefined
        ? dto.endDate
          ? new Date(dto.endDate)
          : null
        : site.endDate;

    this.validateDateRange(startDate, endDate);

    Object.assign(site, { ...dto, startDate, endDate });
    return this.repo.save(site);
  }

  async setStatus(id: string, status: SiteStatus): Promise<Site> {
    const site = await this.findOne(id);
    site.status = status;
    if (
      (status === SiteStatus.COMPLETED || status === SiteStatus.CLOSED) &&
      !site.endDate
    ) {
      site.endDate = new Date();
    }
    return this.repo.save(site);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Site ${id} not found`);
    }
  }

  private validateDateRange(
    start?: Date | string | null,
    end?: Date | string | null,
  ): void {
    if (!start || !end) return;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (endMs < startMs) {
      throw new BadRequestException('endDate cannot be before startDate');
    }
  }
}
