import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.module.js';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY, type RateLimitConfig } from './rate-limit.decorator.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipRateLimit) {
      return true;
    }

    const config = this.reflector.getAllAndOverride<RateLimitConfig>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const clientIp = this.extractClientIp(request);
    const endpointKey = this.buildEndpointKey(request);
    const prefix = config.keyPrefix ? `${config.keyPrefix}:` : '';
    const redisKey = `rate_limit:${prefix}${clientIp}:${endpointKey}`;

    const currentCount = await this.redis.incr(redisKey);

    if (currentCount === 1) {
      await this.redis.expire(redisKey, config.windowSeconds);
    }

    if (currentCount > config.max) {
      const ttl = await this.redis.ttl(redisKey);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter: ttl > 0 ? ttl : config.windowSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private extractClientIp(request: any): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  private buildEndpointKey(request: any): string {
    const routePath = request.routeOptions?.url || request.raw?.url || '/';
    const method = request.method || 'GET';
    return `${method}:${routePath}`;
  }
}
