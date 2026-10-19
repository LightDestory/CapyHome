import { Router } from 'express';
import { HttpError } from '../utils/http-error.js';
import { text, id, waste } from '../utils/validation.js';

export function createAdminRouter(db, queries, mutate) {
  const { User, Session, House, Room, WasteType } = db.models;
  const router = Router();
  router.use('/api/admin', (req, res, next) => req.user.role === 'admin' ? next() : next(new HttpError(403, 'auth.adminRequired')));
  router.get('/api/admin/users', async (req, res) => res.json({ users: await User.findAll({ attributes: ['id', 'name', 'username', 'role', 'status', 'createdAt'], order: [['createdAt', 'DESC'], ['id', 'DESC']] }) }));
  router.patch('/api/admin/users/:id', async (req, res) => {
    const userId = id(req.params.id);
    const { role, status } = req.body;
    if ((role === undefined && status === undefined) || (role !== undefined && !['admin', 'roommate'].includes(role)) || (status !== undefined && !['approved', 'rejected'].includes(status))) throw new HttpError(400, 'validation.userAccess');
    await mutate(req, async t => {
      const user = await User.findByPk(userId, { transaction: t });
      if (!user) throw new HttpError(404, 'users.notFound');
      const nextRole = role ?? user.role;
      const nextStatus = status ?? user.status;
      if (user.role === 'admin' && user.status === 'approved' && (nextRole !== 'admin' || nextStatus !== 'approved')) {
        if (await User.count({ where: { role: 'admin', status: 'approved' }, transaction: t }) <= 1) throw new HttpError(409, 'users.lastAdmin');
      }
      const revokeSessions = nextStatus !== 'approved' || nextRole !== user.role;
      await user.update({ role: nextRole, status: nextStatus }, { transaction: t });
      if (revokeSessions) await Session.destroy({ where: { userId }, transaction: t });
    });
    res.json({ message: req.t('users.saved') });
  });
  router.get('/api/admin/settings', async (req, res) => res.json({ house: await queries.house(), rooms: await queries.rooms(), schedule: await queries.schedule() }));
  router.put('/api/admin/house', async (req, res) => {
    const values = { name: text(req.body.name, 'fields.houseName', 120), address: text(req.body.address, 'fields.address', 250, true), location: text(req.body.location, 'fields.location', 150, true) };
    await mutate(req, t => House.update(values, { where: { id: 1 }, transaction: t }));
    res.json({ message: req.t('house.saved'), house: await queries.house() });
  });
  router.post('/api/admin/rooms', async (req, res) => {
    const values = { name: text(req.body.name, 'fields.roomName', 100), type: text(req.body.type, 'fields.roomType', 100) };
    const room = await mutate(req, t => Room.create(values, { transaction: t }));
    res.status(201).json({ id: room.id, message: req.t('rooms.created') });
  });
  router.delete('/api/admin/rooms/:id', async (req, res) => {
    const roomId = id(req.params.id);
    const [count] = await mutate(req, t => Room.update({ active: false }, { where: { id: roomId, active: true }, transaction: t }));
    if (!count) throw new HttpError(404, 'rooms.notFound');
    res.json({ message: req.t('rooms.archived') });
  });
  router.post('/api/admin/waste', async (req, res) => {
    const value = waste(req.body);
    const wasteType = await mutate(req, t => WasteType.create(value, { transaction: t }));
    res.status(201).json({ id: wasteType.id, message: req.t('waste.created') });
  });
  router.put('/api/admin/waste/:id', async (req, res) => {
    const value = waste(req.body);
    const typeId = id(req.params.id);
    const [count] = await mutate(req, t => WasteType.update(value, { where: { id: typeId, active: true }, transaction: t }));
    if (!count) throw new HttpError(404, 'waste.notFound');
    res.json({ message: req.t('waste.updated') });
  });
  router.delete('/api/admin/waste/:id', async (req, res) => {
    const typeId = id(req.params.id);
    const [count] = await mutate(req, t => WasteType.update({ active: false }, { where: { id: typeId, active: true }, transaction: t }));
    if (!count) throw new HttpError(404, 'waste.notFound');
    res.json({ message: req.t('waste.archived') });
  });
  return router;
}
