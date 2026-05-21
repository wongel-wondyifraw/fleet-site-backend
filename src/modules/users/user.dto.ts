// Validation decorators from class-validator power Nest's ValidationPipe.
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MinLength,
} from 'class-validator';
// Transform converts query-string "true"/"false" into actual booleans.
import { Transform } from 'class-transformer';

// UserRole enum is the source of truth for allowed role strings.
import { UserRole } from '../../common/enums';

// Payload accepted by POST /users (admin-only) when creating a new account.
export class CreateUserDto {
  // Must be a valid email; uniqueness is enforced at the DB layer.
  @IsEmail()
  email!: string;

  // Plain password sent by the admin; service hashes it before persistence.
  @IsString()
  @MinLength(8)
  password!: string;

  // Human-friendly name parts; trimmed lightly via Length(1..).
  @IsString()
  @Length(1, 64)
  firstName!: string;

  @IsString()
  @Length(1, 64)
  lastName!: string;

  // Role must come from the UserRole enum; defaults are not applied here on purpose.
  @IsEnum(UserRole)
  role!: UserRole;

  // Optional list of site UUIDs to assign on creation. Empty = no sites.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  siteIds?: string[];

  // Optional active flag; defaults to true at the service layer if omitted.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Payload for PATCH /users/:id - all fields optional, no password here.
export class UpdateUserDto {
  // Allow admins to fix typos in email; uniqueness still enforced at DB.
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  lastName?: string;

  // Allow flipping isActive (soft enable/disable) via this same endpoint.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Payload for password change. Self-serve requires currentPassword; admin reset omits it.
export class ChangePasswordDto {
  // Required only when the user is changing their own password (enforced in controller).
  @IsOptional()
  @IsString()
  currentPassword?: string;

  // The new password to set; same minimum length rule as creation.
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

// Payload for replacing a user's full set of site assignments at once.
export class AssignSitesDto {
  // Empty array is allowed and means "remove all site assignments".
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  siteIds!: string[];
}

// Payload for PATCH /users/:id/role - dedicated endpoint for role changes for auditability.
export class SetRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

// Querystring shape for GET /users - all filters are optional and AND-combined.
export class UserQueryDto {
  // Filter by exact role match.
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // Filter users who have at least this site in their assignments.
  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  // Filter by active/inactive; useful for hiding deactivated accounts.
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  // Free-text search applied across firstName, lastName, and email (ILIKE).
  @IsOptional()
  @IsString()
  search?: string;
}
