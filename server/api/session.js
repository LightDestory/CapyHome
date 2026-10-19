import { Router } from 'express';
import { transaction } from '../db.js';
import { cookieOptions } from '../utils/session.js';

export function createSessionRouter(db, config) {
  const { Session } = db.models;
  const router = Router();
  router.get('/api/me', (req, res) => res.json({ user: req.user, csrfToken: req.csrfToken, timeZone: config.timeZone }));
  router.post('/api/auth/logout', async (req, res) => {
    await transaction(db, t => Session.destroy({ where: { tokenHash: req.sessionHash }, transaction: t }));
    res.clearCookie('capyhome_session', cookieOptions(config.cookieSecure));
    res.json({ message: req.t('auth.loggedOut') });
  });
  return router;
}
