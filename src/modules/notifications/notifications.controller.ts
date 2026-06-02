import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';
import {
  MarkNotificationReadDto,
  NotificationQueryDto,
  RegisterPushSubscriptionDto,
  UnregisterPushSubscriptionDto,
  UpdateNotificationPreferencesDto,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: User, @Query() query: NotificationQueryDto) {
    return this.notifications.listForUser(user.id, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: User) {
    return { unreadCount: await this.notifications.getUnreadCount(user.id) };
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkNotificationReadDto,
  ) {
    return this.notifications.markRead(user.id, id, dto.read);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser() user: User) {
    await this.notifications.markAllRead(user.id);
  }

  @Sse('stream')
  stream(@CurrentUser() user: User): Observable<MessageEvent> {
    return this.notifications.streamForUser(user.id);
  }

  @Get('vapid-public-key')
  vapidPublicKey() {
    return { publicKey: this.notifications.getVapidPublicKey() };
  }

  // Diagnostic endpoint: any authenticated user can fire a notification at
  // themselves so they can confirm in-app + browser + push delivery without
  // having to trigger a real domain event. Intended for staging / launch
  // smoke tests; remove (or restrict to ADMIN) before broad rollout.
  @Post('test-push')
  @HttpCode(HttpStatus.CREATED)
  testPush(@CurrentUser() user: User) {
    return this.notifications.sendTestPush(user.id);
  }

  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  subscribe(
    @CurrentUser() user: User,
    @Body() body: RegisterPushSubscriptionDto,
    @Req() req: { headers: Record<string, string | undefined> },
  ) {
    return this.notifications.registerSubscription(
      user.id,
      body,
      req.headers['user-agent'],
    );
  }

  @Get('preferences')
  preferences(@CurrentUser() user: User) {
    return this.notifications.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(user.id, dto);
  }

  @Delete('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @CurrentUser() user: User,
    @Body() body: UnregisterPushSubscriptionDto,
  ) {
    await this.notifications.unregisterSubscription(user.id, body.endpoint);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notifications.dismiss(user.id, id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearAll(@CurrentUser() user: User) {
    await this.notifications.clearAll(user.id);
  }
}
