// ValidationPipe validates and transforms incoming DTOs.
import {
  ClassSerializerInterceptor,
  Logger,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
// Reflector is required by ClassSerializerInterceptor to read @Exclude metadata.
import { Reflector } from '@nestjs/core';
// NestFactory bootstraps the HTTP application.
import { NestFactory } from '@nestjs/core';
// Root module containing all feature imports.
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';

function resolveNestLogLevels(): ('log' | 'error' | 'warn' | 'debug' | 'verbose')[] {
  const level = (process.env.LOG_LEVEL ?? 'log').toLowerCase();
  switch (level) {
    case 'error':
      return ['error'];
    case 'warn':
      return ['error', 'warn'];
    case 'debug':
      return ['log', 'error', 'warn', 'debug'];
    case 'verbose':
      return ['log', 'error', 'warn', 'debug', 'verbose'];
    case 'log':
    default:
      return ['log', 'error', 'warn'];
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const logLevels = resolveNestLogLevels();

  // Create the Nest application from AppModule.
  const app = await NestFactory.create(AppModule, { logger: logLevels });

  // All routes are prefixed with /api (e.g. /api/auth/login). Exclude the
  // root and /health endpoints so Render's default health probe (which hits
  // "/") and uptime monitors get a 200 instead of a 404.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: '/', method: RequestMethod.HEAD },
      { path: 'health', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.HEAD },
    ],
  });
  // Allow browser clients (frontend) to call the API with credentials.
  app.enableCors({ origin: true, credentials: true });

  // Log every HTTP request/response (passwords redacted). Set LOG_HTTP=false to
  // disable. Set LOG_HTTP_BODY=false to skip POST/PATCH bodies.
  if (process.env.LOG_HTTP !== 'false') {
    app.useGlobalInterceptors(new HttpLoggingInterceptor());
  }

  // Log all unhandled errors with stack traces to Render/Vercel log drains.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Strip unknown fields and coerce types on every request body/query.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Serialize responses through class-transformer so @Exclude() on passwordHash works.
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Render injects PORT automatically (often 10000). Locally we fall back to
  // 3001. The public URL never includes this port — browsers use HTTPS :443.
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');

  logger.log(`FleetSite API listening on 0.0.0.0:${port} (routes under /api)`);
  logger.log(`NODE_ENV=${process.env.NODE_ENV ?? 'development'}`);
  logger.log(`HTTP logging=${process.env.LOG_HTTP !== 'false' ? 'on' : 'off'}`);
  logger.log(
    `Request body logging=${process.env.LOG_HTTP_BODY !== 'false' ? 'on' : 'off'} (passwords redacted)`,
  );
  if (process.env.DB_LOGGING === 'true') {
    logger.log('SQL query logging=on (DB_LOGGING=true)');
  }
}

bootstrap();
