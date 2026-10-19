import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const passwordHashPattern = /^[a-f0-9]{64}$/i;

export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const randomToken = (size = 32) => randomBytes(size).toString('hex');

export const isPasswordHash = value => typeof value === 'string' && passwordHashPattern.test(value);

export const hashPassword = value => createHash('sha256').update(value).digest('hex');

export const verifyPassword = (value, stored) => {
  if (typeof stored !== 'string') return false;
  const expected = Buffer.from(stored, 'hex');
  const key = createHash('sha256').update(value).digest();
  return expected.length === key.length && timingSafeEqual(expected, key);
};
