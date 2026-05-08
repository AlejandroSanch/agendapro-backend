import mysql, { Pool } from 'mysql2/promise';
import { env } from '../config/env';

let controlPool: Pool | null = null;

export function getControlPool(): Pool {
  if (!controlPool) {
    throw new Error('Database not initialized. Call ensureControlDatabaseAndPool() first.');
  }
  return controlPool;
}

export async function ensureControlDatabaseAndPool(): Promise<void> {
  if (controlPool) return;

  const adminPool = mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0,
  });

  try {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(env.mysqlDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await adminPool.end();
  }

  controlPool = mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    waitForConnections: true,
    connectionLimit: Math.max(1, env.mysqlConnectionLimit),
    queueLimit: 0,
    dateStrings: true,
  });
}
