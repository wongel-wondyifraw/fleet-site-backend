// Injectable so Nest can register this as a provider.
import { Injectable, UnauthorizedException } from '@nestjs/common';
// ConfigService reads JWT_SECRET from environment.
import { ConfigService } from '@nestjs/config';
// PassportStrategy wires our validate() into the passport-jwt flow.
import { PassportStrategy } from '@nestjs/passport';
// ExtractJwt and Strategy come from passport-jwt.
import { ExtractJwt, Strategy } from 'passport-jwt';

// UserRole enum for typing the JWT payload.
import { UserRole } from '../../common/enums';
// UsersService re-fetches the user so role/isActive are always current.
import { UsersService } from '../users/user.service';

// Shape of the JWT payload we sign in AuthService.login().
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    // ConfigService supplies the secret used to verify tokens.
    config: ConfigService,
    // UsersService loads the full user row on every authenticated request.
    private readonly users: UsersService,
  ) {
    // super() configures passport-jwt with extraction rules and secret.
    super({
      // Read the token from the Authorization: Bearer <token> header.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Reject expired tokens automatically.
      ignoreExpiration: false,
      // Secret must match the one used when signing in AuthService.
      secretOrKey: config.get<string>('JWT_SECRET', 'change-me-in-production'),
    });
  }

  // Called by Passport after the JWT signature and expiry are verified.
  async validate(payload: JwtPayload) {
    // Re-fetch the user from DB so deactivated accounts are blocked immediately.
    const user = await this.users.findOne(payload.sub);
    // Belt-and-suspenders: refuse inactive users even if the token is valid.
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }
    // Return value is attached to req.user for guards and @CurrentUser().
    return user;
  }
}
