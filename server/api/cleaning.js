import { Router } from 'express';
import { Op } from 'sequelize';
import { HttpError } from '../utils/http-error.js';
import { text, id, date } from '../utils/validation.js';

export function createCleaningRouter(db, queries, mutate, config) {
  const { Room, CleaningLog } = db.models;
  const router = Router();
  router.get('/api/cleaning', async (req, res) => res.json({ rooms: await queries.rooms(), logs: await queries.cleaningLogs() }));
  router.post('/api/cleaning', async (req, res) => {
    if (!Array.isArray(req.body.roomIds) || !req.body.roomIds.length || req.body.roomIds.length > 100) throw new HttpError(400, 'validation.rooms');
    const roomIds = [...new Set(req.body.roomIds.map(id))];
    const day = date(req.body.date, config.timeZone);
    const notes = text(req.body.notes, 'fields.notes', 2000, true);
    await mutate(req, async t => {
      if (await Room.count({ where: { id: { [Op.in]: roomIds }, active: true }, transaction: t }) !== roomIds.length) throw new HttpError(404, 'rooms.unavailable');
      await CleaningLog.bulkCreate(roomIds.map(roomId => ({ roomId, userId: req.user.id, date: day, notes })), { transaction: t, validate: true });
    });
    res.status(201).json({ message: req.t('cleaning.saved') });
  });
  return router;
}
