import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  MessageEvent,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Subject, Observable, interval, map } from 'rxjs';
import {
  buildNextCursor,
  PageResponse,
  parseCursor,
  resolveLimit,
} from '../../common/dto/pagination.dto';
import { NotificationPreference } from './notification-preference.entity';
import {
  Notification,
  NotificationKind,
  NotificationSeverity,
} from './notification.entity';
import { PushSubscription } from './push-subscription.entity';
import {
  NotificationApiItem,
  NotificationQueryDto,
  NotificationStreamEvent,
  RegisterPushSubscriptionDto,
  UpdateNotificationPreferencesDto,
} from './notifications.dto';
import { Repository } from 'typeorm';
import { WebPushService } from './web-push.service';

interface UserStreamState {
  subject: Subject<NotificationStreamEvent>;
  refs: number;
}

export interface CreateNotificationInput {
  userId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  href?: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly streams = new Map<string, UserStreamState>();
  private readonly createCounters = new Map<string, { minute: number; count: number }>();

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(PushSubscription)
    private readonly subscriptions: Repository<PushSubscription>,
    @InjectRepository(NotificationPreference)
    private readonly preferences: Repository<NotificationPreference>,
    private readonly webPush: WebPushService,
  ) {}

  async listForUser(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<PageResponse<NotificationApiItem>> {
    const limit = resolveLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const qb = this.notifications
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .andWhere('n.dismissedAt IS NULL');

    if (query.unread === true) qb.andWhere('n.readAt IS NULL');
    if (query.unread === false) qb.andWhere('n.readAt IS NOT NULL');
    if (query.kind) qb.andWhere('n.kind = :kind', { kind: query.kind });
    if (cursor) {
      qb.andWhere(
        '(n.createdAt < :cursorAt OR (n.createdAt = :cursorAt AND n.id < :cursorId))',
        {
          cursorAt: cursor.createdAt,
          cursorId: cursor.id,
        },
      );
    }

    qb.orderBy('n.createdAt', 'DESC').addOrderBy('n.id', 'DESC').take(limit + 1);
    const rows = await qb.getMany();
    return {
      data: rows.slice(0, limit).map((row) => this.toApiItem(row)),
      nextCursor: buildNextCursor(rows, limit),
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifications
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .andWhere('n.readAt IS NULL')
      .andWhere('n.dismissedAt IS NULL')
      .getCount();
  }

  async markRead(userId: string, id: string, read: boolean): Promise<NotificationApiItem> {
    const row = await this.notifications
      .createQueryBuilder('n')
      .where('n.id = :id', { id })
      .andWhere('n.userId = :userId', { userId })
      .andWhere('n.dismissedAt IS NULL')
      .getOne();
    if (!row) throw new NotFoundException(`Notification ${id} not found`);
    row.readAt = read ? new Date() : null;
    await this.notifications.save(row);
    await this.emitUpdated(userId, row);
    return this.toApiItem(row);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: () => 'CURRENT_TIMESTAMP' })
      .where('userId = :userId', { userId })
      .andWhere('readAt IS NULL')
      .andWhere('dismissedAt IS NULL')
      .execute();
    this.emit(userId, { type: 'notification.updated', unreadCount: 0 });
  }

  async dismiss(userId: string, id: string): Promise<void> {
    const result = await this.notifications
      .createQueryBuilder()
      .update(Notification)
      .set({ dismissedAt: () => 'CURRENT_TIMESTAMP' })
      .where('id = :id', { id })
      .andWhere('userId = :userId', { userId })
      .execute();
    if (!result.affected) throw new NotFoundException(`Notification ${id} not found`);
    this.emit(userId, {
      type: 'notification.updated',
      unreadCount: await this.getUnreadCount(userId),
    });
  }

  async clearAll(userId: string): Promise<void> {
    await this.notifications
      .createQueryBuilder()
      .update(Notification)
      .set({ dismissedAt: () => 'CURRENT_TIMESTAMP' })
      .where('userId = :userId', { userId })
      .andWhere('dismissedAt IS NULL')
      .execute();
    this.emit(userId, { type: 'notification.updated', unreadCount: 0 });
  }

  // Convenience wrapper used by the "Send test notification" button in the
  // settings panel. Skips the dedupe key so the user can fire repeated
  // tests without hitting the unique-index, and routes through the same
  // create() path as real notifications so SSE + push + browser toast
  // behave identically.
  async sendTestPush(userId: string): Promise<NotificationApiItem> {
    return this.create({
      userId,
      kind: NotificationKind.SYSTEM,
      severity: NotificationSeverity.INFO,
      title: 'Test notification',
      message:
        'If you see this, in-app, browser and push delivery are working on this device.',
      href: '/notifications',
      payload: { test: true, sentAt: new Date().toISOString() },
    });
  }

  async create(input: CreateNotificationInput): Promise<NotificationApiItem> {
    this.guardCreationRate(input.userId);
    const entity = this.notifications.create({
      userId: input.userId,
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
      payload: input.payload ?? null,
      dedupeKey: input.dedupeKey ?? null,
    });
    let saved: Notification;
    try {
      saved = await this.notifications.save(entity);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505' &&
        input.dedupeKey
      ) {
        throw new ConflictException(`Duplicate notification dedupeKey ${input.dedupeKey}`);
      }
      throw error;
    }

    const item = this.toApiItem(saved);
    const unreadCount = await this.getUnreadCount(input.userId);
    this.emit(input.userId, { type: 'notification.created', item, unreadCount });
    this.sendPushToUser(input.userId, item).catch((err: unknown) => {
      this.logger.warn(
        `Web push send failed for user=${input.userId}: ${String(err)}`,
      );
    });
    return item;
  }

  streamForUser(userId: string): Observable<MessageEvent> {
    const state = this.getOrCreateStream(userId);
    state.refs += 1;

    const event$ = new Observable<NotificationStreamEvent>((subscriber) => {
      const sub = state.subject.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        const current = this.streams.get(userId);
        if (!current) return;
        current.refs -= 1;
        if (current.refs <= 0) {
          current.subject.complete();
          this.streams.delete(userId);
        }
      };
    });

    const heartbeat$ = interval(25_000).pipe(
      map(
        (): NotificationStreamEvent => ({
          type: 'heartbeat',
          ts: new Date().toISOString(),
        }),
      ),
    );

    return new Observable<MessageEvent>((subscriber) => {
      const a = event$.subscribe((evt) =>
        subscriber.next({ type: evt.type, data: evt }),
      );
      const b = heartbeat$.subscribe((evt) =>
        subscriber.next({ type: evt.type, data: evt }),
      );
      return () => {
        a.unsubscribe();
        b.unsubscribe();
      };
    });
  }

  async registerSubscription(
    userId: string,
    dto: RegisterPushSubscriptionDto,
    userAgent?: string,
  ): Promise<void> {
    const existing = await this.subscriptions.findOne({
      where: { endpoint: dto.endpoint },
    });
    const now = new Date();
    if (existing) {
      existing.userId = userId;
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      existing.userAgent = userAgent ?? existing.userAgent;
      existing.lastSeenAt = now;
      await this.subscriptions.save(existing);
      return;
    }
    await this.subscriptions.save(
      this.subscriptions.create({
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: userAgent ?? null,
        lastSeenAt: now,
      }),
    );
  }

  getVapidPublicKey(): string {
    return this.webPush.getVapidPublicKey();
  }

  async unregisterSubscription(userId: string, endpoint: string): Promise<void> {
    await this.subscriptions.delete({ userId, endpoint });
  }

  async getPreferences(userId: string): Promise<NotificationPreference> {
    let pref = await this.preferences.findOne({ where: { userId } });
    if (pref) return pref;
    pref = this.preferences.create({
      userId,
      inAppPerKind: this.defaultKindMap(true),
      osToastPerKind: this.defaultKindMap(true),
      webPushPerKind: this.defaultKindMap(true),
    });
    pref.osToastPerKind.system = false;
    pref.webPushPerKind.system = false;
    return this.preferences.save(pref);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    const current = await this.getPreferences(userId);
    current.inAppPerKind = { ...current.inAppPerKind, ...(dto.inAppPerKind ?? {}) };
    current.osToastPerKind = {
      ...current.osToastPerKind,
      ...(dto.osToastPerKind ?? {}),
    };
    current.webPushPerKind = {
      ...current.webPushPerKind,
      ...(dto.webPushPerKind ?? {}),
    };
    return this.preferences.save(current);
  }

  private async emitUpdated(userId: string, row: Notification): Promise<void> {
    this.emit(userId, {
      type: 'notification.updated',
      item: this.toApiItem(row),
      unreadCount: await this.getUnreadCount(userId),
    });
  }

  private emit(userId: string, event: NotificationStreamEvent): void {
    const state = this.streams.get(userId);
    if (!state) return;
    state.subject.next(event);
  }

  private getOrCreateStream(userId: string): UserStreamState {
    const existing = this.streams.get(userId);
    if (existing) return existing;
    const state: UserStreamState = { subject: new Subject(), refs: 0 };
    this.streams.set(userId, state);
    return state;
  }

  private async sendPushToUser(userId: string, item: NotificationApiItem): Promise<void> {
    const pref = await this.getPreferences(userId);
    if (pref.webPushPerKind[item.kind] === false) return;
    const subs = await this.subscriptions.find({ where: { userId } });
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await this.webPush.send(
            {
              endpoint: sub.endpoint,
              keys: { auth: sub.auth, p256dh: sub.p256dh },
            },
            item,
          );
        } catch (err: unknown) {
          const statusCode =
            typeof err === 'object' &&
            err !== null &&
            'statusCode' in err &&
            typeof (err as { statusCode?: number }).statusCode === 'number'
              ? (err as { statusCode: number }).statusCode
              : undefined;
          if (statusCode === 404 || statusCode === 410) {
            await this.subscriptions.delete({ endpoint: sub.endpoint });
            return;
          }
          throw err;
        }
      }),
    );
  }

  private defaultKindMap(defaultValue: boolean): Record<string, boolean> {
    return Object.values(NotificationKind).reduce<Record<string, boolean>>(
      (acc, kind) => {
        acc[kind] = defaultValue;
        return acc;
      },
      {},
    );
  }

  private guardCreationRate(userId: string): void {
    const nowMinute = Math.floor(Date.now() / 60_000);
    const state = this.createCounters.get(userId);
    if (!state || state.minute !== nowMinute) {
      this.createCounters.set(userId, { minute: nowMinute, count: 1 });
      return;
    }
    state.count += 1;
    if (state.count > 120) {
      throw new ConflictException('Notification rate limit exceeded for user');
    }
  }

  private toApiItem(row: Notification): NotificationApiItem {
    return {
      id: row.id,
      kind: row.kind,
      severity: row.severity,
      title: row.title,
      message: row.message,
      href: row.href ?? undefined,
      createdAt: row.createdAt.toISOString(),
      read: !!row.readAt,
      payload: row.payload ?? undefined,
      dedupeKey: row.dedupeKey ?? undefined,
    };
  }
}
