import { translator } from '../i18n/index.js';

export function createLocaleMiddleware(fallbackLanguage = 'en') {
  return async (req, res, next) => {
    const locale = await translator(req.acceptsLanguages(['it', 'en']) || fallbackLanguage);
    req.t = locale.t;
    res.set('Content-Language', locale.language);
    res.vary('Accept-Language');
    next();
  };
}
