import { Umzug } from 'umzug';
import mysql from 'mysql2/promise';
import { env } from '../config/env';
import { getControlPool } from './db';
import * as path from 'path';
import * as fs from 'fs';

// Esta interfaz es requerida internamente por umzug para inyectar su contexto en cada iteración
export interface MigrationContext {
  connection: mysql.Pool;
}

// Interfaz para la configuración por base de datos
function buildUmzug(pool: mysql.Pool, dbName: string, migrationsPath: string) {
  // Asegurarse de que el DB esté creado, si es tenant (controlDb se asegura en schema.ts)
  // Nota: Dejamos la creación de la DB a schema.ts para separar responsabilidades.

  return new Umzug({
    migrations: {
      glob: [migrationsPath, { cwd: __dirname }],
      resolve: ({ name, path: migrationPath, context }) => {
        // Soporte tanto para .js precompilado como TypeScript en desarrollo
        const migration = require(migrationPath!);
        return {
          name,
          up: async () => migration.up({ context }),
          down: async () => migration.down?.({ context }),
        };
      },
    },
    context: { connection: pool },
    storage: {
      async executed({ context }) {
        await context.connection.query(`
          CREATE TABLE IF NOT EXISTS ${mysql.escapeId(dbName)}.umzug_meta (
            name VARCHAR(255) PRIMARY KEY
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        const [results] = await context.connection.query<any[]>(
          `SELECT name FROM ${mysql.escapeId(dbName)}.umzug_meta`
        );
        return results.map(r => r.name);
      },
      async logMigration({ name, context }) {
        await context.connection.query(
          `INSERT INTO ${mysql.escapeId(dbName)}.umzug_meta (name) VALUES (?)`,
          [name]
        );
      },
      async unlogMigration({ name, context }) {
        await context.connection.query(
          `DELETE FROM ${mysql.escapeId(dbName)}.umzug_meta WHERE name = ?`,
          [name]
        );
      },
    },
    logger: console,
  });
}

/**
 * Devuelve la instancia capaz de migrar la BD de control.
 */
export function getControlMigrator(): Umzug<MigrationContext> {
  const pool = getControlPool();
  return buildUmzug(pool, env.mysqlDatabase, 'migrations/control/*.{ts,js}');
}

/**
 * Devuelve un migrador instanciado y conectado on-the-fly para una DB de Tenant específica.
 * Utiliza un conector dedicado independiente.
 * IMPORTANTE: El caller debe cerrar el pool devuelto después de completar las migraciones.
 */
export function getTenantMigrator(tenantDbName: string): { migrator: Umzug<MigrationContext>; pool: mysql.Pool } {
  // Utilizamos la misma arquitectura que usamos explícitamente en createTenantPool,
  // con un pool transitorio para las migraciones de este tenant.
  const pool = mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: tenantDbName, // A diferencia del control, forzamos conexión al tenant si ya existe
    waitForConnections: true,
    connectionLimit: 1, // Sólo requerimos 1 conexión para migrar
    queueLimit: 0,
  });

  return { migrator: buildUmzug(pool, tenantDbName, 'migrations/tenant/*.{ts,js}'), pool };
}
