import { Op } from 'sequelize';
import { HttpError } from '../utils/http-error.js';
import { tokenHash } from '../utils/passwords.js';
import { publicUser, readSessionToken } from '../utils/session.js';

export function createSessionMiddleware(db) {
  const { User, Session } = db.models;
  return async (req, res, next) => {
    const token = readSessionToken(req);
    const row = token && await Session.findOne({
      where: { tokenHash: tokenHash(token), expiresAt: { [Op.gt]: Date.now() } },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'username', 'role', 'status'], where: { status: 'approved' } }]
    });
    if (!row) return next(new HttpError(401, 'auth.required'));
    req.user = publicUser(row.user);
    req.sessionHash = row.tokenHash;
    req.csrfToken = row.csrfToken;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== row.csrfToken) {
      return next(new HttpError(403, 'auth.csrf'));
    }
    next();
  };
}
