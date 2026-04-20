import cors from 'cors';
import express from 'express';
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
import { globalErrorHandler } from './middleware/error.middleware';
import cron from 'node-cron';
import { runRemindersJob } from './jobs/appointmentReminders';

const app = express();

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
  })
);
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: 'AgendaPro backend running.' });
});

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

app.use(globalErrorHandler);

async function bootstrap(): Promise<void> {
  try {
    await initializeStore();
    
    // Start cron jobs
    cron.schedule('0 * * * *', runRemindersJob); // Runs at minute 0 past every hour
    
    // To make sure it works straight away or test it without waiting an hour
    if (process.env.NODE_ENV !== 'production') {
      setTimeout(() => {
        runRemindersJob().catch(console.error);
      }, 5000); // 5 seconds after boot up
    }

    app.listen(env.port, '0.0.0.0', () => {
      console.log(`AgendaPro backend listening on http://0.0.0.0:${env.port}`);
      console.log(`Local network access: http://192.168.0.14:${env.port}`);
    });
  } catch (error) {
    console.error('No se pudo inicializar la base de datos MySQL.');
    console.error(error);
    process.exit(1);
  }
}

void bootstrap();
