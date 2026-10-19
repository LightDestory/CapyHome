import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { transaction } from '../server/db.js';
import { date, amount } from '../server/utils/validation.js';
import { hashPassword } from '../server/utils/passwords.js';

const credentials = { username: 'admin', password: 'a-test-password-123' };
const roommate = { name: 'Ada', username: 'ada', password: 'another-password-123' };
const day = '2025-01-15';

async function fixture(options = {}) {
  const { app, db } = await createApp({ databasePath: ':memory:', adminUsername: credentials.username, adminPassword: await hashPassword(credentials.password), cookieSecure: false, trustProxy: false, timeZone: 'Europe/Rome', ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, session, headers = {} } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken } : {}),
        ...headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const content = await response.text();
    return { status: response.status, headers: response.headers, data: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(content) : content };
  };
  const login = async (user = credentials) => {
    const response = await request('/api/auth/login', { method: 'POST', body: user });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return { ...response.data, cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  return { db, request, login, base, close: async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  } };
}

async function withApp(work, options) {
  const app = await fixture(options);
  try { await work(app); } finally { await app.close(); }
}

async function approveRoommate(app, admin) {
  assert.equal((await app.request('/api/auth/register', { method: 'POST', body: roommate })).status, 201);
  const users = await app.request('/api/admin/users', { session: admin });
  const user = users.data.users.find(user => user.username === roommate.username);
  assert.equal((await app.request(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { status: 'approved' }, session: admin })).status, 200);
  return app.login(roommate);
}

test('requires bootstrap credentials and does not accept the example password', async () => {
  await assert.rejects(createApp({ databasePath: ':memory:', adminUsername: '', adminPassword: '' }), /First startup requires/);
  await assert.rejects(createApp({ databasePath: ':memory:', adminUsername: credentials.username, adminPassword: 'replace-with-a-long-unique-password' }), /First startup requires/);
});

test('rejects a plaintext bootstrap password', async () => {
  await assert.rejects(
    createApp({ databasePath: ':memory:', adminUsername: credentials.username, adminPassword: credentials.password }),
    /SHA-256 password hash/
  );
});

test('serves the SPA with security headers, health, and protected API endpoints', () => withApp(async app => {
  const page = await app.request('/');
  assert.equal(page.status, 200);
  assert.match(page.data, /lang="en"/);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-powered-by'), null);
  assert.equal((await app.request('/js/app.js')).status, 200);
  assert.equal((await app.request('/js/cookie-notice.js')).status, 200);
  assert.equal((await app.request('/css/styles.css')).status, 200);
  assert.match(page.data, /id="cookie-notice"/);
  assert.deepEqual((await app.request('/api/health')).data, { status: 'ok' });
  for (const path of ['/api/me', '/api/dashboard', '/api/cleaning', '/api/waste', '/api/fund', '/api/admin/settings', '/api/admin/users']) {
    assert.equal((await app.request(path)).status, 401, path);
  }
  const session = await app.login();
  assert.equal(session.user.role, 'admin');
  assert.equal(session.timeZone, 'Europe/Rome');
  assert.equal(session.user.passwordHash, undefined);
  assert.equal(session.user.username, 'admin');
  assert.equal('email' in session.user, false);
  const attributes = app.db.models.User.getAttributes();
  assert.ok('username' in attributes);
  assert.ok(!('email' in attributes));
  const me = await app.request('/api/me', { session });
  assert.equal(me.headers.get('cache-control'), 'no-store');
  assert.deepEqual(me.data.user, session.user);
  assert.equal((await app.request('/api/missing', { session })).status, 404);
  assert.equal((await app.request('/.env')).status, 404);
}));

test('registration is pending and approval is required; duplicates and invalid input are rejected', () => withApp(async app => {
  const admin = await app.login();
  assert.equal((await app.request('/api/auth/register', { method: 'POST', body: { ...roommate, password: 'short' } })).status, 400);
  for (const username of [undefined, '', '   ', 'two names', 123, 'a'.repeat(255)]) {
    assert.equal((await app.request('/api/auth/register', { method: 'POST', body: { ...roommate, username } })).status, 400);
    assert.equal((await app.request('/api/auth/login', { method: 'POST', body: { ...credentials, username } })).status, 400);
  }
  assert.equal((await app.request('/api/auth/register', { method: 'POST', body: { ...roommate, role: 'admin', status: 'approved' } })).status, 201);
  assert.equal((await app.request('/api/auth/register', { method: 'POST', body: { ...roommate, username: 'ADA' } })).status, 409);
  const stored = await app.db.models.User.findOne({ where: { username: roommate.username } });
  assert.equal(stored.role, 'roommate');
  assert.equal(stored.status, 'pending');
  assert.notEqual(stored.passwordHash, roommate.password);
  assert.match(stored.passwordHash, /^[a-f0-9]{64}$/);
  assert.equal((await app.request('/api/auth/login', { method: 'POST', body: roommate })).status, 403);
  assert.equal((await app.request('/api/auth/login', { method: 'POST', body: { ...roommate, password: 'wrong-password' } })).status, 401);
  assert.equal((await app.request('/api/dashboard', { session: admin })).data.stats.pendingUsers, 1);
  await app.request(`/api/admin/users/${stored.id}`, { method: 'PATCH', body: { status: 'approved' }, session: admin });
  const resident = await app.login({ ...roommate, username: 'ADA' });
  assert.equal(resident.user.role, 'roommate');
  assert.equal((await app.request('/api/dashboard', { session: resident })).status, 200);
}));

test('enforces CSRF, same-origin requests, JSON input and secure cookies', () => withApp(async app => {
  const login = await app.request('/api/auth/login', { method: 'POST', body: credentials });
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  const admin = { ...login.data, cookie: cookie.split(';')[0] };
  const path = '/api/admin/house';
  const body = { name: 'Casa Sicura' };
  assert.equal((await app.request(path, { method: 'PUT', body, session: admin, headers: { 'X-CSRF-Token': '' } })).status, 403);
  assert.equal((await app.request(path, { method: 'PUT', body, session: admin, headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await app.request('/api/auth/login', { method: 'POST', body: credentials, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await app.request(path, { method: 'PUT', body, session: admin, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await app.request(path, { method: 'PUT', body: [], session: admin })).status, 400);
  assert.equal((await app.request(path, { method: 'PUT', body: { name: 'x'.repeat(40000) }, session: admin })).status, 413);
  const malformed = await fetch(`${app.base}${path}`, { method: 'PUT', body: '{', headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken } });
  assert.equal(malformed.status, 400);
  await malformed.text();
  // Host/protocol must describe the public origin. HTTPS is handled by the reverse proxy in production.
  assert.equal((await app.request(path, { method: 'PUT', body, session: admin, headers: { Origin: app.base } })).status, 200);
}, { cookieSecure: true }));

test('roommates cannot administer the house and revoked sessions cannot be reused', () => withApp(async app => {
  const admin = await app.login();
  const resident = await approveRoommate(app, admin);
  for (const path of ['/api/admin/users', '/api/admin/settings']) assert.equal((await app.request(path, { session: resident })).status, 403);
  for (const [path, method, body] of [
    ['/api/admin/house', 'PUT', { name: 'No' }],
    ['/api/admin/rooms', 'POST', { name: 'No', type: 'No' }],
    ['/api/admin/waste', 'POST', { name: 'No', days: [1] }],
    [`/api/admin/users/${resident.user.id}`, 'PATCH', { role: 'admin' }]
  ]) assert.equal((await app.request(path, { method, body, session: resident })).status, 403);
  assert.equal((await app.request(`/api/admin/users/${resident.user.id}`, { method: 'PATCH', body: { status: 'rejected' }, session: admin })).status, 200);
  assert.equal((await app.request('/api/me', { session: resident })).status, 401);
  assert.equal((await app.request('/api/auth/login', { method: 'POST', body: roommate })).status, 403);
  assert.equal((await app.request(`/api/admin/users/${admin.user.id}`, { method: 'PATCH', body: { role: 'roommate' }, session: admin })).status, 409);
  assert.equal((await app.request(`/api/admin/users/${admin.user.id}`, { method: 'PATCH', body: { status: 'rejected' }, session: admin })).status, 409);
  assert.equal((await app.request(`/api/admin/users/${resident.user.id}`, { method: 'PATCH', body: { role: 'admin', status: 'approved' }, session: admin })).status, 200);
  const otherAdmin = await app.login(roommate);
  assert.equal((await app.request(`/api/admin/users/${admin.user.id}`, { method: 'PATCH', body: { role: 'roommate' }, session: otherAdmin })).status, 200);
  assert.equal((await app.request('/api/me', { session: admin })).status, 401);
  assert.equal((await app.login()).user.role, 'roommate');
}));

test('concurrent admin demotions retain an approved admin', () => withApp(async app => {
  const admin = await app.login();
  const resident = await approveRoommate(app, admin);
  assert.equal((await app.request(`/api/admin/users/${resident.user.id}`, { method: 'PATCH', body: { role: 'admin' }, session: admin })).status, 200);
  const otherAdmin = await app.login(roommate);
  const results = await Promise.all([admin, otherAdmin].map(session => app.request(`/api/admin/users/${session.user.id}`, {
    method: 'PATCH', body: { role: 'roommate' }, session
  })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(await app.db.models.User.count({ where: { role: 'admin', status: 'approved' } }), 1);
  assert.equal(await app.db.models.User.count({ where: { role: 'roommate', status: 'approved' } }), 1);
}));

test('a queued admin mutation cannot restore privileges revoked before it executes', () => withApp(async app => {
  const admin = await app.login();
  const resident = await approveRoommate(app, admin);
  await app.request(`/api/admin/users/${resident.user.id}`, { method: 'PATCH', body: { role: 'admin' }, session: admin });
  const secondAdmin = await app.login(roommate);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const authenticated = Promise.withResolvers();
  const { User, Session } = app.db.models;
  Session.addHook('afterFind', 'observe-auth', (row, options) => {
    if (row?.userId === secondAdmin.user.id && !options.transaction) authenticated.resolve();
  });
  const revocation = transaction(app.db, async t => {
    entered.resolve();
    await release.promise;
    await User.update({ role: 'roommate' }, { where: { id: secondAdmin.user.id }, transaction: t });
    await Session.destroy({ where: { userId: secondAdmin.user.id }, transaction: t });
  });
  try {
    await entered.promise;
    const restore = app.request(`/api/admin/users/${secondAdmin.user.id}`, { method: 'PATCH', body: { role: 'admin' }, session: secondAdmin });
    await authenticated.promise;
    release.resolve();
    await revocation;
    assert.equal((await restore).status, 401);
    assert.equal((await User.findByPk(secondAdmin.user.id)).role, 'roommate');
    assert.equal(await Session.count({ where: { userId: secondAdmin.user.id } }), 0);
  } finally {
    release.resolve();
    await revocation;
    Session.removeHook('afterFind', 'observe-auth');
  }
}));

test('session tokens are hashed, rotated on login, expired, and invalidated on logout', () => withApp(async app => {
  const first = await app.login();
  const stored = await app.db.models.Session.findOne();
  assert.notEqual(stored.tokenHash, first.cookie.split('=')[1]);
  const second = await app.request('/api/auth/login', { method: 'POST', body: credentials, session: first });
  assert.equal(second.status, 200);
  assert.equal((await app.request('/api/me', { session: first })).status, 401);
  const session = { ...second.data, cookie: second.headers.get('set-cookie').split(';')[0] };
  const logout = await app.request('/api/auth/logout', { method: 'POST', session });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal((await app.request('/api/me', { session })).status, 401);
  const expired = await app.login();
  await app.db.models.Session.update({ expiresAt: Date.now() - 1 }, { where: {} });
  assert.equal((await app.request('/api/me', { session: expired })).status, 401);
}));

test('configures house and rooms, records multi-room cleaning atomically, and preserves archived history', () => withApp(async app => {
  const admin = await app.login();
  const resident = await approveRoommate(app, admin);
  const house = { name: 'Casa Girasole', address: 'Via Roma 12', location: 'Torino' };
  assert.equal((await app.request('/api/admin/house', { method: 'PUT', body: house, session: admin })).status, 200);
  assert.deepEqual((await app.request('/api/dashboard', { session: resident })).data.house, house);
  const kitchen = await app.request('/api/admin/rooms', { method: 'POST', body: { name: 'Cucina', type: 'Cucina' }, session: admin });
  const bath = await app.request('/api/admin/rooms', { method: 'POST', body: { name: 'Bagno', type: 'Bagno' }, session: admin });
  assert.equal(kitchen.status, 201);
  assert.equal((await app.request('/api/admin/rooms', { method: 'POST', body: { name: 'CUCINA', type: 'Cucina' }, session: admin })).status, 409);
  const log = { roomIds: [kitchen.data.id, bath.data.id, kitchen.data.id], date: day, notes: 'Pavimenti lavati', userId: admin.user.id };
  assert.equal((await app.request('/api/cleaning', { method: 'POST', body: log, session: resident })).status, 201);
  const cleaning = (await app.request('/api/cleaning', { session: admin })).data;
  assert.equal(cleaning.logs.length, 2);
  assert.ok(cleaning.logs.every(item => item.userName === roommate.name));
  assert.ok(cleaning.rooms.every(item => item.lastCleanedAt === day && item.lastCleanedBy === roommate.name));
  assert.equal((await app.request('/api/cleaning', { method: 'POST', body: { ...log, roomIds: [kitchen.data.id, 99999] }, session: resident })).status, 404);
  assert.equal((await app.request('/api/cleaning', { session: resident })).data.logs.length, 2);
  assert.equal((await app.request('/api/cleaning', { method: 'POST', body: { ...log, date: '2025-02-30' }, session: resident })).status, 400);
  assert.equal((await app.request('/api/cleaning', { method: 'POST', body: { ...log, date: '2999-01-01' }, session: resident })).status, 400);
  assert.equal((await app.request(`/api/admin/rooms/${kitchen.data.id}`, { method: 'DELETE', session: admin })).status, 200);
  const archived = (await app.request('/api/cleaning', { session: resident })).data;
  assert.equal(archived.rooms.length, 1);
  assert.equal(archived.logs.length, 2);
  assert.equal((await app.request('/api/cleaning', { method: 'POST', body: log, session: resident })).status, 404);
  assert.equal((await app.request('/api/dashboard', { session: resident })).data.stats.cleaningCount, 2);
}));

test('configures weekly waste schedules, records disposal, and archives without losing logs', () => withApp(async app => {
  const admin = await app.login();
  const resident = await approveRoommate(app, admin);
  assert.equal((await app.request('/api/admin/waste', { method: 'POST', body: { name: 'Carta', days: [] }, session: admin })).status, 400);
  assert.equal((await app.request('/api/admin/waste', { method: 'POST', body: { name: 'Carta', days: [7] }, session: admin })).status, 400);
  const created = await app.request('/api/admin/waste', { method: 'POST', body: { name: 'Carta', days: [5, 1, 1], instructions: 'Contenitore blu' }, session: admin });
  assert.equal(created.status, 201);
  assert.deepEqual((await app.request('/api/waste', { session: resident })).data.schedule[0].days, [1, 5]);
  const body = { wasteTypeId: created.data.id, date: day, notes: 'Fatto' };
  assert.equal((await app.request('/api/waste', { method: 'POST', body, session: resident })).status, 201);
  assert.equal((await app.request(`/api/admin/waste/${created.data.id}`, { method: 'PUT', body: { name: 'Carta', days: [2], instructions: 'Dopo le 20' }, session: admin })).status, 200);
  assert.deepEqual((await app.request('/api/waste', { session: resident })).data.schedule[0].days, [2]);
  assert.equal((await app.request(`/api/admin/waste/${created.data.id}`, { method: 'DELETE', session: admin })).status, 200);
  const archived = (await app.request('/api/waste', { session: resident })).data;
  assert.equal(archived.schedule.length, 0);
  assert.equal(archived.logs[0].wasteName, 'Carta');
  assert.equal(archived.logs[0].userName, roommate.name);
  assert.equal((await app.request('/api/waste', { method: 'POST', body, session: resident })).status, 404);
  assert.equal((await app.request('/api/dashboard', { session: resident })).data.stats.wasteCount, 1);
}));

test('tracks exact cents, validates fund inputs and rejects concurrent overspending', () => withApp(async app => {
  const admin = await app.login();
  const resident = await approveRoommate(app, admin);
  const post = (type, value, description = 'Quota casa') => app.request('/api/fund', { method: 'POST', body: { type, amount: value, description, date: day }, session: resident });
  assert.equal((await post('expense', '1.00')).status, 409);
  for (const value of ['0', '-1', '1.001', '1e2', 'NaN', '1000000.01', 12, null]) assert.equal((await post('contribution', value)).status, 400, String(value));
  assert.equal((await post('invalid', '1')).status, 400);
  assert.equal((await post('contribution', '1', '')).status, 400);
  assert.equal((await post('contribution', '12,34')).status, 201);
  assert.equal((await post('expense', '2.10', 'Detersivo')).status, 201);
  let fund = (await app.request('/api/fund', { session: admin })).data;
  assert.equal(fund.balanceCents, 1024);
  assert.equal(fund.transactions.length, 2);
  assert.equal(fund.transactions[0].amountCents, 210);
  assert.equal(fund.transactions[0].userName, roommate.name);
  const results = await Promise.all([post('expense', '8'), post('expense', '8')]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  fund = (await app.request('/api/fund', { session: resident })).data;
  assert.equal(fund.balanceCents, 224);
  const dashboard = (await app.request('/api/dashboard', { session: admin })).data;
  assert.equal(dashboard.stats.balanceCents, 224);
  assert.equal(dashboard.activity.length, 3);
  assert.ok(dashboard.activity.some(item => item.description === 'Detersivo' && item.amountCents === 210));
}));

test('fund and dashboard totals match their ledger snapshot during concurrent writes', () => withApp(async app => {
  const admin = await app.login();
  const requests = [];
  for (let index = 0; index < 5; index++) {
    requests.push(app.request('/api/fund', { method: 'POST', body: { type: 'contribution', amount: '1.25', description: 'Quota', date: day }, session: admin }));
    requests.push(app.request('/api/fund', { session: admin }));
    requests.push(app.request('/api/dashboard', { session: admin }));
  }
  for (const response of await Promise.all(requests)) {
    assert.ok([200, 201].includes(response.status));
    if (response.data.transactions) {
      assert.equal(response.data.balanceCents, response.data.transactions.reduce((sum, row) => sum + row.amountCents, 0));
    }
    if (response.data.activity) {
      assert.equal(response.data.stats.balanceCents, response.data.activity.reduce((sum, row) => sum + row.amountCents, 0));
    }
  }
  assert.equal((await app.request('/api/fund', { session: admin })).data.balanceCents, 625);
}));

test('persists house, ledger and sessions across application restarts without resetting admin', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'capyhome-test-'));
  const databasePath = join(directory, 'house.sqlite');
  let app;
  try {
    app = await fixture({ databasePath });
    const session = await app.login();
    await app.request('/api/admin/house', { method: 'PUT', body: { name: 'Casa Persistente' }, session });
    await app.request('/api/fund', { method: 'POST', body: { type: 'contribution', amount: '45.20', description: 'Quota', date: day }, session });
    await app.close();
    app = null;
    app = await fixture({ databasePath, adminPassword: await hashPassword('a-different-password') });
    assert.equal((await app.request('/api/me', { session })).status, 200);
    const dashboard = (await app.request('/api/dashboard', { session })).data;
    assert.equal(dashboard.house.name, 'Casa Persistente');
    assert.equal(dashboard.stats.balanceCents, 4520);
    assert.equal((await app.login()).user.username, credentials.username);
    assert.equal(await app.db.models.User.count(), 1);
  } finally {
    if (app) await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rate-limits authentication attempts', () => withApp(async app => {
  for (let index = 0; index < 30; index++) {
    assert.equal((await app.request('/api/auth/login', { method: 'POST', body: { username: 'missing', password: 'wrong' } })).status, 401);
  }
  const blocked = await app.request('/api/auth/login', { method: 'POST', body: credentials, headers: { 'Accept-Language': 'en' } });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'));
  assert.equal(blocked.data.error, 'Too many attempts. Try again in 15 minutes.');
  const italian = await app.request('/api/auth/login', { method: 'POST', body: credentials, headers: { 'Accept-Language': 'it' } });
  assert.equal(italian.data.error, 'Troppi tentativi. Riprova tra 15 minuti.');
}));

test('API negotiates language per request, including validation and successful mutations', () => withApp(async app => {
  for (const [language, expected, contentLanguage] of [
    ['en', 'Sign in to continue.', 'en'],
    ['en-GB,en;q=0.9,it;q=0.8', 'Sign in to continue.', 'en'],
    ['en;q=0.2,it-IT;q=0.9', 'Accedi per continuare.', 'it'],
    ['fr-FR', 'Sign in to continue.', 'en'],
    ['../../en', 'Sign in to continue.', 'en']
  ]) {
    const result = await app.request('/api/me', { headers: { 'Accept-Language': language } });
    assert.equal(result.status, 401);
    assert.equal(result.data.error, expected);
    assert.equal(result.headers.get('content-language'), contentLanguage);
    assert.match(result.headers.get('vary'), /Accept-Language/);
  }
  const invalid = await app.request('/api/auth/register', { method: 'POST', body: {}, headers: { 'Accept-Language': 'en' } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.data.error, 'Name: enter valid text (maximum 100 characters).');
  const registered = await app.request('/api/auth/register', { method: 'POST', body: roommate, headers: { 'Accept-Language': 'en' } });
  assert.equal(registered.status, 201);
  assert.match(registered.data.message, /^Registration complete\./);
  const pending = await app.request('/api/auth/login', { method: 'POST', body: roommate, headers: { 'Accept-Language': 'en' } });
  assert.equal(pending.data.error, 'Your account is awaiting approval.');
  const admin = await app.login();
  const room = await app.request('/api/admin/rooms', { method: 'POST', body: { name: 'Cucina {name}', type: 'Cucina' }, session: admin, headers: { 'Accept-Language': 'en' } });
  assert.equal(room.data.message, 'Room added.');
  await app.request('/api/cleaning', { method: 'POST', body: { roomIds: [room.data.id], date: day }, session: admin });
  const [english, italian] = await Promise.all(['en', 'it'].map(language => app.request('/api/dashboard', { session: admin, headers: { 'Accept-Language': language } })));
  assert.equal(english.data.activity[0].description, 'Cleaning: Cucina {name}');
  assert.equal(italian.data.activity[0].description, 'Pulizia: Cucina {name}');
  assert.equal(english.data.rooms[0].name, 'Cucina {name}');
  assert.deepEqual(english.data.house, italian.data.house);
  const denied = await app.request('/api/admin/house', { method: 'PUT', body: { name: 'Test' }, session: admin, headers: { 'Accept-Language': 'en', 'X-CSRF-Token': '' } });
  assert.equal(denied.data.error, 'Invalid session. Reload the page and try again.');
  const badJson = await fetch(`${app.base}/api/auth/login`, { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en' } });
  assert.equal((await badJson.json()).error, 'Invalid JSON.');
  assert.equal((await app.request('/locales/en.json')).status, 200);
  assert.equal((await app.request('/locales/it.json')).status, 200);
  assert.equal((await app.request('/js/i18n.js')).status, 200);
}));

test('registration rate-limit messages follow the current language', () => withApp(async app => {
  for (let index = 0; index < 10; index++) {
    assert.equal((await app.request('/api/auth/register', { method: 'POST', body: {} })).status, 400);
  }
  const result = await app.request('/api/auth/register', { method: 'POST', body: {}, headers: { 'Accept-Language': 'en' } });
  assert.equal(result.status, 429);
  assert.equal(result.data.error, 'Too many registrations. Try again in an hour.');
}));

test('date validation follows the house timezone at midnight and amounts remain integer cents', () => {
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-09-07T22:30:00Z'])); }
  };
  try {
    assert.equal(date('2026-09-08', 'Europe/Rome'), '2026-09-08');
    assert.throws(() => date('2026-09-08', 'America/New_York'), { code: 'validation.dateRange' });
    assert.equal(date('2026-09-07', 'America/New_York'), '2026-09-07');
    assert.throws(() => date('2026-02-29'), { code: 'validation.dateRange' });
    assert.equal(date('2024-02-29'), '2024-02-29');
    assert.throws(() => date('1899-12-31'), { code: 'validation.dateRange' });
  } finally { globalThis.Date = RealDate; }
  assert.equal(amount('0.10') + amount('0.20'), 30);
  assert.equal(amount('1000000.00'), 100000000);
});
