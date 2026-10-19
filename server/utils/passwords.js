import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const randomToken = (size = 32) => randomBytes(size).toString('hex');

export async function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(value, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(value, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scrypt(value, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
