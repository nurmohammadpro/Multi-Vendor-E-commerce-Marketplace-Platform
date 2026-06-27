import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';

const { Client } = pg;
const scrypt = promisify(scryptCallback);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');
const seedFile = path.join(rootDir, 'database/seeds/0001_bootstrap.sql');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('hex')}`;
}

async function setSeedSettings(client, settings) {
  for (const [key, value] of Object.entries(settings)) {
    await client.query(`select set_config($1, $2, true)`, [key, value]);
  }
}

async function main() {
  const databaseUrl = required('DATABASE_URL');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const platformOwnerPasswordHash = await hashPassword(required('BOOTSTRAP_PLATFORM_OWNER_PASSWORD'));
    const platformAdminPasswordHash = await hashPassword(required('BOOTSTRAP_PLATFORM_ADMIN_PASSWORD'));
    const storeOwnerPasswordHash = await hashPassword(required('BOOTSTRAP_STORE_OWNER_PASSWORD'));

    const settings = {
      'app.bootstrap_tenant_code': required('BOOTSTRAP_TENANT_CODE'),
      'app.bootstrap_tenant_name': required('BOOTSTRAP_TENANT_NAME'),
      'app.platform_owner_name': required('BOOTSTRAP_PLATFORM_OWNER_NAME'),
      'app.platform_owner_email': required('BOOTSTRAP_PLATFORM_OWNER_EMAIL'),
      'app.platform_owner_phone': process.env.BOOTSTRAP_PLATFORM_OWNER_PHONE || '',
      'app.platform_owner_password_hash': platformOwnerPasswordHash,
      'app.platform_owner_locale': process.env.BOOTSTRAP_PLATFORM_OWNER_LOCALE || 'en',
      'app.platform_admin_name': required('BOOTSTRAP_PLATFORM_ADMIN_NAME'),
      'app.platform_admin_email': required('BOOTSTRAP_PLATFORM_ADMIN_EMAIL'),
      'app.platform_admin_phone': process.env.BOOTSTRAP_PLATFORM_ADMIN_PHONE || '',
      'app.platform_admin_password_hash': platformAdminPasswordHash,
      'app.platform_admin_locale': process.env.BOOTSTRAP_PLATFORM_ADMIN_LOCALE || 'en',
      'app.store_owner_name': required('BOOTSTRAP_STORE_OWNER_NAME'),
      'app.store_owner_email': required('BOOTSTRAP_STORE_OWNER_EMAIL'),
      'app.store_owner_phone': required('BOOTSTRAP_STORE_OWNER_PHONE'),
      'app.store_owner_password_hash': storeOwnerPasswordHash,
      'app.store_owner_locale': process.env.BOOTSTRAP_STORE_OWNER_LOCALE || 'en',
      'app.store_code': required('BOOTSTRAP_STORE_CODE'),
      'app.store_name': required('BOOTSTRAP_STORE_NAME'),
      'app.store_name_bn': process.env.BOOTSTRAP_STORE_NAME_BN || '',
      'app.store_slug': required('BOOTSTRAP_STORE_SLUG'),
      'app.store_phone': required('BOOTSTRAP_STORE_PHONE'),
      'app.store_email': process.env.BOOTSTRAP_STORE_EMAIL || '',
      'app.store_timezone': process.env.BOOTSTRAP_STORE_TIMEZONE || 'Asia/Dhaka',
      'app.store_locale': process.env.BOOTSTRAP_STORE_LOCALE || 'en',
    };

    await client.query('begin');
    await setSeedSettings(client, settings);
    const sql = await fs.readFile(seedFile, 'utf8');
    const result = await client.query(sql);
    await client.query('commit');

    console.log('Bootstrap seed completed');
    console.log(JSON.stringify(result.rows[0] ?? {}, null, 2));
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Bootstrap seed failed', error);
  process.exit(1);
});
