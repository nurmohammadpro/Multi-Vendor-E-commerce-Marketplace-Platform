import pg from 'pg';

const { Pool } = pg;

export function createTestPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5433/multivendor_test',
    max: 3,
  });
}

export async function runMigrations(pool: ReturnType<typeof createTestPool>) {
  // In CI, migrations are run before the test suite.
  // This helper is for local dev where you might need to run them manually.
}

export async function truncateAll(pool: ReturnType<typeof createTestPool>) {
  await pool.query(`
    do $$ declare r record;
    begin
      for r in select schemaname, tablename from pg_tables where schemaname in (
        'identity','access','store','catalog','inventory','sales','billing','shipping','support','comms','integration','settlement','reporting','audit','platform'
      ) loop
        execute format('truncate table %I.%I cascade', r.schemaname, r.tablename);
      end loop;
    end $$;
  `);
}

export const AUDIT_SERVICE_MOCK = {
  recordUserAction: async () => {},
  recordStoreAction: async () => {},
};
