import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { authRouter } from './routes/auth.routes';
import { catalogRouter } from './routes/catalog.routes';
import { healthRouter } from './routes/health.routes';
import { usersRouter } from './routes/users.routes';

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

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Error && err.message.startsWith('CORS blocked')) {
    res.status(403).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(env.port, () => {
  console.log(`AgendaPro backend listening on http://localhost:${env.port}`);
});
