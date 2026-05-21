// SetMetadata attaches arbitrary metadata to route handlers; Reflector reads it later.
import { SetMetadata } from '@nestjs/common';

// Role enum we'll be matching against.
import { UserRole } from '../enums';

// Metadata key used by RolesGuard - exported so the guard imports the same string.
export const ROLES_KEY = 'roles';

// Decorator applied to controllers/methods: @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER).
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
