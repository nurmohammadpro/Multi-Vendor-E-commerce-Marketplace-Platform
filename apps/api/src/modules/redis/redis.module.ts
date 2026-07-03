import { Global, Module } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy(times: number) {
            if (times > 5) return null;
            return Math.min(times * 200, 2000);
          },
        });

        client.on('error', (err: Error) => {
          console.error('Redis connection error', err);
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
