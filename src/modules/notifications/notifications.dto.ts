import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { NotificationKind, NotificationSeverity } from './notification.entity';

export class NotificationQueryDto extends PaginationDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unread?: boolean;

  @IsOptional()
  @IsEnum(NotificationKind)
  kind?: NotificationKind;
}

export class MarkNotificationReadDto {
  @IsBoolean()
  @Type(() => Boolean)
  read!: boolean;
}

export class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  auth!: string;
}

export class RegisterPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class UnregisterPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint!: string;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsObject()
  inAppPerKind?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  osToastPerKind?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  webPushPerKind?: Record<string, boolean>;
}

export interface NotificationApiItem {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  href?: string;
  createdAt: string;
  read: boolean;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
}

export interface NotificationStreamEvent {
  type: 'notification.created' | 'notification.updated' | 'heartbeat';
  item?: NotificationApiItem;
  unreadCount?: number;
  ts?: string;
}
