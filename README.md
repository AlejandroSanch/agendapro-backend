# AgendaPro Backend (Starter)

Backend inicial con Node + Express + TypeScript para arrancar API de AgendaPro.

## 1) Configuracion

1. Copia `.env.example` a `.env`.
2. Ajusta `JWT_SECRET`.

## 2) Ejecutar en desarrollo

```bash
npm install
npm run dev
```

Servidor por defecto: `http://localhost:4000`.

## 3) Endpoints base

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)
- `GET /api/catalog/plans`
- `GET /api/catalog/modules`
- `GET /api/catalog/active-modules` (Bearer token)
- `GET /api/users/me/module-overrides` (Bearer token)
- `PUT /api/users/me/module-overrides/:moduleId` (Bearer token)
- `DELETE /api/users/me/module-overrides/:moduleId` (Bearer token)

## 4) Login demo

Usuario demo precargado:

- `email`: `demo@agendapro.com`
- `password`: `demo123`

Tambien se auto-crea usuario demo para cualquier correo/password en esta etapa inicial.
