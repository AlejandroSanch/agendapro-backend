import { getControlPool } from '../data/db';
import { RowDataPacket } from 'mysql2/promise';
import { createSystemNotification } from '../data/repositories/notification.repository';
import { q } from '../data/utils';
import { ApiError } from '../utils/ApiError';
import { cleanDeletedName } from '../utils/sanitize';
import { logger } from '../utils/logger';

interface TenantMapRow extends RowDataPacket {
  tenant_db_name: string;
}

export interface PublicAppointmentDetails {
  id: string;
  date: string;
  customerName: string;
  businessName: string;
  serviceName: string;
  specialistName: string;
  businessAddress: string;
}

export const PublicService = {
  /**
   * Finds the tenant DB name for a given appointment ID.
   * First checks the lookup table (O(1)), then falls back to scanning all tenants.
   * If found via scan, backfills the lookup table for future requests.
   */
  async resolveTenantForAppointment(appointmentId: string): Promise<string | null> {
    const db = getControlPool();

    // 1. Fast path: lookup table
    const [mapRows] = await db.query<TenantMapRow[]>(
      `SELECT tenant_db_name FROM appointment_tenant_map WHERE appointment_id = ? LIMIT 1`,
      [appointmentId]
    );
    if (mapRows[0]) return mapRows[0].tenant_db_name;

    // 2. Slow path: scan all tenants (for appointments created before the lookup table existed)
    const [tenants] = await db.query<RowDataPacket[]>(
      'SELECT tenant_db_name FROM users WHERE tenant_db_name IS NOT NULL'
    );

    for (const t of tenants) {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id FROM ${q(t.tenant_db_name)}.appointments WHERE id = ? LIMIT 1`,
        [appointmentId]
      );
      if (rows.length > 0) {
        // Backfill lookup table for future requests
        try {
          await db.query(
            `INSERT IGNORE INTO appointment_tenant_map (appointment_id, tenant_db_name) VALUES (?, ?)`,
            [appointmentId, t.tenant_db_name]
          );
        } catch (err) { 
          logger.warn({ err, appointmentId, tenantDbName: t.tenant_db_name }, 'Failed to backfill appointment_tenant_map'); 
        }
        return t.tenant_db_name;
      }
    }

    return null;
  },

  /**
   * Confirms an appointment and sends a system notification to the tenant.
   */
  async confirmAppointment(appointmentId: string, source: 'web' | 'email' = 'web'): Promise<string> {
    const foundTenant = await this.resolveTenantForAppointment(appointmentId);
    if (!foundTenant) throw new ApiError(404, 'Cita no encontrada.');

    const db = getControlPool();
    await db.query(
      `UPDATE ${q(foundTenant)}.appointments SET status = 'confirmed', updated_at = NOW() WHERE id = ?`,
      [appointmentId]
    );

    // --- NOTIFICACIÓN AL GESTOR ---
    try {
      const [aptInfo] = await db.query<RowDataPacket[]>(
        `SELECT a.service_name, c.first_name, c.last_name FROM ${q(foundTenant)}.appointments a 
         JOIN ${q(foundTenant)}.customers c ON a.customer_id = c.id WHERE a.id = ?`, [appointmentId]
      );
      const customerName = aptInfo[0] ? `${aptInfo[0].first_name} ${aptInfo[0].last_name}` : 'Cliente';
      const aptTitle = aptInfo[0]?.service_name || 'Cita';

      await createSystemNotification(foundTenant, {
        type: 'appointment_confirmed',
        title: 'Cita Confirmada ✅',
        message: `${customerName} ha confirmado su cita para "${aptTitle}"${source === 'email' ? ' vía email' : ''}.`,
        metadata: { appointment_id: appointmentId, source }
      });
    } catch (err) {
      console.error('Error creating system notification:', err);
    }

    return foundTenant;
  },

  /**
   * Fetches public details for an appointment.
   */
  async getAppointmentDetails(appointmentId: string): Promise<PublicAppointmentDetails> {
    const foundTenant = await this.resolveTenantForAppointment(appointmentId);
    if (!foundTenant) throw new ApiError(404, 'Cita no encontrada.');

    const db = getControlPool();
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT 
        a.id, 
        a.start_at, 
        a.service_name,
        c.first_name AS customer_name,
        s.name AS service_name_ref,
        st.first_name AS specialist_name,
        st.last_name AS specialist_last_name,
        bs.address AS business_address
      FROM ${q(foundTenant)}.appointments a
      JOIN ${q(foundTenant)}.customers c ON a.customer_id = c.id
      LEFT JOIN ${q(foundTenant)}.appointment_services aps ON a.id = aps.appointment_id
      LEFT JOIN ${q(foundTenant)}.services s ON aps.service_id = s.id
      LEFT JOIN ${q(foundTenant)}.staff st ON aps.staff_id = st.id
      LEFT JOIN ${q(foundTenant)}.business_settings bs ON bs.id = 1
      WHERE a.id = ?
      LIMIT 1`,
      [appointmentId]
    );

    if (!rows[0]) throw new ApiError(404, 'Cita no encontrada.');

    const apt = rows[0];

    // Nombre del negocio
    const [userRows] = await db.query<RowDataPacket[]>(
      'SELECT business_name, name FROM users WHERE tenant_db_name = ?', [foundTenant]
    );
    const bizName = userRows[0]?.business_name || userRows[0]?.name || 'AgendaPro Business';

    return {
      id: apt.id,
      date: apt.start_at,
      customerName: apt.customer_name,
      businessName: bizName,
      serviceName: cleanDeletedName(apt.service_name || apt.service_name_ref || 'Servicio Profesional'),
      specialistName: `${apt.specialist_name || ''} ${apt.specialist_last_name || ''}`.trim() || 'Especialista asignado',
      businessAddress: apt.business_address || 'Dirección por confirmar'
    };
  }
};
