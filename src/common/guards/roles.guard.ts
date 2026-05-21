// Common Nest imports: guard interface, exception classes, decorator.
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
// Reflector reads the metadata set by @Roles().
import { Reflector } from '@nestjs/core';

// Metadata key and role enum from our decorator/enums modules.
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums';
// User type so we can type req.user safely.
import { User } from '../../modules/users/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  // Reflector pulls the required roles from the decorator metadata.
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Look up the @Roles(...) metadata on method first, then controller.
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    // No metadata means the route is open to any authenticated user.
    if (!required || required.length === 0) return true;
    // Pull req.user populated by JwtStrategy.
    const request = context.switchToHttp().getRequest<{ user?: User }>();
    const user = request.user;
    // No user object means JwtAuthGuard didn't run or failed - block defensively.
    if (!user) throw new ForbiddenException('Not authenticated');
    // Allow when the user's role is in the required set; deny otherwise.
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Requires one of roles: ${required.join(', ')}`,
      );
    }
    return true;
  }
}
