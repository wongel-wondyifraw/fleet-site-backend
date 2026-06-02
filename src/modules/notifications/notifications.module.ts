import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { NotificationAudienceService } from './notification-audience.service';
import { NotificationDomainListener } from './notification-domain.listener';
import { NotificationPreference } from './notification-preference.entity';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSubscription } from './push-subscription.entity';
import { WebPushService } from './web-push.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      PushSubscription,
      NotificationPreference,
      User,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    WebPushService,
    NotificationAudienceService,
    NotificationDomainListener,
  ],
  exports: [NotificationsService, NotificationAudienceService],
})
export class NotificationsModule {}
