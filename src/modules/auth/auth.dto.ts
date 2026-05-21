// class-validator decorators for the login payload.
import { IsEmail, IsString, MinLength } from 'class-validator';

// Body shape for POST /auth/login.
export class LoginDto {
  // Email the user types on the login form.
  @IsEmail()
  email!: string;

  // Plain password; compared against bcrypt hash in AuthService.
  @IsString()
  @MinLength(1)
  password!: string;
}
