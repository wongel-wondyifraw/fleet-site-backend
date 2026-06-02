import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';
import { UsersService } from '../users/user.service';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.users.verifyCredentials(email, password);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    return user;
  }

  async login(user: User): Promise<{ accessToken: string; user: User }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roleKey: user.role.key,
    };
    const accessToken = await this.jwt.signAsync(payload);
    await this.users.recordLogin(user.id);
    const fresh = await this.users.findOne(user.id);
    return { accessToken, user: fresh };
  }
}
