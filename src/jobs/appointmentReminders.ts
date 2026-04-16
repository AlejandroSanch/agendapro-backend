import { RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../data/db';
import { sendMail } from '../utils/mailer';

export async function runRemindersJob() {
  console.log('⏰ Running 24h appointment reminders job...');

  try {
    const controlDb = getControlPool();
    // Obtener todos los tenants que tienen configurada su base de datos
    const [users] = await controlDb.query<RowDataPacket[]>('SELECT id, tenant_db_name, name, email FROM users WHERE tenant_db_name IS NOT NULL AND tenant_db_name != ""');

    for (const user of users) {
      const tenantDbName = user.tenant_db_name;
      const tenantId = user.id;

      try {

        // Buscar citas que:
        // - Su estado es 'scheduled'
        // - Comienzan exactamente dentro del rango de ~23 a 24.5 horas a partir de ahora, o quizás de 23.5 a 24.5.
        //   Lo mejor es usar un intervalo estricto para evitar mandar el mismo repetidamente.
        //   Aunque, la tabla 'notifications_log' nos ayudará a no enviar duplicados.
        // - Vamos a ser proactivos y buscar citas entre AHORA y 24.5 horas que no tengan recordatorio de correo electrónico para ese ID.
        // - Espera, la idea es enviarlo sólo "24h antes", no para cosas de hace 1 hora (quizás las acaban de reagendar).
        // Así que el rango será de [23 horas adelante, a 25 horas adelante]. Luego verificamos notifications_log.
        
        const [appointmentsToRemind] = await controlDb.query<RowDataPacket[]>(`
          SELECT 
            a.id AS appointment_id,
            a.title,
            a.start_at,
            c.id AS customer_id,
            c.first_name,
            c.last_name,
            c.email AS customer_email
          FROM \`${tenantDbName}\`.appointments a
          JOIN \`${tenantDbName}\`.customers c ON a.customer_id = c.id
          WHERE a.status = 'scheduled'
            AND a.start_at BETWEEN DATE_ADD(NOW(), INTERVAL 23 HOUR) AND DATE_ADD(NOW(), INTERVAL 25 HOUR)
            AND c.email IS NOT NULL
            AND c.email != ''
            AND NOT EXISTS (
              SELECT 1 FROM \`${tenantDbName}\`.notifications_log nl
              WHERE nl.appointment_id = a.id
                AND nl.channel = 'email'
                AND nl.subject LIKE '%Recordatorio%'
                AND nl.status = 'sent'
            )
        `);

        if (appointmentsToRemind.length > 0) {
          console.log(`📦 Encotrados ${appointmentsToRemind.length} recordatorios para el tenant ${tenantDbName}`);
        }

        for (const apt of appointmentsToRemind) {
          try {
            const customerName = `${apt.first_name} ${apt.last_name}`.trim();
            // Formatear fecha y hora para lectura amigable
            const startTimeStr = new Date(apt.start_at).toLocaleString('es-ES', {
              dateStyle: 'short',
              timeStyle: 'short',
            });

            const subject = `Recordatorio de tu cita mañana: ${apt.title}`;
            const textBody = `Hola ${customerName}, te recordamos que tienes una cita ("${apt.title}") pautada para el ${startTimeStr}. Te esperamos!`;

            await sendMail(apt.customer_email, subject, textBody);

            // Registrar el envío en la base de datos del tenant
            await controlDb.query(
              `INSERT INTO \`${tenantDbName}\`.notifications_log
                 (id, customer_id, appointment_id, channel, subject, body, status, sent_at)
               VALUES (UUID(), ?, ?, 'email', ?, ?, 'sent', NOW())`,
              [apt.customer_id, apt.appointment_id, subject, textBody]
            );

          } catch (emailErr) {
            console.error(`Failed to process reminder for apt ${apt.appointment_id}: `, emailErr);
            // Si el correo falló, quizás también quieras registrarlo pero con estatus 'failed'
            await controlDb.query(
               `INSERT INTO \`${tenantDbName}\`.notifications_log
                 (id, customer_id, appointment_id, channel, subject, body, status, sent_at)
               VALUES (UUID(), ?, ?, 'email', ?, ?, 'failed', NOW())`,
              [apt.customer_id, apt.appointment_id, 'Fallo de Recordatorio', 'Ocurrio un error al intentar enviar.', 'failed']
            ).catch(err => console.error("Error inserting failed log", err));
          }
        }

      } catch (tenantErr) {
        console.error(`Failed to process reminders for tenant ${tenantDbName}:`, tenantErr);
      }
    }
    
    console.log('✅ Reminders job finished.');
  } catch (error) {
    console.error('❌ Error executing reminders job:', error);
  }
}
