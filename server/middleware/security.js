import { HttpError } from '../utils/http-error.js';

export function createRequestGuard() {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
        return next(new HttpError(403, 'errors.origin'));
      }
      if (req.method !== 'DELETE' && req.path !== '/auth/logout' && !req.is('application/json')) return next(new HttpError(415, 'errors.jsonRequired'));
    }
    next();
  };
}

export function createBodyGuard() {
  return (req, res, next) => {
    req.body ??= {};
    if (typeof req.body !== 'object' || Array.isArray(req.body)) return next(new HttpError(400, 'errors.body'));
    next();
  };
}
