import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Op } from 'sequelize';
import { transaction } from '../db.js';
import { HttpError } from '../utils/http-error.js';
import { username, password, text } from '../utils/validation.js';
import { hashPassword, isPasswordHash, verifyPassword, randomToken, tokenHash } from '../utils/passwords.js';
import { sessionDuration, cookieOptions, publicUser, readSessionToken } from '../utils/session.js';

export async function bootstrapAdmin(db, config) {
  const { User } = db.models;
  if (await User.findOne({ where: { role: 'admin', status: 'approved' } })) return;
  const adminPasswordHash = typeof config.adminPassword === 'string' ? config.adminPassword.trim() : '';
  if (!config.adminUsername || !isPasswordHash(adminPasswordHash)) {
    throw new Error('First startup requires ADMIN_USERNAME and ADMIN_PASSWORD set to a SHA-256 password hash. Generate one with: printf "%s" "your-password" | sha256sum | cut -d" " -f1');
  }
  await User.create({
    name: text(config.adminName || 'Amministratore', 'fields.name', 100),
    username: username(config.adminUsername),
    passwordHash: adminPasswordHash,
    role: 'admin', status: 'approved'
  });
}

export async function createAuthRouter(db, config) {
  const { User, Session } = db.models;
  const dummyHash = await hashPassword(randomToken());
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: req => ({ error: req.t('auth.loginLimited') })
  });
  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: req => ({ error: req.t('auth.registerLimited') })
  });

  const router = Router();
  router.post('/api/auth/register', registrationLimiter, async (req, res) => {
    const name = text(req.body.name, 'fields.name', 100);
    const loginName = username(req.body.username);
    const hash = await hashPassword(password(req.body.password));
    await transaction(db, t => User.create({ name, username: loginName, passwordHash: hash }, { transaction: t }));
    res.status(201).json({ message: req.t('auth.registered') });
  });

  router.post('/api/auth/login', limiter, async (req, res) => {
    const loginName = username(req.body.username);
    if (typeof req.body.password !== 'string' || !req.body.password.length || req.body.password.length > 128) throw new HttpError(400, 'validation.password');
    const row = await User.findOne({ where: { username: loginName } });
    const valid = await verifyPassword(req.body.password, row?.passwordHash || dummyHash);
    if (!row || !valid) throw new HttpError(401, 'auth.invalidCredentials');
    const token = randomToken();
    const csrfToken = randomToken();
    const user = await transaction(db, async t => {
      // Re-check approval inside the session transaction after password verification.
      const user = await User.findByPk(row.id, { transaction: t });
      if (!user || user.status !== 'approved') throw new HttpError(403, user?.status === 'pending' ? 'auth.pending' : 'auth.rejected');
      await Session.destroy({ where: { expiresAt: { [Op.lte]: Date.now() } }, transaction: t });
      const oldToken = readSessionToken(req);
      if (oldToken) await Session.destroy({ where: { tokenHash: tokenHash(oldToken) }, transaction: t });
      await Session.create({ tokenHash: tokenHash(token), userId: user.id, csrfToken, expiresAt: Date.now() + sessionDuration }, { transaction: t });
      return user;
    });
    res.cookie('capyhome_session', token, { ...cookieOptions(config.cookieSecure), maxAge: sessionDuration });
    res.json({ user: publicUser(user), csrfToken, timeZone: config.timeZone });
  });

  return router;
}
