import { fn, col } from 'sequelize';

export function createQueries(db) {
  const { User, House, Room, WasteType, CleaningLog, WasteLog, FundTransaction } = db.models;
  const byName = [[fn('lower', col('name')), 'ASC']];
  const byDate = [['date', 'DESC'], ['id', 'DESC']];
  const userInclude = { model: User, as: 'user', attributes: ['name'] };
  const house = t => House.findByPk(1, { attributes: ['name', 'address', 'location'], raw: true, transaction: t });
  const rooms = async t => (await Room.findAll({
    where: { active: true }, order: byName, transaction: t,
    include: [{ model: CleaningLog, as: 'cleaningLogs', separate: true, limit: 1, order: byDate, include: [userInclude] }]
  })).map(room => ({ id: room.id, name: room.name, type: room.type, lastCleanedAt: room.cleaningLogs[0]?.date ?? null, lastCleanedBy: room.cleaningLogs[0]?.user.name ?? null }));
  const schedule = t => WasteType.findAll({ where: { active: true }, attributes: ['id', 'name', 'days', 'instructions'], order: byName, transaction: t });
  const balance = async t => {
    const totals = await FundTransaction.findAll({ attributes: ['type', [fn('SUM', col('amount_cents')), 'total']], group: ['type'], raw: true, transaction: t });
    return totals.reduce((sum, row) => sum + (row.type === 'contribution' ? Number(row.total) : -Number(row.total)), 0);
  };
  const fund = async (options = {}) => (await FundTransaction.findAll({ include: [userInclude], order: byDate, ...options }))
    .map(row => ({ id: row.id, type: row.type, amountCents: row.amountCents, description: row.description, date: row.date, userName: row.user.name, createdAt: row.createdAt }));
  const cleaningLogs = async (options = {}) => (await CleaningLog.findAll({ include: [userInclude, { model: Room, as: 'room', attributes: ['name'] }], order: byDate, ...options }))
    .map(row => ({ id: row.id, roomName: row.room.name, userName: row.user.name, date: row.date, notes: row.notes, createdAt: row.createdAt }));
  const wasteLogs = async (options = {}) => (await WasteLog.findAll({ include: [userInclude, { model: WasteType, as: 'wasteType', attributes: ['name'] }], order: byDate, ...options }))
    .map(row => ({ id: row.id, wasteName: row.wasteType.name, userName: row.user.name, date: row.date, notes: row.notes, createdAt: row.createdAt }));
  return { house, rooms, schedule, balance, fund, cleaningLogs, wasteLogs };
}
