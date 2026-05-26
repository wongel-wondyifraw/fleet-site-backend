import { Controller, Get, Header, HttpCode } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';

// Lightweight liveness endpoints that don't touch the database. Render and
// uptime monitors hit "/" by default; we expose a friendly response there
// (and at "/api/health" / "/api/wake") so they stop logging 404s as errors
// and so a cron job can keep this service warm on Render's free tier.
@Controller()
export class HealthController {
  // Root ping — answers GET/HEAD so Render's default health probe passes.
  // setGlobalPrefix() in main.ts excludes "/" so this stays at the root.
  @Public()
  @Get('/')
  root() {
    return this.payload();
  }

  // setGlobalPrefix() also excludes "/health" so this stays at the root.
  @Public()
  @Get('health')
  health() {
    return this.payload();
  }

  // Cron-friendly wake endpoint. Served at /api/wake because the global
  // prefix applies here (it isn't excluded). Returns plain "OK" with a
  // no-cache header so external uptime/cron services don't see stale
  // intermediary responses. Use this from cron-job.org or similar every
  // 10–14 minutes to keep the Render free instance from sleeping; the
  // frontend on Vercel then never sees a cold-start delay when it calls
  // the API right after the user opens the site.
  @Public()
  @Get('wake')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  wake(): string {
    return 'OK';
  }

  private payload() {
    return {
      status: 'ok',
      service: 'fleet-site-backend',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
