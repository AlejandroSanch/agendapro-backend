# AgendaPro Backend

Backend de AgendaPro con Node + Express + TypeScript, ahora usando MySQL para persistencia.

## 1) Configuracion

1. Copia `.env.example` a `.env`.
2. Configura `JWT_SECRET`.
3. Configura credenciales de MySQL (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`).

## 2) Ejecutar

```bash
npm install
npm run dev
```

Servidor por defecto: `http://localhost:4000`.

## 3) Endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me` (Bearer)
- `GET /api/catalog/plans`
- `GET /api/catalog/modules`
- `GET /api/catalog/active-modules` (Bearer)
- `GET /api/users/me` (Bearer)
- `GET /api/users/me/module-overrides` (Bearer)
- `PUT /api/users/me/module-overrides/:moduleId` (Bearer)
- `DELETE /api/users/me/module-overrides/:moduleId` (Bearer)
- `PATCH /api/users/me/plan` (Bearer)
- `GET /api/appointments` (Bearer)
- `POST /api/appointments` (Bearer)
- `PATCH /api/appointments/:id` (Bearer)

## 4) Login demo

- `email`: `demo@agendapro.com`
- `password`: `demo123`

## 5) Modelo MySQL (una base por usuario)

- DB de control: `MYSQL_DATABASE` (usuarios y metadata de tenant)
- DB tenant por usuario: `${MYSQL_TENANT_DB_PREFIX}<user_id_sanitizado>`

En cada DB tenant se crean:

- `module_overrides`
- `customers`
- `services`
- `staff`
- `appointments`

La API sigue igual, pero el backend enruta cada request al tenant DB del usuario autenticado.

## 6) Migrar datos SQLite -> MySQL

Si ya tenias datos en SQLite (`storage/control.db` y `storage/tenants/*.db`):

```bash
npm run db:migrate:sqlite
```

Este comando migra:

- usuarios
- overrides de modulos
- clientes
- servicios
- personal
- citas

Variables usadas para origen SQLite:

- `SQLITE_CONTROL_DB_PATH` (default: `storage/control.db`)
- `SQLITE_TENANTS_DB_DIR` (default: `storage/tenants`)

## 7) Inspeccionar datos en consola

```bash
npm run db:inspect
```

Opciones:

- `npm run db:inspect -- --user usr_demo_001`
- `npm run db:inspect -- --email demo@agendapro.com --details`
