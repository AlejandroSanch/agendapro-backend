import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function parsePort(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBool(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue === undefined) return fallback;
  const value = rawValue.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

export const env = {
  port: parsePort(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-this',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-this',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4200,http://localhost:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  frontendBaseUrl: (process.env.FRONTEND_BASE_URL || 'http://localhost:4200').trim(),
  mysqlHost: (process.env.MYSQL_HOST || '127.0.0.1').trim(),
  mysqlPort: parsePort(process.env.MYSQL_PORT, 3306),
  mysqlUser: (process.env.MYSQL_USER || 'root').trim(),
  mysqlPassword: process.env.MYSQL_PASSWORD || '',
  mysqlDatabase: (process.env.MYSQL_DATABASE || 'agendapro').trim(),
  mysqlTenantDbPrefix: (process.env.MYSQL_TENANT_DB_PREFIX || 'agendapro_tenant_').trim(),
  mysqlConnectionLimit: parsePort(process.env.MYSQL_CONNECTION_LIMIT, 10),
  mysqlAutoMigrateFromSqlite: parseBool(process.env.MYSQL_AUTO_MIGRATE_FROM_SQLITE, true),

  sqliteControlDbPath: (process.env.SQLITE_CONTROL_DB_PATH || 'storage/control.db').trim(),
  sqliteTenantsDbDir: (process.env.SQLITE_TENANTS_DB_DIR || 'storage/tenants').trim(),
  smtpHost: process.env.SMTP_HOST || 'smtp.ethereal.email',
  smtpPort: parsePort(process.env.SMTP_PORT, 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFromEmail: process.env.SMTP_FROM_EMAIL || 'no-reply@agendapro.com',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/integrations/google/callback',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '1037327522806922',
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || 'EAAUrjIoX3BABRTFsdLJjE6OXBkSpetOLcymP6rfjlveoZCnXlStzLcHbZBuiSHiZALjkdOxZBTjpjoUSelIPk51w07c0FI8cCqZCFZAASetYxT0eC1e9nQTYUpldnmXK2cZB9AWj8EA9GneQZAjr0dZBylXMCIhzGYbZCs59QLJWaHIMpF9KEBzWpZAvz8XAuzLCR3zcSwU7uQ5Sq4YRpLGYquOQZCUP6wzTTqYhWJwjST3vQSbrYsjKEqs3suUhnH7VT4ZAS02veWtho1tctLRijtpne',
  isProduction: process.env.NODE_ENV === 'production',
};

// Validaciones críticas de seguridad al arrancar
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error(
      '❌ FATAL: JWT_SECRET no está configurado. No se puede iniciar en producción sin un secret seguro.',
    );
    process.exit(1);
  }
}
