// Nest HTTP decorators.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

// @CurrentUser pulls req.user into a handler parameter.
import { CurrentUser } from '../../common/decorators/current-user.decorator';
// @Public() skips JwtAuthGuard for the login endpoint.
import { Public } from '../../common/decorators/public.decorator';
// JwtAuthGuard protects authenticated routes.
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// ChangePasswordDto reused from users module.
import { ChangePasswordDto } from '../users/user.dto';
// User entity type for handler parameters.
import { User } from '../users/user.entity';
// UsersService handles self-serve password changes.
import { UsersService } from '../users/user.service';
// Login request body shape.
import { LoginDto } from './auth.dto';
// AuthService handles validate + sign.
import { AuthService } from './auth.service';

// All routes under /api/auth.
@Controller('auth')
export class AuthController {
  constructor(
    // AuthService validates credentials and signs JWTs.
    private readonly auth: AuthService,
    // UsersService performs the actual password hash update.
    private readonly users: UsersService,
  ) {}

  // POST /api/auth/login - public, no JWT required.
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    // Verify credentials; throws 401 if invalid.
    const user = await this.auth.validateUser(dto.email, dto.password);
    // Sign JWT and return { accessToken, user }.
    return this.auth.login(user);
  }

  // GET /api/auth/me - returns the currently authenticated user profile.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: User | undefined) {
    // Defensive check; JwtGuard should always populate user.
    if (!user) throw new UnauthorizedException();
    return user;
  }

  // PATCH /api/auth/me/password - self-serve password change.
  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeOwnPassword(
    @CurrentUser() user: User | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    if (!user) throw new UnauthorizedException();
    // Require current password for self-serve changes.
    if (!dto.currentPassword) {
      throw new UnauthorizedException('Current password is required');
    }
    // Verify old password and persist the new hash.
    await this.users.changeOwnPassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
