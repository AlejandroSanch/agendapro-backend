import { Request, Response } from 'express';
import { getControlPool } from '../data/db';
import { RowDataPacket } from 'mysql2/promise';

/**
 * Confirma una cita de forma pública (sin auth) usando su ID.
 */
export async function confirmAppointmentPublic(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const db = getControlPool();
    const [tenants] = await db.query<RowDataPacket[]>('SELECT tenant_db_name FROM users WHERE tenant_db_name IS NOT NULL');

    let foundTenant = '';
    for (const t of tenants) {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id FROM \`${t.tenant_db_name}\`.appointments WHERE id = ? LIMIT 1`,
        [id]
      );
      if (rows.length > 0) {
        foundTenant = t.tenant_db_name;
        break;
      }
    }

    if (!foundTenant) {
      return res.status(404).json({ message: 'Cita no encontrada.' });
    }

    await db.query(
      `UPDATE \`${foundTenant}\`.appointments SET status = 'confirmed', updated_at = NOW() WHERE id = ?`,
      [id]
    );

    res.json({ success: true, message: 'Cita confirmada correctamente.' });
  } catch (error) {
    console.error('Error confirming appointment:', error);
    res.status(500).json({ message: 'Error interno al confirmar la cita.' });
  }
}

export async function getAppointmentPublicDetails(req: Request, res: Response) {
  const { id } = req.params;
  console.log(`🔍 [Public-Details] Searching for appointment ID: ${id}`);

  try {
    const db = getControlPool();
    const [tenants] = await db.query<RowDataPacket[]>('SELECT tenant_db_name FROM users WHERE tenant_db_name IS NOT NULL');

    for (const t of tenants) {
      try {
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT 
            a.id, 
            a.start_at, 
            a.title,
            c.first_name AS customer_name,
            s.name AS service_name,
            st.first_name AS specialist_name,
            st.last_name AS specialist_last_name,
            bs.address AS business_address
          FROM \`${t.tenant_db_name}\`.appointments a
          JOIN \`${t.tenant_db_name}\`.customers c ON a.customer_id = c.id
          LEFT JOIN \`${t.tenant_db_name}\`.appointment_services aps ON a.id = aps.appointment_id
          LEFT JOIN \`${t.tenant_db_name}\`.services s ON aps.service_id = s.id
          LEFT JOIN \`${t.tenant_db_name}\`.staff st ON aps.staff_id = st.id
          LEFT JOIN \`${t.tenant_db_name}\`.business_settings bs ON bs.id = 1
          WHERE a.id = ?
          LIMIT 1`,
          [id]
        );

        if (rows.length > 0) {
          const apt = rows[0];
          console.log(`✅ [Public-Details] Found in tenant: ${t.tenant_db_name}`);
          
          // Buscamos el nombre del negocio en la tabla users
          const [userRows] = await db.query<RowDataPacket[]>('SELECT business_name, name FROM users WHERE tenant_db_name = ?', [t.tenant_db_name]);
          const bizName = userRows[0]?.business_name || userRows[0]?.name || 'AgendaPro Business';

          return res.json({
            id: apt.id,
            date: apt.start_at,
            customerName: apt.customer_name,
            businessName: bizName,
            serviceName: apt.service_name || apt.title || 'Servicio Profesional',
            specialistName: `${apt.specialist_name || ''} ${apt.specialist_last_name || ''}`.trim() || 'Especialista asignado',
            businessAddress: apt.business_address || 'Dirección por confirmar'
          });
        }
      } catch (e) {
        console.error(`❌ [Public-Details] Error in tenant ${t.tenant_db_name}:`, e);
      }
    }

    console.warn(`⚠️ [Public-Details] Appointment not found in any tenant.`);
    res.status(404).json({ message: 'Cita no encontrada.' });
  } catch (error) {
    console.error('❌ [Public-Details] Global error:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
}
