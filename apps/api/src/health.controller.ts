import { Controller, Get, Inject, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { DATABASE_POOL } from './modules/database/database.constants.js';
import { REDIS_CLIENT } from './modules/redis/redis.module.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  @Get()
  async getHealth() {
    const checks: Record<string, string> = {};

    try {
      await this.pool.query('select 1');
      checks.database = 'up';
    } catch (err) {
      checks.database = `down: ${(err as Error).message}`;
    }

    if (this.redis) {
      try {
        await this.redis.ping();
        checks.redis = 'up';
      } catch (err) {
        checks.redis = `down: ${(err as Error).message}`;
      }
    } else {
      checks.redis = 'unconfigured';
    }

    // The server is up as long as it's responding. Degraded deps don't make it unhealthy.
    return {
      ok: true,
      service: 'api',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
