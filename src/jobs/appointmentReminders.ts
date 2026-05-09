import { Pool, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../data/db';
import { q } from '../data/utils';
import { env } from '../config/env';
import { sendMail } from '../utils/mailer';
import { WhatsAppService } from '../services/whatsapp.service';
import { buildAppointmentReminderHtml, buildAppointmentReminderText } from '../templates/appointment-reminder.template';
import { cleanDeletedName } from '../utils/sanitize';
import { logger } from '../utils/logger';

export async function runRemindersJob() {
  logger.info('⏰ Running 48h appointment reminders job (WhatsApp & Email)...');

  try {
    const controlDb = getControlPool();
    
    // Obtener todos los tenants
    const [users] = await controlDb.query<RowDataPacket[]>('SELECT id, tenant_db_name, name FROM users WHERE tenant_db_name IS NOT NULL AND tenant_db_name != ""');

    for (const user of users) {
      const tenantDbName = user.tenant_db_name;

      try {
        // Buscamos citas en los próximos 3 días
        const t = q(tenantDbName);
        const [appointmentsToRemind] = await controlDb.query<RowDataPacket[]>(`
          SELECT 
            a.id AS appointment_id,
            a.service_name,
            a.start_at,
            c.id AS customer_id,
            c.first_name,
            c.last_name,
            c.email AS customer_email,
            c.phone AS customer_phone,
            s.name AS service_name,
            CONCAT(COALESCE(st.first_name,''), ' ', COALESCE(st.last_name,'')) AS specialist_name,
            bs.address AS business_address
          FROM ${t}.appointments a
          JOIN ${t}.customers c ON a.customer_id = c.id
          LEFT JOIN ${t}.appointment_services aps ON a.id = aps.appointment_id
          LEFT JOIN ${t}.services s ON aps.service_id = s.id
          LEFT JOIN ${t}.staff st ON aps.staff_id = st.id
          LEFT JOIN ${t}.business_settings bs ON bs.id = 1
          WHERE a.status = 'scheduled'
            AND a.start_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 2 DAY)
        `);

        // Obtener nombre del negocio
        const [userRows] = await controlDb.query<RowDataPacket[]>(
          'SELECT business_name, name FROM users WHERE tenant_db_name = ? LIMIT 1', [tenantDbName]
        );
        const bizName = userRows[0]?.business_name || userRows[0]?.name || 'AgendaPro Business';

        for (const apt of appointmentsToRemind) {
          const customerName = `${apt.first_name} ${apt.last_name}`.trim();
          const startDate = new Date(apt.start_at);
          const startTimeStr = startDate.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
          const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${env.port}`;
          const emailConfirmLink = `${apiBaseUrl}/api/public/appointments/${apt.appointment_id}/confirm`;

          const dateFormatted = startDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
          const timeFormatted = startDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

          const serviceName = cleanDeletedName(apt.service_name || 'Servicio Profesional');

          const templateParams = {
            customerName,
            appointmentTitle: serviceName,
            dateTimeStr: startTimeStr,
            confirmLink: emailConfirmLink,
            businessName: bizName,
            serviceName,
            specialistName: (apt.specialist_name || '').trim() || 'Especialista asignado',
            dateFormatted,
            timeFormatted,
            businessAddress: apt.business_address || 'Dirección por confirmar'
          };

          // --- 1. RECORDATORIO POR EMAIL ---
          if (apt.customer_email && process.env.SMTP_USER && process.env.SMTP_PASS) {
            const hasEmailLog = await notificationExists(controlDb, tenantDbName, apt.appointment_id, 'email');
            if (!hasEmailLog) {
              try {
                const subject = `Recordatorio de tu cita: ${serviceName}`;
                const textBody = buildAppointmentReminderText(templateParams);
                const htmlBody = buildAppointmentReminderHtml(templateParams);
                await sendMail(apt.customer_email, subject, textBody, htmlBody);
                await logNotification(controlDb, tenantDbName, apt.customer_id, apt.appointment_id, 'email', subject, textBody, 'sent');
              } catch (e) { 
                logger.error({ err: e, tenant: tenantDbName, appointmentId: apt.appointment_id }, 'Email reminder failed');
              }
            }
          }

          // --- 2. RECORDATORIO POR WHATSAPP (Meta API) ---
          if (apt.customer_phone) {
            const hasWALog = await notificationExists(controlDb, tenantDbName, apt.appointment_id, 'whatsapp');
            if (!hasWALog) {
              try {
                // Limpiar número (solo dígitos)
                let cleanPhone = apt.customer_phone.replace(/\D/g, '');
                // Si no empieza con 52 y tiene 10 dígitos, agregamos 52 (México)
                if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
                
                await WhatsAppService.sendAppointmentReminder(
                  cleanPhone,
                  customerName,
                  dateFormatted,
                  timeFormatted
                );

                await logNotification(controlDb, tenantDbName, apt.customer_id, apt.appointment_id, 'whatsapp', 'Recordatorio WA Meta', 'Template: appointment_reminder', 'sent');
                logger.info({ tenant: tenantDbName, customer: customerName }, 'WhatsApp reminder sent');
              } catch (e: unknown) { 
                const errMsg = e instanceof Error ? e.message : String(e);
                logger.error({ err: e, tenant: tenantDbName, customer: customerName }, 'WhatsApp reminder failed');
                await logNotification(controlDb, tenantDbName, apt.customer_id, apt.appointment_id, 'whatsapp', 'Recordatorio WA Meta', errMsg, 'failed');
              }
            }
          }
        }
      } catch (tenantErr) {
        logger.error({ err: tenantErr, tenant: tenantDbName }, 'Error processing tenant in reminders job');
      }
    }
    logger.info('✅ Reminders job finished.');
  } catch (error) {
    logger.error(error, '❌ Reminders job failed critically');
  }
}


async function notificationExists(db: Pool, tenant: string, aptId: string, channel: string): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT 1 FROM ${q(tenant)}.notifications_log WHERE appointment_id = ? AND channel = ? AND status = 'sent' LIMIT 1`,
    [aptId, channel]
  );
  return rows.length > 0;
}

async function logNotification(db: Pool, tenant: string, custId: string, aptId: string, channel: string, subject: string, body: string, status: string) {
  await db.query(
    `INSERT INTO ${q(tenant)}.notifications_log (customer_id, appointment_id, channel, subject, body, status, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [custId, aptId, channel, subject, body, status]
  );
}
