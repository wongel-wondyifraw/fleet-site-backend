// Nest core decorators and exception classes for the service layer.
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
// Lets us read environment variables through Nest's ConfigService.
import { ConfigService } from '@nestjs/config';
// Repository injection helper from Nest's TypeORM integration.
import { InjectRepository } from '@nestjs/typeorm';
// bcrypt is used to hash and verify passwords; never store plaintext.
import * as bcrypt from 'bcrypt';
// TypeORM types used for typed where clauses, IN(), and ILIKE search.
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';

import {
  buildNextCursor,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
// Role enum so we can default and seed the first admin.
import { UserRole } from '../../common/enums';
// Site entity is needed because Users have a ManyToMany relation to sites.
import { Site } from '../sites/site.entity';
// DTO shapes consumed by this service from controllers/auth module.
import {
  CreateUserDto,
  UpdateUserDto,
  UserQueryDto,
} from './user.dto';
// The User entity definition itself.
import { User } from './user.entity';

// bcrypt cost factor; 12 is a sensible default in 2026 (slow enough, not painful).
const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService implements OnModuleInit {
  // Dedicated logger so seed messages are easy to spot in startup output.
  private readonly logger = new Logger(UsersService.name);

  constructor(
    // Inject the users repository for all user CRUD operations.
    @InjectRepository(User)
    private readonly users: Repository<User>,
    // Inject the sites repository so we can validate site IDs on assignment.
    @InjectRepository(Site)
    private readonly sitesRepo: Repository<Site>,
    // ConfigService gives us seed credentials from env without coupling to process.env.
    private readonly config: ConfigService,
  ) {}

  // Nest calls this once on application startup; we seed the first admin here.
  async onModuleInit(): Promise<void> {
    await this.seedAdminIfEmpty();
  }

  async findAll(query: UserQueryDto = {}): Promise<PageResponse<User>> {
    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const qb = this.users.createQueryBuilder('u');
    const expandSites = query.expand?.split(',').includes('sites');

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
    if (query.role) {
      qb.andWhere('u.role = :role', { role: query.role });
    }
    if (typeof query.isActive === 'boolean') {
      qb.andWhere('u.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.search) {
      qb.andWhere(
        '(u.firstName ILIKE :needle OR u.lastName ILIKE :needle OR u.email ILIKE :needle)',
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

  // Fetch one user with sites eager-loaded; throws 404 when missing.
  async findOne(id: string): Promise<User> {
    // Use findOne with relations so callers can show site memberships immediately.
    const user = await this.users.findOne({
      where: { id },
      relations: { sites: true },
    });
    // Surface a 404 instead of returning null so controllers stay simple.
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  // Lookup by email is used by the auth flow; sites relation kept lean here.
  async findByEmail(email: string): Promise<User | null> {
    // Lowercase email lookup for case-insensitive matches.
    return this.users.findOne({
      where: { email: email.toLowerCase() },
      relations: { sites: true },
    });
  }

  // Create a new user with a hashed password and optional site assignments.
  async create(dto: CreateUserDto): Promise<User> {
    // Normalize email to lowercase to avoid duplicates by case.
    const email = dto.email.toLowerCase();
    // Reject duplicates early with a 409 rather than letting Postgres throw.
    const existing = await this.users.findOne({ where: { email } });
    if (existing) throw new ConflictException(`Email ${email} is already in use`);
    // Resolve siteIds into actual Site entities so the join table is populated.
    const sites = await this.resolveSites(dto.siteIds);
    // Hash the password with bcrypt; never store the plaintext.
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    // Build the entity (does not yet persist).
    const user = this.users.create({
      email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      isActive: dto.isActive ?? true,
      sites,
    });
    // Persist and return the saved user (sites cascade through the join table).
    return this.users.save(user);
  }

  // Update mutable profile fields on a user; password handled separately.
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    // Load the existing record (404 if missing).
    const user = await this.findOne(id);
    // Email change requires re-checking uniqueness so we don't 500 on save.
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const lower = dto.email.toLowerCase();
      const dupe = await this.users.findOne({ where: { email: lower } });
      if (dupe) throw new ConflictException(`Email ${lower} is already in use`);
      user.email = lower;
    }
    // Apply allowed mutations only; avoid Object.assign so we don't leak fields.
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    // Save and return the fresh row.
    return this.users.save(user);
  }

  // Change the role of a user via the dedicated endpoint.
  async setRole(id: string, role: UserRole): Promise<User> {
    // Load (404 on miss).
    const user = await this.findOne(id);
    // Assign and save.
    user.role = role;
    return this.users.save(user);
  }

  // Toggle active flag; used for soft-delete style deactivation.
  async setActive(id: string, isActive: boolean): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = isActive;
    return this.users.save(user);
  }

  // Replace a user's full set of site assignments at once.
  async assignSites(id: string, siteIds: string[]): Promise<User> {
    // Load the user with current sites so TypeORM diffs the join table.
    const user = await this.findOne(id);
    // Resolve incoming IDs into entities (or throw if any are unknown).
    user.sites = await this.resolveSites(siteIds);
    return this.users.save(user);
  }

  // Add a single site to a user without touching their other assignments.
  async addSite(id: string, siteId: string): Promise<User> {
    const user = await this.findOne(id);
    // Skip if already present so we don't violate the composite PK.
    if (user.sites.some((s) => s.id === siteId)) return user;
    const site = await this.sitesRepo.findOne({ where: { id: siteId } });
    if (!site) throw new NotFoundException(`Site ${siteId} not found`);
    user.sites = [...user.sites, site];
    return this.users.save(user);
  }

  // Remove a single site from a user; idempotent when not assigned.
  async removeSite(id: string, siteId: string): Promise<User> {
    const user = await this.findOne(id);
    user.sites = user.sites.filter((s) => s.id !== siteId);
    return this.users.save(user);
  }

  // Admin-driven password reset (no current password required).
  async resetPassword(id: string, newPassword: string): Promise<void> {
    const user = await this.findOne(id);
    // Re-hash the new password.
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.save(user);
  }

  // Self-serve password change; requires the current password to authorize.
  async changeOwnPassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // Need the hash, which is normally excluded - fetch with addSelect.
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    // Verify the supplied current password against the stored hash.
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    // Hash and persist the new password.
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.save(user);
  }

  // Used by AuthService to validate login credentials.
  async verifyCredentials(email: string, password: string): Promise<User | null> {
    // Fetch with the password hash explicitly (it's normally excluded).
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.sites', 's')
      .where('LOWER(u.email) = :email', { email: email.toLowerCase() })
      .getOne();
    // No such user -> null (controller turns this into 401).
    if (!user) return null;
    // Deactivated accounts should never authenticate.
    if (!user.isActive) return null;
    // Compare provided password against stored hash via timing-safe bcrypt.
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  // Stamp the lastLoginAt column when a login succeeds.
  async recordLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  // Soft-delete by deactivating; we keep the row for audit/foreign-key safety.
  async deactivate(id: string): Promise<void> {
    // Confirm existence so callers get a 404 on bad IDs.
    await this.findOne(id);
    // Flip the flag rather than removing the row entirely.
    await this.users.update({ id }, { isActive: false });
  }

  // Helper: turn an optional list of site UUIDs into Site entities.
  private async resolveSites(siteIds?: string[]): Promise<Site[]> {
    // No IDs (or empty array) means no assignments.
    if (!siteIds || siteIds.length === 0) return [];
    // Fetch everything in one query using IN().
    const sites = await this.sitesRepo.find({ where: { id: In(siteIds) } });
    // Reject the whole call if any ID was invalid so partial assignment never happens.
    if (sites.length !== siteIds.length) {
      const found = new Set(sites.map((s) => s.id));
      const missing = siteIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Sites not found: ${missing.join(', ')}`);
    }
    return sites;
  }

  // Bootstraps a single admin from env vars if the users table is empty.
  private async seedAdminIfEmpty(): Promise<void> {
    // Cheap count to detect a fresh install.
    const count = await this.users.count();
    if (count > 0) return;
    // Pull credentials from env via ConfigService.
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    // Without both values we can't safely seed; log a clear warning.
    if (!email || !password) {
      this.logger.warn(
        'No users in DB and ADMIN_EMAIL/ADMIN_PASSWORD are not set; skipping admin seed.',
      );
      return;
    }
    // Hash and persist the initial admin account.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const admin = this.users.create({
      email: email.toLowerCase(),
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      isActive: true,
      sites: [],
    });
    await this.users.save(admin);
    // Loud log so the operator notices and rotates the default password.
    this.logger.log(`Seeded initial admin user: ${email}`);
  }
}
