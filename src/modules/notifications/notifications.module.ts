import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendancePunch } from '../attendance/attendance-punch.entity';
import { FuelLog } from '../fuel/fuel-log.entity';
import { Site } from '../sites/site.entity';
import { Trip } from '../trips/trip.entity';
import { User } from '../users/user.entity';
import { NotificationAudienceService } from './notification-audience.service';
import { NotificationDomainListener } from './notification-domain.listener';
import { NotificationPreference } from './notification-preference.entity';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSubscription } from './push-subscription.entity';
import { ReportsDigestService } from './reports-digest.service';
import { ReportsDigestController } from './reports-digest.controller';
import { WebPushService } from './web-push.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      Notification,
      PushSubscription,
      NotificationPreference,
      User,
      Trip,
      FuelLog,
      AttendancePunch,
      Site,
    ]),
  ],
  controllers: [NotificationsController, ReportsDigestController],
  providers: [
    NotificationsService,
    WebPushService,
    NotificationAudienceService,
    NotificationDomainListener,
    ReportsDigestService,
  ],
  exports: [NotificationsService, NotificationAudienceService],
})
export class NotificationsModule {}
