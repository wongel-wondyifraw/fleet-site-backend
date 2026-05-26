import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

// Keys we never write to logs, even when request-body logging is enabled.
const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'accessToken',
  'refreshToken',
]);

type RequestUser = {
  id?: string;
  email?: string;
  role?: string;
};

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = Date.now();
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') ?? 'unknown';
    const user = req.user as RequestUser | undefined;
    const userPart = formatUser(user);
    const bodyPart = formatBody(method, req.body);

    this.logger.log(
      `→ ${method} ${originalUrl} ip=${ip} ua="${truncate(userAgent, 80)}"${userPart}${bodyPart}`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - started;
          this.logger.log(
            `← ${method} ${originalUrl} ${res.statusCode} ${ms}ms${userPart}`,
          );
        },
        error: (err: unknown) => {
          const ms = Date.now() - started;
          const status = extractStatus(err);
          const message =
            err instanceof Error ? err.message : 'Unknown error';
          this.logger.error(
            `← ${method} ${originalUrl} ${status} ${ms}ms${userPart} — ${message}`,
          );
        },
      }),
    );
  }
}

function formatUser(user: RequestUser | undefined): string {
  if (!user) return '';
  const who = user.email ?? user.id ?? 'unknown';
  return ` user="${who}" role=${user.role ?? 'unknown'}`;
}

function formatBody(method: string, body: unknown): string {
  if (!shouldLogBody(method) || body === undefined || body === null) {
    return '';
  }
  if (typeof body !== 'object') {
    return ` body=${String(body)}`;
  }
  try {
    return ` body=${JSON.stringify(sanitizeBody(body))}`;
  } catch {
    return ' body=[unserializable]';
  }
}

function shouldLogBody(method: string): boolean {
  if (process.env.LOG_HTTP_BODY === 'false') return false;
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

function sanitizeBody(body: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_BODY_KEYS.has(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = value;
  }
  return out;
}

function extractStatus(err: unknown): number {
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  ) {
    return (err as { status: number }).status;
  }
  if (
    typeof err === 'object' &&
    err !== null &&
    'getStatus' in err &&
    typeof (err as { getStatus: () => number }).getStatus === 'function'
  ) {
    return (err as { getStatus: () => number }).getStatus();
  }
  return 500;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
