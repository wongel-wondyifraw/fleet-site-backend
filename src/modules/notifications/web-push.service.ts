import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush, { PushSubscription } from 'web-push';
import { NotificationApiItem } from './notifications.dto';

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly isEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject =
      this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:ops@fleetsite.app';

    if (!publicKey || !privateKey) {
      this.isEnabled = false;
      this.logger.warn(
        'Web push disabled: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing.',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.isEnabled = true;
  }

  getVapidPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY', '');
  }

  async send(
    subscription: PushSubscription,
    item: NotificationApiItem,
  ): Promise<void> {
    if (!this.isEnabled) return;
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: item.title,
        body: item.message,
        href: item.href ?? '/notifications',
        tag: item.dedupeKey ?? item.id,
        kind: item.kind,
        severity: item.severity,
        notificationId: item.id,
      }),
    );
  }
}
