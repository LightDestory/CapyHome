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
  let connected = false;
  try {
    await db.authenticate();
    connected = true;
    await db.query('PRAGMA journal_mode = WAL');
    await db.sync();
    await House.findOrCreate({ where: { id: 1 }, defaults: { name: 'La nostra casa' } });
    return db;
  } catch (error) {
    // A failed SQLite open leaves its handle registered, and closing such a handle never calls back.
    // Only close a connection that opened, so the real startup error is reported instead of a hang.
    if (connected) {
      await db.close().catch(() => {});
      throw error;
    }
    throw new Error(`Cannot open the database at ${filename}: ${error.message}. Make sure the directory exists and is writable by the user running CapyHome.`, { cause: error });
  }
}

export function transaction(db, work, type = Transaction.TYPES.IMMEDIATE) {
  // Serialize transactions, including read snapshots on the shared in-memory connection.
  const result = (writes.get(db) || Promise.resolve()).then(() => db.transaction({ type }, work));
  writes.set(db, result.catch(() => {}));
  return result;
}
