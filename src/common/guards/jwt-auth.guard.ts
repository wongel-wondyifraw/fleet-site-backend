// ExecutionContext gives access to the incoming request/handler context.
import { ExecutionContext, Injectable } from '@nestjs/common';
// Reflector reads metadata that decorators attach to handlers.
import { Reflector } from '@nestjs/core';
// AuthGuard('jwt') is the built-in Passport guard that runs JwtStrategy.
import { AuthGuard } from '@nestjs/passport';

// Metadata key set by @Public() to mark routes as not requiring authentication.
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
// Extending AuthGuard('jwt') wires this guard to our JwtStrategy.
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Reflector is needed to inspect @Public() metadata; we call super() to satisfy the base class.
  constructor(private readonly reflector: Reflector) {
    super();
  }

  // canActivate decides if the request proceeds; we short-circuit for @Public() routes.
  canActivate(context: ExecutionContext) {
    // Look for the IS_PUBLIC_KEY on the method first, then the controller class.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Public routes skip auth entirely.
    if (isPublic) return true;
    // Otherwise delegate to Passport which runs JwtStrategy.validate().
    return super.canActivate(context);
  }
}
