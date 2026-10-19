'use strict';

window.CapyI18n = (() => {
  const supported = ['en', 'it'];
  const cache = new Map();
  let language = 'en';
  let revision = 0;
  function preferred() {
    try {
      const saved = localStorage.getItem('capyhome.language');
      if (supported.includes(saved)) return saved;
    } catch { /* Storage may be unavailable in private contexts. */ }
    for (const entry of navigator.languages || [navigator.language]) {
      const base = String(entry).toLowerCase().split('-')[0];
      if (supported.includes(base)) return base;
    }
    return 'en';
  }
  async function load(locale) {
    if (!supported.includes(locale)) throw new Error('Unsupported locale');
    if (!cache.has(locale)) {
      const request = (async () => {
        const response = await fetch(`/locales/${locale}.json`, { credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Locale unavailable');
        const dictionary = await response.json();
        if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== 'object' || !Object.keys(dictionary).length || Object.values(dictionary).some(value => typeof value !== 'string')) throw new Error('Invalid locale');
        return dictionary;
      })();
      cache.set(locale, request);
      request.catch(() => { if (cache.get(locale) === request) cache.delete(locale); });
    }
    return cache.get(locale);
  }
  let active = {}, english = {};
  async function select(locale, initial = false) {
    const id = ++revision;
    if (!supported.includes(locale)) throw new Error('Unsupported locale');
    // Load the English missing-key fallback alongside the requested dictionary.
    const [requested, fallback] = await Promise.allSettled([load(locale), load('en')]);
    let selected;
    if (requested.status === 'fulfilled') selected = requested.value;
    else {
      if (!initial) throw requested.reason;
      locale = fallback.status === 'fulfilled' ? 'en' : 'it';
      selected = fallback.status === 'fulfilled' ? fallback.value : await load('it');
    }
    if (id !== revision) return false;
    if (fallback.status === 'fulfilled') english = fallback.value;
    active = selected;
    language = locale;
    document.documentElement.lang = locale;
    try { localStorage.setItem('capyhome.language', locale); } catch { /* In-memory selection still works. */ }
    return true;
  }
  function t(key, params = {}) {
    const value = Object.hasOwn(active, key) ? active[key] : Object.hasOwn(english, key) ? english[key] : key;
    return value.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
  }
  return { preferred, select, t, get language() { return language; }, get locale() { return language === 'en' ? 'en-GB' : 'it-IT'; } };
})();
