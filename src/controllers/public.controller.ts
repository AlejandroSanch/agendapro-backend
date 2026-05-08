import { Request, Response } from 'express';
import { getControlPool } from '../data/db';
import { RowDataPacket } from 'mysql2/promise';
import { createSystemNotification } from '../data/repositories/notification.repository';
import { q } from '../data/utils';

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
        `SELECT id FROM ${q(t.tenant_db_name)}.appointments WHERE id = ? LIMIT 1`,
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
      `UPDATE ${q(foundTenant)}.appointments SET status = 'confirmed', updated_at = NOW() WHERE id = ?`,
      [id]
    );

    // --- NOTIFICACIÓN AL GESTOR ---
    try {
      const [aptInfo] = await db.query<RowDataPacket[]>(
        `SELECT a.service_name, c.first_name, c.last_name FROM ${q(foundTenant)}.appointments a 
         JOIN ${q(foundTenant)}.customers c ON a.customer_id = c.id WHERE a.id = ?`, [id]
      );
      const customerName = aptInfo[0] ? `${aptInfo[0].first_name} ${aptInfo[0].last_name}` : 'Cliente';
      const aptTitle = aptInfo[0]?.service_name || 'Cita';

      await createSystemNotification(foundTenant, {
        type: 'appointment_confirmed',
        title: 'Cita Confirmada ✅',
        message: `${customerName} ha confirmado su cita para "${aptTitle}".`,
        metadata: { appointment_id: id }
      });
    } catch (err) {
      console.error('Error creating system notification:', err);
    }

    res.json({ success: true, message: 'Cita confirmada correctamente.' });
  } catch (error) {
    console.error('Error confirming appointment:', error);
    res.status(500).json({ message: 'Error interno al confirmar la cita.' });
  }
}

/**
 * Confirma una cita vía GET (para links de email) y redirige al frontend.
 */
export async function confirmAppointmentPublicGet(req: Request, res: Response) {
  const { id } = req.params;
  const frontendUrl = process.env.APP_URL || 'http://localhost:4200';

  try {
    const db = getControlPool();
    const [tenants] = await db.query<RowDataPacket[]>('SELECT tenant_db_name FROM users WHERE tenant_db_name IS NOT NULL');

    let foundTenant = '';
    for (const t of tenants) {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id FROM ${q(t.tenant_db_name)}.appointments WHERE id = ? LIMIT 1`,
        [id]
      );
      if (rows.length > 0) {
        foundTenant = t.tenant_db_name;
        break;
      }
    }

    if (!foundTenant) {
      return res.redirect(`${frontendUrl}/confirmar-cita/${id}?error=not_found`);
    }

    await db.query(
      `UPDATE ${q(foundTenant)}.appointments SET status = 'confirmed', updated_at = NOW() WHERE id = ?`,
      [id]
    );

    // --- NOTIFICACIÓN AL GESTOR ---
    try {
      const [aptInfo] = await db.query<RowDataPacket[]>(
        `SELECT a.service_name, c.first_name, c.last_name FROM ${q(foundTenant)}.appointments a 
         JOIN ${q(foundTenant)}.customers c ON a.customer_id = c.id WHERE a.id = ?`, [id]
      );
      const customerName = aptInfo[0] ? `${aptInfo[0].first_name} ${aptInfo[0].last_name}` : 'Cliente';
      const aptTitle = aptInfo[0]?.service_name || 'Cita';

      await createSystemNotification(foundTenant, {
        type: 'appointment_confirmed',
        title: 'Cita Confirmada ✅',
        message: `${customerName} ha confirmado su cita para "${aptTitle}" vía email.`,
        metadata: { appointment_id: id, source: 'email' }
      });
    } catch (err) {
      console.error('Error creating system notification:', err);
    }

    // Redirigir al frontend con confirmación exitosa
    res.redirect(`${frontendUrl}/confirmar-cita/${id}?confirmed=true`);
  } catch (error) {
    console.error('Error confirming appointment via GET:', error);
    res.redirect(`${frontendUrl}/confirmar-cita/${id}?error=server`);
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
            a.service_name,
            c.first_name AS customer_name,
            s.name AS service_name_ref,
            st.first_name AS specialist_name,
            st.last_name AS specialist_last_name,
            bs.address AS business_address
          FROM ${q(t.tenant_db_name)}.appointments a
          JOIN ${q(t.tenant_db_name)}.customers c ON a.customer_id = c.id
          LEFT JOIN ${q(t.tenant_db_name)}.appointment_services aps ON a.id = aps.appointment_id
          LEFT JOIN ${q(t.tenant_db_name)}.services s ON aps.service_id = s.id
          LEFT JOIN ${q(t.tenant_db_name)}.staff st ON aps.staff_id = st.id
          LEFT JOIN ${q(t.tenant_db_name)}.business_settings bs ON bs.id = 1
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
            serviceName: (apt.service_name || apt.service_name_ref || 'Servicio Profesional').replace(/^\[BORRADO\] /, '').replace(/ \(\d{6}\)$/, ''),
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
