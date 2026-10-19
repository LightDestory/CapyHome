import { Router } from 'express';
import { HttpError } from '../utils/http-error.js';
import { text, id, date } from '../utils/validation.js';

export function createWasteRouter(db, queries, mutate, config) {
  const { WasteType, WasteLog } = db.models;
  const router = Router();
  router.get('/api/waste', async (req, res) => res.json({ schedule: await queries.schedule(), logs: await queries.wasteLogs() }));
  router.post('/api/waste', async (req, res) => {
    const typeId = id(req.body.wasteTypeId);
    const day = date(req.body.date, config.timeZone);
    const notes = text(req.body.notes, 'fields.notes', 2000, true);
    await mutate(req, async t => {
      if (!await WasteType.findOne({ where: { id: typeId, active: true }, transaction: t })) throw new HttpError(404, 'waste.unavailable');
      await WasteLog.create({ wasteTypeId: typeId, userId: req.user.id, date: day, notes }, { transaction: t });
    });
    res.status(201).json({ message: req.t('waste.saved') });
  });
  return router;
}
