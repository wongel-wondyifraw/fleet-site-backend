import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SITES_BYPASS_SCOPE } from '../../common/site-scope/site-scope.constants';
import { User } from '../users/user.entity';

@Injectable()
export class NotificationAudienceService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async resolveRecipients(options: {
    roles: string[];
    siteId?: string | null;
    siteName?: string | null;
    includeAdmins?: boolean;
  }): Promise<User[]> {
    const roleSet = new Set(options.roles);
    const roles = [...roleSet];

    const qb = this.users
      .createQueryBuilder('u')
      .innerJoin('u.role', 'role')
      .leftJoinAndSelect('u.sites', 'site')
      .leftJoin('role.permissions', 'perm')
      .where('u.isActive = true');

    if (options.includeAdmins !== false) {
      qb.andWhere('(role.key IN (:...roles) OR perm.slug = :bypass)', {
        roles,
        bypass: SITES_BYPASS_SCOPE,
      });
    } else {
      qb.andWhere('role.key IN (:...roles)', { roles });
    }

    if (options.siteId) {
      qb.andWhere('(perm.slug = :bypass OR site.id = :siteId)', {
        bypass: SITES_BYPASS_SCOPE,
        siteId: options.siteId,
      });
    } else if (options.siteName) {
      qb.andWhere(
        '(perm.slug = :bypass OR LOWER(site.name) = LOWER(:siteName))',
        { bypass: SITES_BYPASS_SCOPE, siteName: options.siteName },
      );
    }

    const users = await qb.getMany();
    return [...new Map(users.map((user) => [user.id, user])).values()];
  }

  async activeAdmins(): Promise<User[]> {
    return this.users
      .createQueryBuilder('u')
      .innerJoin('u.role', 'role')
      .innerJoin('role.permissions', 'permission')
      .where('u.isActive = true')
      .andWhere('permission.slug = :slug', { slug: SITES_BYPASS_SCOPE })
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
