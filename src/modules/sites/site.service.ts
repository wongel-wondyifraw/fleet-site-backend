import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';

import { SiteScopeService } from '../../common/site-scope/site-scope.service';
import { SiteStatus } from '../../common/enums';
import { User } from '../users/user.entity';
import { CreateSiteDto, SiteQueryDto, UpdateSiteDto } from './site.dto';
import { Site } from './site.entity';

@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(Site)
    private readonly repo: Repository<Site>,
    // Used to validate and resolve assignee IDs into User entities.
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly siteScope: SiteScopeService,
  ) {}

  /** Sites the caller may access (all sites when bypass permission is granted). */
  async findForUser(user: User): Promise<Site[]> {
    const allowed = this.siteScope.allowedSiteIds(user);
    if (allowed === null) {
      return this.repo.find({ order: { name: 'ASC' } });
    }
    if (allowed.length === 0) return [];
    return this.repo.find({
      where: { id: In(allowed) },
      order: { name: 'ASC' },
    });
  }

  async findAll(query: SiteQueryDto = {}): Promise<Site[]> {
    const baseWhere: FindOptionsWhere<Site> = {};
    if (query.status) baseWhere.status = query.status;
    if (query.type) baseWhere.type = query.type;
    if (query.city) baseWhere.city = query.city;

    // Free-text search hits name, address, or city via OR.
    const where: FindOptionsWhere<Site>[] = query.search
      ? [
          { ...baseWhere, name: ILike(`%${query.search}%`) },
          { ...baseWhere, address: ILike(`%${query.search}%`) },
          { ...baseWhere, city: ILike(`%${query.search}%`) },
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
    const site = await this.repo.findOne({
      where: { id },
      relations: { users: true },
    });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return site;
  }

  async create(dto: CreateSiteDto): Promise<Site> {
    // Validate user IDs up-front so we fail before any DB writes.
    const userIds = await this.validateUserIds(dto.userIds);

    // Persist the site row first so we have an id to link assignees to.
    const site = this.repo.create({
      name: dto.name,
      type: dto.type,
      // Default to PLANNING when the caller doesn't pick a status.
      status: dto.status ?? SiteStatus.PLANNING,
      address: dto.address,
      city: dto.city,
      state: dto.state,
    });
    const saved = await this.repo.save(site);

    // Sync the many-to-many through the explicit relation API. This works
    // regardless of which side owns @JoinTable (User does, in our schema).
    if (userIds.length > 0) {
      await this.repo
        .createQueryBuilder()
        .relation(Site, 'users')
        .of(saved.id)
        .add(userIds);
    }

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateSiteDto): Promise<Site> {
    const site = await this.findOne(id);

    // Extract userIds so Object.assign doesn't try to write it as a column.
    const { userIds, ...rest } = dto;
    Object.assign(site, rest);
    await this.repo.save(site);

    // Only touch the relation when the caller explicitly sent userIds.
    // Empty array clears all assignments.
    if (userIds !== undefined) {
      const nextIds = await this.validateUserIds(userIds);
      const currentIds = (site.users ?? []).map((u) => u.id);
      // addAndRemove diffs the two sets and writes minimal join-table changes.
      await this.repo
        .createQueryBuilder()
        .relation(Site, 'users')
        .of(id)
        .addAndRemove(nextIds, currentIds);
    }

    return this.findOne(id);
  }

  async setStatus(id: string, status: SiteStatus): Promise<Site> {
    const site = await this.findOne(id);
    site.status = status;
    await this.repo.save(site);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Site ${id} not found`);
    }
  }

  // Validates that every supplied user UUID exists. Returns the input array
  // unchanged on success so callers can pass it straight to the relation API.
  // Throws 404 if any are missing so partial assignment never happens.
  private async validateUserIds(userIds?: string[]): Promise<string[]> {
    if (!userIds || userIds.length === 0) return [];
    const found = await this.users.find({
      where: { id: In(userIds) },
      select: { id: true },
    });
    if (found.length !== userIds.length) {
      const foundSet = new Set(found.map((u) => u.id));
      const missing = userIds.filter((id) => !foundSet.has(id));
      throw new NotFoundException(`Users not found: ${missing.join(', ')}`);
    }
    return userIds;
  }
}
