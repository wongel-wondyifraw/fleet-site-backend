import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';

// Lightweight liveness endpoints that don't touch the database. Render and
// uptime monitors hit "/" by default; we expose a friendly response there
// (and at "/api/health") so they stop logging 404s as errors.
@Controller()
export class HealthController {
  // Root ping — answers GET/HEAD so Render's default health probe passes.
  @Public()
  @Get('/')
  root() {
    return this.payload();
  }

  // Alias under the global /api prefix doesn't work for the root because the
  // prefix excludes it, so we register a sibling at /health (still under
  // /api thanks to setGlobalPrefix) for explicit checks from clients.
  @Public()
  @Get('health')
  health() {
    return this.payload();
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
