// ValidationPipe validates and transforms incoming DTOs.
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
// Reflector is required by ClassSerializerInterceptor to read @Exclude metadata.
import { Reflector } from '@nestjs/core';
// NestFactory bootstraps the HTTP application.
import { NestFactory } from '@nestjs/core';
// Root module containing all feature imports.
import { AppModule } from './app.module';

async function bootstrap() {
  // Create the Nest application from AppModule.
  const app = await NestFactory.create(AppModule);

  // All routes are prefixed with /api (e.g. /api/auth/login).
  app.setGlobalPrefix('api');
  // Allow browser clients (frontend) to call the API with credentials.
  app.enableCors({ origin: true, credentials: true });
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

  // Read port from env or fall back to 3001. Bind to 0.0.0.0 so the API is
  // reachable from other devices on the LAN (e.g. a phone) during development.
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`FleetSite API listening on http://0.0.0.0:${port}/api`);
}

bootstrap();
