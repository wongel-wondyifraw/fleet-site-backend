import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Permission } from './permission.entity';
import { Role } from './role.entity';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { SYSTEM_ROLE_ADMIN_KEY } from './access.types';
import { AccessSeederService } from './access.seeder.service';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissions: Repository<Permission>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly seeder: AccessSeederService,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roles.find({
      relations: { permissions: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roles.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    return role;
  }

  async findPermissionsGrouped(): Promise<
    Record<string, Permission[]>
  > {
    const all = await this.seeder.findAllPermissions();
    const grouped: Record<string, Permission[]> = {};
    for (const p of all) {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    }
    return grouped;
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roles.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Role key ${dto.key} is already in use`);
    }
    const perms = await this.resolvePermissionSlugs(dto.permissionSlugs);
    const role = this.roles.create({
      key: dto.key,
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      permissions: perms,
    });
    return this.roles.save(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);

    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description ?? null;

    if (dto.permissionSlugs !== undefined) {
      if (role.key === SYSTEM_ROLE_ADMIN_KEY) {
        const allPerms = await this.seeder.findAllPermissions();
        role.permissions = allPerms;
      } else {
        role.permissions = await this.resolvePermissionSlugs(
          dto.permissionSlugs,
        );
      }
    }

    return this.roles.save(role);
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    const userCount = await this.users.count({ where: { roleId: role.id } });
    if (userCount > 0) {
      throw new ConflictException(
        `Role is assigned to ${userCount} user(s) and cannot be deleted`,
      );
    }
    await this.roles.remove(role);
  }

  private async resolvePermissionSlugs(slugs: string[]): Promise<Permission[]> {
    if (slugs.length === 0) return [];
    const found = await this.permissions
      .createQueryBuilder('p')
      .where('p.slug IN (:...slugs)', { slugs })
      .getMany();
    if (found.length !== slugs.length) {
      const foundSet = new Set(found.map((p) => p.slug));
      const missing = slugs.filter((s) => !foundSet.has(s));
      throw new NotFoundException(
        `Unknown permission slug(s): ${missing.join(', ')}`,
      );
    }
    return found;
  }
}
