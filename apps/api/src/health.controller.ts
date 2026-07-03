import { Controller, Get, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { DATABASE_POOL } from './modules/database/database.constants.js';
import { REDIS_CLIENT } from './modules/redis/redis.module.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  async getHealth() {
    const checks: Record<string, boolean> = {};

    try {
      await this.pool.query('select 1');
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      await this.redis.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }

    const allOk = Object.values(checks).every(Boolean);

    return {
      ok: allOk,
      service: 'api',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
