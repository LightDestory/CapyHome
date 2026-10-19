import { DataTypes } from 'sequelize';

export function defineModels(db) {
  const User = db.define('User', {
    name: { type: DataTypes.STRING(100), allowNull: false },
    username: {
      type: DataTypes.STRING(254), allowNull: false, unique: true,
      set(value) { this.setDataValue('username', typeof value === 'string' ? value.trim().toLowerCase() : value); },
      validate: { len: [1, 254], is: /^\S+$/ }
    },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'roommate', validate: { isIn: [['admin', 'roommate']] } },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending', validate: { isIn: [['pending', 'approved', 'rejected']] } }
  }, { tableName: 'users' });
  const Session = db.define('Session', {
    tokenHash: { type: DataTypes.STRING(64), primaryKey: true },
    csrfToken: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.BIGINT, allowNull: false }
  }, { tableName: 'sessions', timestamps: false, indexes: [{ fields: ['expires_at'] }, { fields: ['user_id'] }] });
  const House = db.define('House', {
    id: { type: DataTypes.INTEGER, primaryKey: true, validate: { min: 1, max: 1 } },
    name: { type: DataTypes.STRING(120), allowNull: false },
    address: { type: DataTypes.STRING(250), allowNull: false, defaultValue: '' },
    location: { type: DataTypes.STRING(150), allowNull: false, defaultValue: '' }
  }, { tableName: 'house', timestamps: false });
  const Room = db.define('Room', {
    name: { type: DataTypes.STRING(100), allowNull: false },
    type: { type: DataTypes.STRING(100), allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: 'rooms', timestamps: false, indexes: [{ unique: true, fields: [{ name: 'name', collate: 'NOCASE' }], where: { active: true } }] });
  const WasteType = db.define('WasteType', {
    name: { type: DataTypes.STRING(100), allowNull: false },
    days: { type: DataTypes.JSON, allowNull: false },
    instructions: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: 'waste_types', timestamps: false, indexes: [{ unique: true, fields: [{ name: 'name', collate: 'NOCASE' }], where: { active: true } }] });
  const CleaningLog = db.define('CleaningLog', {
    date: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' }
  }, { tableName: 'cleaning_logs', indexes: [{ fields: ['room_id', 'date', 'id'] }] });
  const WasteLog = db.define('WasteLog', {
    date: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' }
  }, { tableName: 'waste_logs' });
  const FundTransaction = db.define('FundTransaction', {
    type: { type: DataTypes.STRING, allowNull: false, validate: { isIn: [['contribution', 'expense']] } },
    amountCents: { type: DataTypes.INTEGER, allowNull: false, validate: { isInt: true, min: 1, max: 100000000 } },
    description: { type: DataTypes.STRING(500), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false }
  }, { tableName: 'fund_transactions' });

  for (const model of [Session, CleaningLog, WasteLog, FundTransaction]) {
    model.belongsTo(User, { as: 'user', foreignKey: { name: 'userId', allowNull: false }, onDelete: model === Session ? 'CASCADE' : 'RESTRICT' });
  }
  CleaningLog.belongsTo(Room, { as: 'room', foreignKey: { name: 'roomId', allowNull: false }, onDelete: 'RESTRICT' });
  Room.hasMany(CleaningLog, { as: 'cleaningLogs', foreignKey: 'roomId' });
  WasteLog.belongsTo(WasteType, { as: 'wasteType', foreignKey: { name: 'wasteTypeId', allowNull: false }, onDelete: 'RESTRICT' });

  return { User, Session, House, Room, WasteType, CleaningLog, WasteLog, FundTransaction };
}
