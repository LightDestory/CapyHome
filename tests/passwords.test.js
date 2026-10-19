import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, isPasswordHash, verifyPassword } from '../server/utils/passwords.js';

const password = 'a-test-password-123';
const sha256 = 'afeee7c58f7179315666241c6b89c9fa806f68eebaf4765230311b5d597e0fa3';

test('hashes passwords with sha256', async () => {
  assert.equal(await hashPassword(password), sha256);
  assert.equal(isPasswordHash(sha256), true);
  assert.equal(isPasswordHash(sha256.toUpperCase()), true);
});

test('verifies sha256 password hashes', async () => {
  assert.equal(await verifyPassword(password, sha256), true);
  assert.equal(await verifyPassword('wrong-password', sha256), false);
});

test('rejects plaintext, scrypt and malformed password hashes', () => {
  for (const value of [
    password,
    '',
    null,
    undefined,
    'a'.repeat(63),
    'a'.repeat(65),
    `${'a'.repeat(32)}:${'b'.repeat(128)}`,
    'g'.repeat(64)
  ]) {
    assert.equal(isPasswordHash(value), false, String(value));
  }
});
