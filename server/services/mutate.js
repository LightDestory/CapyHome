import { Op } from 'sequelize';
import { transaction } from '../db.js';
import { HttpError } from '../utils/http-error.js';

export function createMutate(db) {
  const { User, Session } = db.models;
  return (req, work) => transaction(db, async t => {
    // Authorization may have changed while this mutation waited for SQLite's writer.
    const session = await Session.findOne({
      where: { tokenHash: req.sessionHash, expiresAt: { [Op.gt]: Date.now() } },
      include: [{ model: User, as: 'user', where: { status: 'approved' } }], transaction: t
    });
    if (!session) throw new HttpError(401, 'auth.required');
    if (req.path.startsWith('/api/admin/') && session.user.role !== 'admin') throw new HttpError(403, 'auth.adminRequired');
    return work(t);
  });
}
