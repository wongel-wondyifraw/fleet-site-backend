import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationDomainEvent,
  NOTIFICATION_EVENT,
} from './notification-events';
import { NotificationAudienceService } from './notification-audience.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationDomainListener {
  private readonly logger = new Logger(NotificationDomainListener.name);

  constructor(
    private readonly audience: NotificationAudienceService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(NOTIFICATION_EVENT, { async: true })
  async handle(event: NotificationDomainEvent): Promise<void> {
    const users = await this.audience.resolveRecipients({
      roles: event.targetRoles,
      siteName: event.siteName,
      includeAdmins: event.includeAdmins,
    });

    await Promise.all(
      users.map(async (user) => {
        try {
          await this.notifications.create({
            userId: user.id,
            kind: event.kind,
            severity: event.severity,
            title: event.title,
            message: event.message,
            href: event.href,
            payload: {
              ...(event.payload ?? {}),
              eventName: event.eventName,
              siteName: event.siteName ?? null,
            },
            dedupeKey: event.dedupeKey
              ? `${event.dedupeKey}:user:${user.id}`
              : undefined,
          });
        } catch (err: unknown) {
          this.logger.warn(
            `Could not create notification for user=${user.id} event=${event.eventName}: ${String(err)}`,
          );
        }
      }),
    );
  }
}
