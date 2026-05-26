import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Catches every thrown error (HTTP and unexpected) so nothing fails silently
// in production logs on Render.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.resolveStatus(exception);
    const message = this.resolveMessage(exception);
    const user = request.user as
      | { id?: string; email?: string; role?: string }
      | undefined;
    const userPart = user
      ? ` user="${user.email ?? user.id}" role=${user.role ?? 'unknown'}`
      : '';

    const stack =
      exception instanceof Error ? exception.stack : undefined;

    if (this.isExpected404(status, request)) {
      this.logger.warn(
        `✖ ${request.method} ${request.originalUrl} ${status}${userPart} — ${message}`,
      );
    } else {
      this.logger.error(
        `✖ ${request.method} ${request.originalUrl} ${status}${userPart} — ${message}`,
        stack,
      );
    }

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: status,
            message:
              status >= 500 && process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : message,
            error: status >= 500 ? 'Internal Server Error' : 'Error',
          };

    response.status(status).json(payload);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  // Misses on bot-crawled paths (favicon, robots.txt, ...) are noise, not bugs.
  // Log them at warn level with no stack so logs stay readable.
  private isExpected404(status: number, request: Request): boolean {
    if (status !== 404) return false;
    const path = request.path ?? request.originalUrl;
    return (
      path === '/' ||
      path === '/favicon.ico' ||
      path === '/robots.txt' ||
      path === '/health'
    );
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') return body;
      if (
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof (body as { message: unknown }).message === 'string'
      ) {
        return (body as { message: string }).message;
      }
      return exception.message;
    }
    if (exception instanceof Error) return exception.message;
    return 'Unknown error';
  }
}
