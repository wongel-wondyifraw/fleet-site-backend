// Nest injectable and HTTP exception for failed login.
import { Injectable, UnauthorizedException } from '@nestjs/common';
// JwtService signs access tokens.
import { JwtService } from '@nestjs/jwt';

// User entity returned to controllers after login.
import { User } from '../users/user.entity';
// UsersService handles credential verification and login timestamp.
import { UsersService } from '../users/user.service';
// JwtPayload type shared with JwtStrategy.
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    // UsersService verifies email/password and records logins.
    private readonly users: UsersService,
    // JwtService signs the access token returned to the client.
    private readonly jwt: JwtService,
  ) {}

  // Validate email + password; throws 401 on failure.
  async validateUser(email: string, password: string): Promise<User> {
    // Delegate to UsersService which compares bcrypt hashes.
    const user = await this.users.verifyCredentials(email, password);
    // Generic message avoids leaking whether the email exists.
    if (!user) throw new UnauthorizedException('Invalid email or password');
    return user;
  }

  // Sign a JWT and return token + safe user object for the client.
  async login(user: User): Promise<{ accessToken: string; user: User }> {
    // Build the JWT claims; sub is the standard subject (user id).
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    // Sign asynchronously; expiry is configured in AuthModule JwtModule.registerAsync.
    const accessToken = await this.jwt.signAsync(payload);
    // Update lastLoginAt in the background (non-blocking for the response).
    await this.users.recordLogin(user.id);
    // Return both the token and the user profile (passwordHash is excluded via @Exclude).
    return { accessToken, user };
  }
}
