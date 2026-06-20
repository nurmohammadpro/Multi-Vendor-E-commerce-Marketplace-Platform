import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export function normalizeLoginIdentifier(input: { email?: string; phone?: string }) {
  return {
    email: input.email?.trim().toLowerCase(),
    phone: input.phone?.trim(),
  };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string) {
  const [algorithm, salt, storedHex] = hash.split('$');
  if (algorithm !== 'scrypt' || !salt || !storedHex) {
    return false;
  }

  const stored = Buffer.from(storedHex, 'hex');
  const derived = (await scrypt(password, salt, stored.length)) as Buffer;

  if (stored.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(stored, derived);
}

export function createSessionToken() {
  return randomBytes(32).toString('hex');
}
