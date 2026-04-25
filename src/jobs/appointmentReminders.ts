import { RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../data/db';
import { sendMail } from '../utils/mailer';
import { WhatsAppService } from '../utils/whatsapp';

export async function runRemindersJob() {
  console.log('⏰ Running 48h appointment reminders job (WhatsApp & Email)...');

  try {
    const controlDb = getControlPool();
    const whatsapp = WhatsAppService.getInstance();
    
    // Obtener todos los tenants
    const [users] = await controlDb.query<RowDataPacket[]>('SELECT id, tenant_db_name, name FROM users WHERE tenant_db_name IS NOT NULL AND tenant_db_name != ""');

    for (const user of users) {
      const tenantDbName = user.tenant_db_name;

      try {
        // Buscamos citas 48h vista (entre 47 y 49 horas adelante)
        const [appointmentsToRemind] = await controlDb.query<RowDataPacket[]>(`
          SELECT 
            a.id AS appointment_id,
            a.title,
            a.start_at,
            c.id AS customer_id,
            c.first_name,
            c.last_name,
            c.email AS customer_email,
            c.phone AS customer_phone
          FROM \`${tenantDbName}\`.appointments a
          JOIN \`${tenantDbName}\`.customers c ON a.customer_id = c.id
          WHERE a.status = 'scheduled'
            AND a.start_at BETWEEN DATE_ADD(NOW(), INTERVAL 47 HOUR) AND DATE_ADD(NOW(), INTERVAL 49 HOUR)
        `);

        for (const apt of appointmentsToRemind) {
          const customerName = `${apt.first_name} ${apt.last_name}`.trim();
          const startTimeStr = new Date(apt.start_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
          const confirmLink = `${process.env.APP_URL || 'http://localhost:4200'}/confirmar-cita/${apt.appointment_id}`;

          // --- 1. RECORDATORIO POR EMAIL ---
          if (apt.customer_email && process.env.SMTP_USER !== 'tu_correo@gmail.com') {
            const hasEmailLog = await notificationExists(controlDb, tenantDbName, apt.appointment_id, 'email');
            if (!hasEmailLog) {
              try {
                const subject = `Recordatorio de tu cita: ${apt.title}`;
                const textBody = `Hola ${customerName}, te recordamos tu cita para el ${startTimeStr}. Confirma aquí: ${confirmLink}`;
                await sendMail(apt.customer_email, subject, textBody);
                await logNotification(controlDb, tenantDbName, apt.customer_id, apt.appointment_id, 'email', subject, textBody, 'sent');
              } catch (e) { console.error('Email failed (Check SMTP credentials in .env)', (e as any).message); }
            }
          }

          // --- 2. RECORDATORIO POR WHATSAPP ---
          if (apt.customer_phone) {
            const hasWALog = await notificationExists(controlDb, tenantDbName, apt.appointment_id, 'whatsapp');
            if (!hasWALog) {
              try {
                const waBody = `Hola ${customerName}, recordatorio de tu cita ("${apt.title}") para el ${startTimeStr}. ¿Nos acompañas? Confirma tu asistencia aquí: ${confirmLink}`;
                console.log(`🔗 [TEST LINK] WhatsApp for ${customerName}: ${confirmLink}`);
                const sent = await whatsapp.sendReminder(apt.customer_phone, waBody);
                await logNotification(controlDb, tenantDbName, apt.customer_id, apt.appointment_id, 'whatsapp', 'Recordatorio WA', waBody, sent ? 'sent' : 'failed');
              } catch (e) { console.error('WhatsApp failed', e); }
            }
          }
        }
      } catch (tenantErr) {
        console.error(`Error processing tenant ${tenantDbName}:`, tenantErr);
      }
    }
    console.log('✅ Reminders job finished.');
  } catch (error) {
    console.error('❌ Reminders job error:', error);
  }
}

async function notificationExists(db: any, tenant: string, aptId: string, channel: string): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT 1 FROM \`${tenant}\`.notifications_log WHERE appointment_id = ? AND channel = ? AND status = 'sent' LIMIT 1`,
    [aptId, channel]
  );
  return (rows as any[]).length > 0;
}

async function logNotification(db: any, tenant: string, custId: string, aptId: string, channel: string, subject: string, body: string, status: string) {
  await db.query(
    `INSERT INTO \`${tenant}\`.notifications_log (id, customer_id, appointment_id, channel, subject, body, status, sent_at)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`,
    [custId, aptId, channel, subject, body, status]
  );
}
export async function printTestConfirmationLinks() {
  console.log('🧪 Generating test confirmation links for recently scheduled appointments...');
  try {
    const controlDb = getControlPool();
    const [users] = await controlDb.query<RowDataPacket[]>('SELECT tenant_db_name FROM users WHERE tenant_db_name IS NOT NULL AND tenant_db_name != ""');

    for (const user of users) {
      const [apts] = await controlDb.query<RowDataPacket[]>(`
        SELECT a.id, a.title, c.first_name, c.last_name 
        FROM \`${user.tenant_db_name}\`.appointments a
        JOIN \`${user.tenant_db_name}\`.customers c ON a.customer_id = c.id
        WHERE a.status = 'scheduled'
        ORDER BY a.start_at ASC
        LIMIT 3
      `);

      for (const apt of apts) {
        const confirmLink = `${process.env.APP_URL || 'http://localhost:4200'}/confirmar-cita/${apt.id}`;
        console.log(`👉 [${user.tenant_db_name}] ${apt.first_name} - ${apt.title}: ${confirmLink}`);
      }
    }
  } catch (e) {
    console.error('Error generating test links:', e);
  }
}
