import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserRole } from '../../common/enums';
import { User } from '../users/user.entity';

@Injectable()
export class NotificationAudienceService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async resolveRecipients(options: {
    roles: UserRole[];
    siteName?: string | null;
    includeAdmins?: boolean;
  }): Promise<User[]> {
    const roleSet = new Set(options.roles);
    if (options.includeAdmins !== false) roleSet.add(UserRole.ADMIN);

    const qb = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.sites', 'site')
      .where('u.isActive = true')
      .andWhere('u.role IN (:...roles)', { roles: [...roleSet] });

    if (options.siteName) {
      qb.andWhere(
        '(u.role = :adminRole OR LOWER(site.name) = LOWER(:siteName))',
        {
          adminRole: UserRole.ADMIN,
          siteName: options.siteName,
        },
      );
    }

    const users = await qb.getMany();
    return [...new Map(users.map((user) => [user.id, user])).values()];
  }

  async activeAdmins(): Promise<User[]> {
    return this.users.find({
      where: { role: In([UserRole.ADMIN]), isActive: true },
    });
  }
}
