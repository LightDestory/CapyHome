import { Router } from 'express';
import { transaction } from '../db.js';

export function createDashboardRouter(db, queries) {
  const { User, CleaningLog, WasteLog } = db.models;
  const router = Router();
  router.get('/api/dashboard', async (req, res) => {
    const [cleaning, waste, transactions, houseData, roomData, scheduleData, balanceCents, cleaningCount, wasteCount, pendingUsers] = await transaction(db, t => {
      const latest = { limit: 12, order: [['date', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']], transaction: t };
      return Promise.all([
        queries.cleaningLogs(latest), queries.wasteLogs(latest), queries.fund(latest), queries.house(t), queries.rooms(t), queries.schedule(t), queries.balance(t),
        CleaningLog.count({ transaction: t }), WasteLog.count({ transaction: t }),
        req.user.role === 'admin' ? User.count({ where: { status: 'pending' }, transaction: t }) : 0
      ]);
    }, 'DEFERRED');
    const activity = [
      ...cleaning.map(row => ({ ...row, id: `cleaning-${row.id}`, type: 'cleaning', description: req.t('activity.cleaning', { name: row.roomName }), amountCents: null })),
      ...waste.map(row => ({ ...row, id: `waste-${row.id}`, type: 'waste', description: req.t('activity.waste', { name: row.wasteName }), amountCents: null })),
      ...transactions.map(row => ({ ...row, id: `fund-${row.id}` }))
    ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt || b.id.localeCompare(a.id, undefined, { numeric: true })).slice(0, 12);
    res.json({ house: houseData, rooms: roomData, schedule: scheduleData, activity, stats: { balanceCents, cleaningCount, wasteCount, pendingUsers } });
  });
  return router;
}
