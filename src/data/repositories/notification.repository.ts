import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getControlPool } from '../db';

export interface SystemNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  metadata: any;
  created_at: Date;
}

/**
 * Lista las notificaciones del sistema para un tenant.
 */
export async function listSystemNotifications(
  tenantDb: string,
  limit = 50,
): Promise<SystemNotification[]> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM \`${tenantDb}\`.system_notifications ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );

  return rows.map((r) => ({
    id: String(r.id),
    type: r.type,
    title: r.title,
    message: r.message,
    is_read: !!r.is_read,
    metadata: r.metadata,
    created_at: r.created_at,
  }));
}

/**
 * Crea una nueva notificación del sistema.
 */
export async function createSystemNotification(
  tenantDb: string,
  data: {
    type: string;
    title: string;
    message: string;
    metadata?: any;
  },
): Promise<void> {
  const db = getControlPool();

  await db.query(
    `INSERT INTO \`${tenantDb}\`.system_notifications (type, title, message, metadata) VALUES (?, ?, ?, ?)`,
    [data.type, data.title, data.message, JSON.stringify(data.metadata || {})],
  );
}

/**
 * Marca una notificación como leída.
 */
export async function markNotificationAsRead(tenantDb: string, id: string): Promise<boolean> {
  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE \`${tenantDb}\`.system_notifications SET is_read = 1 WHERE id = ?`,
    [id],
  );
  return result.affectedRows > 0;
}

/**
 * Marca todas las notificaciones como leídas.
 */
export async function markAllNotificationsAsRead(tenantDb: string): Promise<void> {
  const db = getControlPool();
  await db.query(`UPDATE \`${tenantDb}\`.system_notifications SET is_read = 1 WHERE is_read = 0`);
}

/**
 * Elimina una notificación específica.
 */
export async function deleteNotification(tenantDb: string, id: string): Promise<boolean> {
  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM \`${tenantDb}\`.system_notifications WHERE id = ?`,
    [id],
  );
  return result.affectedRows > 0;
}
