import cron from 'node-cron';
import { getControlPool } from '../data/db';
import { logger } from '../utils/logger';
import { WhatsAppService } from '../services/whatsapp.service';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { RowDataPacket } from 'mysql2/promise';

interface BackgroundJob {
  id: string;
  user_id: string;
  job_type: string;
  payload: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
}

export function initBackgroundWorker() {
  logger.info('Iniciando Background Worker (Poll 1m)');

  // Correr cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      await processPendingJobs();
    } catch (error) {
      logger.error({ err: error }, '[BackgroundWorker] Error fatal procesando trabajos');
    }
  });
}

async function processPendingJobs() {
  const db = getControlPool();
  
  // Buscar trabajos pendientes o fallidos (con reintentos disponibles)
  const [jobs] = await db.query<RowDataPacket[]>(
    `SELECT * FROM background_jobs 
     WHERE status IN ('pending', 'failed') AND attempts < 3 
     ORDER BY run_at ASC 
     LIMIT 50`
  );

  if (jobs.length === 0) return;

  for (const row of jobs) {
    const job = row as unknown as BackgroundJob;
    // Marcar como procesando
    await db.query(`UPDATE background_jobs SET status = 'processing' WHERE id = ?`, [job.id]);

    try {
      if (job.job_type === 'whatsapp_confirmation') {
        const p = job.payload;
        await WhatsAppService.sendAppointmentConfirmation(
          p.to,
          p.customerName,
          p.serviceName,
          p.date,
          p.time
        );
      } else if (job.job_type === 'google_calendar_sync') {
        const p = job.payload;
        await GoogleCalendarService.pushEvent(job.user_id, p.appointment, p.action);
      }

      // Marcar exitoso
      await db.query(`UPDATE background_jobs SET status = 'completed', updated_at = NOW() WHERE id = ?`, [job.id]);
    } catch (error: any) {
      // Registrar fallo y reintentos
      const errorMsg = error instanceof Error ? error.message : String(error);
      const nextRun = new Date();
      nextRun.setMinutes(nextRun.getMinutes() + 5 * (job.attempts + 1)); // Backoff: 5m, 10m...

      await db.query(
        `UPDATE background_jobs SET status = 'failed', attempts = attempts + 1, error_log = ?, run_at = ?, updated_at = NOW() WHERE id = ?`,
        [errorMsg, nextRun, job.id]
      );
    }
  }
}
