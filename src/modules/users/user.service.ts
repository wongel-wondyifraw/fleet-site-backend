import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';

import {
  buildNextCursor,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
import { AccessSeederService } from '../access/access.seeder.service';
import { Role } from '../access/role.entity';
import { Site } from '../sites/site.entity';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './user.dto';
import { User } from './user.entity';

const BCRYPT_ROUNDS = 12;

const USER_AUTH_RELATIONS = {
  role: { permissions: true },
  sites: true,
} as const;

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Site)
    private readonly sitesRepo: Repository<Site>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    private readonly config: ConfigService,
    private readonly accessSeeder: AccessSeederService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedAdminIfEmpty();
  }

  async findAll(query: UserQueryDto = {}): Promise<PageResponse<User>> {
    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const qb = this.users.createQueryBuilder('u');
    const expandSites = query.expand?.split(',').includes('sites');

    qb.leftJoinAndSelect('u.role', 'role').leftJoinAndSelect(
      'role.permissions',
      'permissions',
    );

    if (query.siteId) {
      if (expandSites) {
        qb.innerJoinAndSelect('u.sites', 'sites').andWhere('sites.id = :siteId', {
          siteId: query.siteId,
        });
      } else {
        qb.innerJoin('u.sites', 's').andWhere('s.id = :siteId', {
          siteId: query.siteId,
        });
      }
    } else if (expandSites) {
      qb.leftJoinAndSelect('u.sites', 'sites');
    }
    if (query.roleId) {
      qb.andWhere('u.roleId = :roleId', { roleId: query.roleId });
    }
    if (typeof query.isActive === 'boolean') {
      qb.andWhere('u.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.search) {
      qb.andWhere(
        '(u.firstName ILIKE :needle OR u.lastName ILIKE :needle OR u.email ILIKE :needle OR role.name ILIKE :needle)',
        { needle: `%${query.search}%` },
      );
    }
    if (cursor) {
      qb.andWhere(
        '(u.createdAt < :cursorAt OR (u.createdAt = :cursorAt AND u.id < :cursorId))',
        { cursorAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    qb.orderBy('u.createdAt', 'DESC').addOrderBy('u.id', 'DESC');
    qb.take(limit + 1);

    const rows = await qb.getMany();
    return {
      data: rows.slice(0, limit),
      nextCursor: buildNextCursor(rows, limit),
    };
  }

  async findOne(id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id },
      relations: USER_AUTH_RELATIONS,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email: email.toLowerCase() },
      relations: USER_AUTH_RELATIONS,
    });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const email = dto.email.toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException(`Email ${email} is already in use`);

    const role = await this.roles.findOne({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException(`Role ${dto.roleId} not found`);

    const sites = await this.resolveSites(dto.siteIds);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.users.create({
      email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      roleId: dto.roleId,
      role,
      isActive: dto.isActive ?? true,
      sites,
    });
    const saved = await this.users.save(user);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const lower = dto.email.toLowerCase();
      const dupe = await this.users.findOne({ where: { email: lower } });
      if (dupe) throw new ConflictException(`Email ${lower} is already in use`);
      user.email = lower;
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    await this.users.save(user);
    return this.findOne(id);
  }

  async setRole(id: string, roleId: string): Promise<User> {
    const user = await this.findOne(id);
    const role = await this.roles.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Role ${roleId} not found`);
    user.roleId = roleId;
    user.role = role;
    await this.users.save(user);
    return this.findOne(id);
  }

  async setActive(id: string, isActive: boolean): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = isActive;
    await this.users.save(user);
    return this.findOne(id);
  }

  async assignSites(id: string, siteIds: string[]): Promise<User> {
    const user = await this.findOne(id);
    user.sites = await this.resolveSites(siteIds);
    await this.users.save(user);
    return this.findOne(id);
  }

  async addSite(id: string, siteId: string): Promise<User> {
    const user = await this.findOne(id);
    if (user.sites.some((s) => s.id === siteId)) return user;
    const site = await this.sitesRepo.findOne({ where: { id: siteId } });
    if (!site) throw new NotFoundException(`Site ${siteId} not found`);
    user.sites = [...user.sites, site];
    await this.users.save(user);
    return this.findOne(id);
  }

  async removeSite(id: string, siteId: string): Promise<User> {
    const user = await this.findOne(id);
    user.sites = user.sites.filter((s) => s.id !== siteId);
    await this.users.save(user);
    return this.findOne(id);
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.save(user);
  }

  async changeOwnPassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.save(user);
  }

  async verifyCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .leftJoinAndSelect('u.sites', 's')
      .where('LOWER(u.email) = :email', { email: email.toLowerCase() })
      .getOne();
    if (!user) return null;
    if (!user.isActive) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  async recordLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  async deactivate(id: string): Promise<void> {
    await this.findOne(id);
    await this.users.update({ id }, { isActive: false });
  }

  private async resolveSites(siteIds?: string[]): Promise<Site[]> {
    if (!siteIds || siteIds.length === 0) return [];
    const sites = await this.sitesRepo.find({ where: { id: In(siteIds) } });
    if (sites.length !== siteIds.length) {
      const found = new Set(sites.map((s) => s.id));
      const missing = siteIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Sites not found: ${missing.join(', ')}`);
    }
    return sites;
  }

  private async seedAdminIfEmpty(): Promise<void> {
    const count = await this.users.count();
    if (count > 0) return;

    const adminRole = await this.accessSeeder.ensureSeeded();

    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn(
        'No users in DB and ADMIN_EMAIL/ADMIN_PASSWORD are not set; skipping admin seed.',
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const admin = this.users.create({
      email: email.toLowerCase(),
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      roleId: adminRole.id,
      role: adminRole,
      isActive: true,
      sites: [],
    });
    await this.users.save(admin);
    this.logger.log(`Seeded initial admin user: ${email}`);
  }
}
