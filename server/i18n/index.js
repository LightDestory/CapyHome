import { readFile } from 'node:fs/promises';

const dictionaries = new Map();

async function dictionary(language) {
  if (!dictionaries.has(language)) {
    const pending = readFile(new URL(`./locales/${language}.json`, import.meta.url), 'utf8').then(JSON.parse);
    dictionaries.set(language, pending);
    pending.catch(() => dictionaries.delete(language));
  }
  return dictionaries.get(language);
}

export async function translator(language = 'en') {
  language = language === 'it' ? 'it' : 'en';
  const fallback = await dictionary('en');
  let messages = fallback;
  if (language !== 'en') {
    try { messages = await dictionary(language); } catch { language = 'en'; }
  }
  return {
    language,
    t(key, params = {}) {
      const template = Object.hasOwn(messages, key) ? messages[key] : Object.hasOwn(fallback, key) ? fallback[key] : key;
      return template.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
    }
  };
}
