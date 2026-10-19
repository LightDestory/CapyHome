import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { translator } from '../server/i18n/index.js';

const source = await readFile(new URL('../public/js/i18n.js', import.meta.url), 'utf8');
const frontend = {};
const backend = {};
for (const language of ['it', 'en']) {
  frontend[language] = JSON.parse(await readFile(new URL(`../public/locales/${language}.json`, import.meta.url), 'utf8'));
  backend[language] = JSON.parse(await readFile(new URL(`../server/i18n/locales/${language}.json`, import.meta.url), 'utf8'));
}

function browser({ saved = null, languages = ['en-GB'], fetch: fetchOverride, blockedStorage = false } = {}) {
  const requests = [];
  const storage = new Map(saved === null ? [] : [['capyhome.language', saved]]);
  const context = {
    window: {}, document: { documentElement: { lang: 'it' } }, navigator: { languages }, AbortSignal,
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage unavailable'); storage.set(key, value); }
    },
    async fetch(url, options) {
      requests.push(url);
      if (fetchOverride) return fetchOverride(url, options);
      const language = url.match(/\/(it|en)\.json$/)?.[1];
      return { ok: Boolean(language), json: async () => frontend[language] };
    }
  };
  runInNewContext(source, context);
  return { i18n: context.window.CapyI18n, document: context.document, requests, storage };
}

test('Italian and English catalogs have identical keys and interpolation parameters', () => {
  const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const catalogs of [frontend, backend]) {
    assert.deepEqual(Object.keys(catalogs.it).sort(), Object.keys(catalogs.en).sort());
    for (const key of Object.keys(catalogs.it)) {
      assert.equal(typeof catalogs.it[key], 'string', key);
      assert.equal(typeof catalogs.en[key], 'string', key);
      assert.ok(catalogs.it[key].length && catalogs.en[key].length, key);
      assert.deepEqual(placeholders(catalogs.it[key]), placeholders(catalogs.en[key]), key);
    }
  }
});

test('frontend chooses saved or browser language and loads/caches translations dynamically', async () => {
  const { i18n, requests, document, storage } = browser();
  assert.equal(requests.length, 0);
  assert.equal(i18n.preferred(), 'en');
  assert.equal(await i18n.select('en', true), true);
  assert.equal(i18n.locale, 'en-GB');
  assert.equal(i18n.t('auth.login'), 'Sign in');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(storage.get('capyhome.language'), 'en');
  assert.deepEqual([...requests].sort(), ['/locales/en.json']);
  await i18n.select('it');
  assert.equal(i18n.locale, 'it-IT');
  assert.equal(i18n.t('auth.login'), 'Accedi');
  assert.deepEqual([...requests].sort(), ['/locales/en.json', '/locales/it.json']);
  await i18n.select('en');
  assert.equal(requests.length, 2);
  assert.equal(browser({ saved: 'it', languages: ['en'] }).i18n.preferred(), 'it');
  assert.equal(browser({ saved: '../../xx', languages: ['fr', 'it-IT'] }).i18n.preferred(), 'it');
  assert.equal(browser({ languages: ['de'] }).i18n.preferred(), 'en');
  const privateBrowser = browser({ blockedStorage: true });
  await privateBrowser.i18n.select('en');
  assert.equal(privateBrowser.i18n.language, 'en');
});

test('frontend keeps its language on failed switches, retries, and falls back on initial failure', async () => {
  let failEnglish = true;
  const fetchLocale = async url => ({ ok: !(url.includes('/en.') && failEnglish), json: async () => frontend[url.includes('/en.') ? 'en' : 'it'] });
  const { i18n, storage } = browser({ fetch: fetchLocale });
  await i18n.select('it');
  await assert.rejects(i18n.select('en'));
  assert.equal(i18n.language, 'it');
  assert.equal(storage.get('capyhome.language'), 'it');
  failEnglish = false;
  await i18n.select('en');
  assert.equal(i18n.language, 'en');
  failEnglish = true;
  const fallback = browser({ fetch: fetchLocale });
  await fallback.i18n.select('en', true);
  assert.equal(fallback.i18n.language, 'it');
  const unavailable = browser({ fetch: async () => { throw new Error('Offline'); } });
  await assert.rejects(unavailable.i18n.select('en', true));
});

test('frontend uses English for missing keys and rejects unsupported locale paths', async () => {
  const { i18n, requests } = browser({ fetch: async url => ({ ok: true, json: async () => url.includes('/it.') ? { 'common.language': 'Lingua' } : frontend.en }) });
  await i18n.select('it');
  assert.equal(i18n.t('auth.login'), 'Sign in');
  assert.equal(i18n.t('not.a.key'), 'not.a.key');
  const count = requests.length;
  await assert.rejects(i18n.select('../../secret'));
  assert.equal(requests.length, count);
  assert.equal(i18n.t('dashboard.hello', { name: '{name}<script>' }), 'Hello, {name}<script>');
});

test('a slower language request cannot overwrite the latest selection', async () => {
  const italian = Promise.withResolvers();
  const { i18n } = browser({ fetch: async url => url.includes('/it.') ? italian.promise : { ok: true, json: async () => frontend.en } });
  await i18n.select('en');
  const slow = i18n.select('it');
  await i18n.select('en');
  italian.resolve({ ok: true, json: async () => frontend.it });
  assert.equal(await slow, false);
  assert.equal(i18n.language, 'en');
});

test('backend translators are isolated, interpolate once, and fall back to English', async () => {
  const [en, it, unsupported] = await Promise.all([translator('en'), translator('it'), translator('../../secret')]);
  assert.equal(en.t('auth.required'), 'Sign in to continue.');
  assert.equal(it.t('auth.required'), 'Accedi per continuare.');
  assert.equal(unsupported.language, 'en');
  assert.equal(en.t('activity.cleaning', { name: '{name}<script>' }), 'Cleaning: {name}<script>');
  assert.equal(en.t('missing.key'), 'missing.key');
  assert.equal(en.t('toString'), 'toString');
});
