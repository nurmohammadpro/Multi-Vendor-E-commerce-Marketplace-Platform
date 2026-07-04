import 'reflect-metadata';

import cors from '@fastify/cors';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { ZodExceptionFilter } from './common/zod-exception.filter.js';
import { RateLimitGuard } from './modules/guard/rate-limit.guard.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // CSP and security headers are set at the Traefik reverse-proxy layer

  await app.register(cors, {
    origin: true,
  });

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  const rateLimitGuard = app.get(RateLimitGuard);
  app.useGlobalGuards(rateLimitGuard);
  app.useGlobalFilters(new ZodExceptionFilter());

  const port = Number(process.env.PORT || 3001);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error) => {
  console.error('API bootstrap failed', error);
  process.exit(1);
});
