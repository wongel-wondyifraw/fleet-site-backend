// SetMetadata is used to flag routes that should bypass JwtAuthGuard.
import { SetMetadata } from '@nestjs/common';

// Public metadata key consumed by JwtAuthGuard.
export const IS_PUBLIC_KEY = 'isPublic';

// @Public() marks a route as not requiring authentication (e.g. /auth/login).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
