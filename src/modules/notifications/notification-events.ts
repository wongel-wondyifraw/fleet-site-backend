import { UserRole } from '../../common/enums';
import { NotificationKind, NotificationSeverity } from './notification.entity';

export const NOTIFICATION_EVENT = 'notifications.domain';

export interface NotificationDomainEvent {
  eventName: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  href?: string;
  siteName?: string | null;
  targetRoles: UserRole[];
  includeAdmins?: boolean;
  dedupeKey?: string;
  payload?: Record<string, unknown>;
}
