import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** @deprecated Prefer @RequiresPermissions(); checks user.role.key. */
export const Roles = (...roleKeys: string[]) => SetMetadata(ROLES_KEY, roleKeys);
