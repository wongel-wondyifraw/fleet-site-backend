import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Site } from '../sites/site.entity';
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
    @InjectRepository(Site)
    private readonly sites: Repository<Site>,
  ) {}

  @OnEvent(NOTIFICATION_EVENT, { async: true })
  async handle(event: NotificationDomainEvent): Promise<void> {
    const siteId = await this.resolveSiteId(event);

    const users = await this.audience.resolveRecipients({
      roles: event.targetRoles,
      siteId,
      siteName: event.siteName,
      includeAdmins: event.includeAdmins,
    });

    await Promise.all(
      users.map(async (user) => {
        try {
          await this.notifications.create({
            userId: user.id,
            siteId,
            kind: event.kind,
            severity: event.severity,
            title: event.title,
            message: event.message,
            href: event.href,
            payload: {
              ...(event.payload ?? {}),
              eventName: event.eventName,
              siteName: event.siteName ?? null,
              siteId,
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

  private async resolveSiteId(
    event: NotificationDomainEvent,
  ): Promise<string | null> {
    if (event.siteId) return event.siteId;
    if (!event.siteName) return null;
    const site = await this.sites
      .createQueryBuilder('site')
      .where('LOWER(site.name) = LOWER(:name)', { name: event.siteName })
      .getOne();
    return site?.id ?? null;
  }
}
