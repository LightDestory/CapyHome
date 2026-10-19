import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Sequelize, Transaction } from 'sequelize';
import { defineModels } from './models/index.js';

const writes = new WeakMap();

export async function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new Sequelize({
    dialect: 'sqlite', storage: filename, logging: false,
    define: { underscored: true, updatedAt: false },
    retry: { match: [/SQLITE_BUSY/], max: 5 }
  });
  const { House } = defineModels(db);
  try {
    await db.authenticate();
    await db.query('PRAGMA journal_mode = WAL');
    await db.sync();
    await House.findOrCreate({ where: { id: 1 }, defaults: { name: 'La nostra casa' } });
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export function transaction(db, work, type = Transaction.TYPES.IMMEDIATE) {
  // Serialize transactions, including read snapshots on the shared in-memory connection.
  const result = (writes.get(db) || Promise.resolve()).then(() => db.transaction({ type }, work));
  writes.set(db, result.catch(() => {}));
  return result;
}
