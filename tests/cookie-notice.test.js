import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../public/js/cookie-notice.js', import.meta.url), 'utf8');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

function load(storage = memoryStorage()) {
  const context = { window: { localStorage: storage } };
  runInNewContext(source, context);
  return { notice: context.window.CapyCookieNotice, storage };
}

function fakeBanner() {
  const listeners = [];
  const banner = { hidden: true };
  const closeButton = {
    addEventListener(type, listener) { if (type === 'click') listeners.push(listener); }
  };
  return { banner, closeButton, close: () => listeners.forEach(listener => listener()) };
}

test('cookie notice is shown until dismissed and remembers the choice', () => {
  const storage = memoryStorage();
  const { notice } = load(storage);
  const { banner, closeButton, close } = fakeBanner();
  notice.init({ banner, closeButton, storage });
  assert.equal(banner.hidden, false);
  close();
  assert.equal(banner.hidden, true);
  assert.equal(storage.getItem('capyhome.cookieNotice'), 'dismissed');
  assert.equal(notice.isDismissed(storage), true);
});

test('cookie notice stays hidden when dismissal was already saved', () => {
  const storage = memoryStorage({ 'capyhome.cookieNotice': 'dismissed' });
  const { notice } = load(storage);
  const { banner, closeButton } = fakeBanner();
  notice.init({ banner, closeButton, storage });
  assert.equal(banner.hidden, true);
});

test('cookie notice still closes when storage is unavailable', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  const { notice } = load(storage);
  const { banner, closeButton, close } = fakeBanner();
  notice.init({ banner, closeButton, storage });
  assert.equal(banner.hidden, false);
  close();
  assert.equal(banner.hidden, true);
  assert.equal(notice.isDismissed(storage), true);
});

test('cookie notice show reflects the saved dismissal', () => {
  const storage = memoryStorage();
  const { notice } = load(storage);
  const banner = { hidden: true };
  notice.show({ banner, storage });
  assert.equal(banner.hidden, false);
  storage.setItem('capyhome.cookieNotice', 'dismissed');
  notice.show({ banner, storage });
  assert.equal(banner.hidden, true);
});

test('cookie notice ignores missing elements', () => {
  const { notice } = load();
  assert.doesNotThrow(() => notice.init());
  assert.doesNotThrow(() => notice.show());
});
