import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @Length(2, 64)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'key must be uppercase letters, digits, and underscores',
  })
  key!: string;

  @IsString()
  @Length(1, 128)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  description?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionSlugs!: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionSlugs?: string[];
}
