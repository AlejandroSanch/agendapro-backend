import dotenv from 'dotenv';

dotenv.config();

function parsePort(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const env = {
  port: parsePort(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-this',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4200,http://localhost:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
