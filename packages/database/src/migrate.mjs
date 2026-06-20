import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');
const migrationsDir = path.join(rootDir, 'database/migrations');
const isStatusMode = process.argv.includes('--status');

async function ensureMigrationsTable(client) {
  await client.query(`
    create schema if not exists platform;

    create table if not exists platform.schema_migrations (
      file_name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getMigrationFiles() {
  const entries = await fs.readdir(migrationsDir);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}

async function getAppliedMigrations(client) {
  const result = await client.query('select file_name from platform.schema_migrations order by file_name asc');
  return new Set(result.rows.map((row) => row.file_name));
}

async function printStatus() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const files = await getMigrationFiles();
    const applied = await getAppliedMigrations(client);

    for (const file of files) {
      console.log(`${applied.has(file) ? 'applied' : 'pending'} ${file}`);
    }
  } finally {
    await client.end();
  }
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const files = await getMigrationFiles();
    const applied = await getAppliedMigrations(client);

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`apply ${file}`);
      await client.query(sql);
      await client.query('insert into platform.schema_migrations (file_name) values ($1)', [file]);
    }
  } finally {
    await client.end();
  }
}

if (isStatusMode) {
  await printStatus();
} else {
  await runMigrations();
}
