import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

import { SiteStatus, SiteType } from '../../common/enums';

// Required fields for creating a site from the Settings -> Sites panel.
// Status is optional on create: the service defaults it to PLANNING.
export class CreateSiteDto {
  @IsString()
  @Length(2, 128)
  name!: string;

  @IsEnum(SiteType)
  type!: SiteType;

  @IsOptional()
  @IsEnum(SiteStatus)
  status?: SiteStatus;

  @IsString()
  @Length(1, 255)
  address!: string;

  @IsString()
  @Length(1, 128)
  city!: string;

  @IsString()
  @Length(1, 128)
  state!: string;

  // Optional list of user UUIDs assigned to this site on creation.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds?: string[];
}

// All fields optional - panel sends a full object but PATCH should tolerate partial.
export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @Length(2, 128)
  name?: string;

  @IsOptional()
  @IsEnum(SiteType)
  type?: SiteType;

  @IsOptional()
  @IsEnum(SiteStatus)
  status?: SiteStatus;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  state?: string;

  // When provided, replaces the full set of assigned users.
  // Pass [] to clear all assignments; omit to leave them untouched.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds?: string[];
}

// Query filters supported by GET /sites.
export class SiteQueryDto {
  @IsOptional()
  @IsEnum(SiteStatus)
  status?: SiteStatus;

  @IsOptional()
  @IsEnum(SiteType)
  type?: SiteType;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
