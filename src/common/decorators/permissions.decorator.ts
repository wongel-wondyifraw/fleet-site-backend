import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export const RequiresPermissions = (...slugs: string[]) =>
  SetMetadata(PERMISSIONS_KEY, slugs);
