import { Global, Module } from '@nestjs/common';
import pg from 'pg';

import { DATABASE_POOL } from './database.constants.js';

const { Pool } = pg;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error('DATABASE_URL is required');
        }

        return new Pool({
          connectionString,
        });
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
