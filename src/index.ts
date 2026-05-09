import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import 'dotenv/config';
import { env } from './config/env';
import { initializeStore } from './data/schema';
import { appointmentsRouter } from './routes/appointments.routes';
import { authRouter } from './routes/auth.routes';
import { catalogRouter } from './routes/catalog.routes';
import { healthRouter } from './routes/health.routes';
import { servicesRouter } from './routes/services.routes';
import { usersRouter } from './routes/users.routes';
import { onboardingRouter } from './routes/onboarding.routes';
import { customersRouter } from './routes/customers.routes';
import { staffRouter } from './routes/staff.routes';
import { publicRouter } from './routes/public.routes';
import { categoriesRouter } from './routes/categories.routes';
import { productsRouter } from './routes/products.routes';
import { salesRouter } from './routes/sales.routes';
import { inventoryRouter } from './routes/inventory.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { integrationsRouter } from './routes/integrations.routes';
import { reportsRouter } from './routes/reports.routes';
import { globalErrorHandler } from './middleware/error.middleware';
import cron from 'node-cron';
import { runRemindersJob } from './jobs/appointmentReminders';
import { globalLimiter } from './middleware/rate-limit';

import { logger } from './utils/logger';

const app = express();

// Seguridad de Cabeceras HTTP
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({ message: 'AgendaPro backend running v2.' });
});

// Limite global para evadir saturación/DDoS
app.use('/api/', globalLimiter);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/users', usersRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/customers', customersRouter);
app.use('/api/staff', staffRouter);
app.use('/api/public', publicRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/reports', reportsRouter);

app.use(globalErrorHandler);

async function bootstrap(): Promise<void> {
  try {
    await initializeStore();

    // Start cron jobs
    cron.schedule('0 * * * *', runRemindersJob); // Runs at minute 0 past every hour

    const server = app.listen(env.port, '0.0.0.0', () => {
      logger.info(`AgendaPro backend listening on all interfaces at port ${env.port}`);
      logger.info(`- Local: http://localhost:${env.port}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down gracefully...');
      server.close(async () => {
        try {
          const { getControlPool } = require('./data/db');
          const pool = getControlPool();
          await pool.end();
          logger.info('MySQL pool closed.');
        } catch {
          /* pool may not be initialized */
        }
        process.exit(0);
      });

      // Force exit after 10s if graceful shutdown fails
      setTimeout(() => {
        logger.error('Forced shutdown after timeout.');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.fatal(error, 'No se pudo inicializar la aplicación (Base de Datos).');
    process.exit(1);
  }
}

void bootstrap();
