import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import permissionCatalogJson from './permissionCatalog.json';
import systemRolesJson from './systemRoles.json';
import { Permission } from './permission.entity';
import { Role } from './role.entity';
import {
  PermissionCatalogEntry,
  SYSTEM_ROLE_ADMIN_KEY,
  SystemRoleDefinition,
} from './access.types';

const catalog = permissionCatalogJson as PermissionCatalogEntry[];
const systemRoleDefs = systemRolesJson as SystemRoleDefinition[];

@Injectable()
export class AccessSeederService implements OnModuleInit {
  private readonly logger = new Logger(AccessSeederService.name);
  private seeded = false;

  constructor(
    @InjectRepository(Permission)
    private readonly permissions: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeeded();
  }

  /** Idempotent: upserts permissions and system roles; returns the ADMIN role. */
  async ensureSeeded(): Promise<Role> {
    if (this.seeded) {
      const admin = await this.roles.findOne({
        where: { key: SYSTEM_ROLE_ADMIN_KEY },
        relations: { permissions: true },
      });
      if (admin) return admin;
    }

    const allPermissions = await this.upsertPermissions();
    await this.upsertSystemRoles(allPermissions);

    const adminRole = await this.roles.findOneOrFail({
      where: { key: SYSTEM_ROLE_ADMIN_KEY },
      relations: { permissions: true },
    });

    this.seeded = true;
    return adminRole;
  }

  private async upsertPermissions(): Promise<Permission[]> {
    const results: Permission[] = [];
    for (const entry of catalog) {
      let row = await this.permissions.findOne({ where: { slug: entry.slug } });
      if (!row) {
        row = this.permissions.create({
          slug: entry.slug,
          name: entry.name,
          category: entry.category,
          description: entry.description ?? null,
        });
      } else {
        row.name = entry.name;
        row.category = entry.category;
        row.description = entry.description ?? null;
      }
      results.push(await this.permissions.save(row));
    }

    const catalogSlugs = new Set(catalog.map((e) => e.slug));
    const allInDb = await this.permissions.find();
    const orphans = allInDb.filter((p) => !catalogSlugs.has(p.slug));
    if (orphans.length > 0) {
      this.logger.warn(
        `Permission catalog has ${orphans.length} orphan row(s) in DB: ${orphans.map((p) => p.slug).join(', ')}`,
      );
    }

    this.logger.log(`Seeded ${results.length} permissions from catalog`);
    return results;
  }

  private async upsertSystemRoles(allPermissions: Permission[]): Promise<void> {
    const reseed = this.config.get<string>('RBAC_RESEED_SYSTEM') === 'true';
    const slugToPermission = new Map(allPermissions.map((p) => [p.slug, p]));
    const allSlugs = allPermissions.map((p) => p.slug);

    for (const def of systemRoleDefs) {
      let role = await this.roles.findOne({
        where: { key: def.key },
        relations: { permissions: true },
      });

      const isNew = !role;
      if (!role) {
        role = this.roles.create({
          key: def.key,
          name: def.name,
          description: def.description ?? null,
          isSystem: true,
          permissions: [],
        });
        role = await this.roles.save(role);
      } else if (role.name !== def.name || role.description !== (def.description ?? null)) {
        role.name = def.name;
        role.description = def.description ?? null;
        await this.roles.save(role);
      }

      const hasNoPermissions = (role.permissions?.length ?? 0) === 0;
      const shouldSyncPerms = isNew || reseed || hasNoPermissions;
      if (shouldSyncPerms) {
        const slugs =
          def.permissionSlugs === '*'
            ? allSlugs
            : def.permissionSlugs.filter((s) => slugToPermission.has(s));
        const perms = slugs.map((s) => slugToPermission.get(s)!);
        role.permissions = perms;
        await this.roles.save(role);
        this.logger.log(
          `Synced ${perms.length} permission(s) onto system role ${def.key}${reseed ? ' (RBAC_RESEED_SYSTEM)' : hasNoPermissions ? ' (empty role)' : ''}`,
        );
      }
    }

    this.logger.log(`Seeded ${systemRoleDefs.length} system roles`);
  }

  async findRoleByKey(key: string): Promise<Role | null> {
    return this.roles.findOne({
      where: { key },
      relations: { permissions: true },
    });
  }

  async findAllPermissions(): Promise<Permission[]> {
    return this.permissions.find({ order: { category: 'ASC', slug: 'ASC' } });
  }
}
