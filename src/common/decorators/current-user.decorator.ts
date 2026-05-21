// createParamDecorator lets us pull custom values out of the request into handler args.
import { ExecutionContext, createParamDecorator } from '@nestjs/common';

// User entity is the shape Passport puts on req.user after JwtStrategy.validate().
import { User } from '../../modules/users/user.entity';

// @CurrentUser() user: User - convenient sugar over req.user inside controllers.
export const CurrentUser = createParamDecorator(
  // The data argument is unused; we always return the whole user object.
  (_data: unknown, ctx: ExecutionContext): User | undefined => {
    // Get the raw HTTP request from the execution context.
    const request = ctx.switchToHttp().getRequest<{ user?: User }>();
    // Return req.user (set by Passport on successful auth) or undefined.
    return request.user;
  },
);
