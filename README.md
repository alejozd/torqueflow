# TorqueFlow

Plataforma SaaS multi-tenant para gestión de talleres/servitecas.

- Documento de diseño: [`docs/design/2026-08-02-taller-saas-multitenant-design.md`](docs/design/2026-08-02-taller-saas-multitenant-design.md)
- Plan de implementación: [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Stack

Next.js (App Router) + Prisma + PostgreSQL, TypeScript.

## Desarrollo

Requiere Node.js >= 20.6. No se instala Postgres localmente: todos los comandos de Prisma se conectan al servidor Postgres remoto por LAN (ver `.env.example` una vez exista).

```bash
npm install
npm run dev
```
