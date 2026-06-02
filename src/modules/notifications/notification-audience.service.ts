import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ROLE_ADMIN } from '../access/role-keys';
import { User } from '../users/user.entity';

@Injectable()
export class NotificationAudienceService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async resolveRecipients(options: {
    roles: string[];
    siteName?: string | null;
    includeAdmins?: boolean;
  }): Promise<User[]> {
    const roleSet = new Set(options.roles);
    if (options.includeAdmins !== false) roleSet.add(ROLE_ADMIN);

    const qb = this.users
      .createQueryBuilder('u')
      .innerJoin('u.role', 'role')
      .leftJoinAndSelect('u.sites', 'site')
      .where('u.isActive = true')
      .andWhere('role.key IN (:...roles)', { roles: [...roleSet] });

    if (options.siteName) {
      qb.andWhere(
        '(role.key = :adminRole OR LOWER(site.name) = LOWER(:siteName))',
        {
          adminRole: ROLE_ADMIN,
          siteName: options.siteName,
        },
      );
    }

    const users = await qb.getMany();
    return [...new Map(users.map((user) => [user.id, user])).values()];
  }

  async activeAdmins(): Promise<User[]> {
    return this.users
      .createQueryBuilder('u')
      .innerJoin('u.role', 'role')
      .where('u.isActive = true')
      .andWhere('role.key = :adminKey', { adminKey: ROLE_ADMIN })
      .getMany();
  }

  /** Active users whose role grants the given permission slug. */
  async resolveByPermission(slug: string): Promise<User[]> {
    return this.users
      .createQueryBuilder('u')
      .innerJoin('u.role', 'role')
      .innerJoin('role.permissions', 'permission')
      .where('u.isActive = true')
      .andWhere('permission.slug = :slug', { slug })
      .getMany();
  }
}
