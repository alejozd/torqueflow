# TorqueFlow

Plataforma SaaS multi-tenant para gestión de talleres/servitecas.

- Documento de diseño: [`docs/design/2026-08-02-taller-saas-multitenant-design.md`](docs/design/2026-08-02-taller-saas-multitenant-design.md)
- Plan de implementación: [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Stack

Next.js (App Router) + Prisma + PostgreSQL, TypeScript.

## Desarrollo

Requiere Node.js >= 20.6 y un servidor PostgreSQL accesible (por defecto el
servidor remoto por LAN; cualquier Postgres 16 sirve para desarrollo y tests).

```bash
npm install
cp .env.example .env   # completar DATABASE_URL, TENANT_DATABASE_*, AUTH_SECRET, etc.

# Clientes de Prisma (src/generated/ no se versiona): hay que generar ambos.
npx prisma generate --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/tenant/schema.prisma

# Schema público (tabla tenants, planes, super-admin…)
npx prisma migrate deploy --schema=prisma/schema.prisma

npm run dev
```

Los schemas de cada tenant se crean y migran con `npm run tenant:provision`.

## Verificaciones

```bash
npx next typegen     # tipos de rutas (LayoutProps, PageProps…) que necesita tsc
npx tsc --noEmit
npm run lint
npm test             # vitest
npm run build
```

Varios tests de `scripts/` y de `src/lib/db` son de integración: crean y
borran schemas reales en el Postgres de `DATABASE_URL`, así que la base debe
estar arriba y con el schema público migrado. Úsalos contra una base de
desarrollo, nunca contra producción.

Despliegue y actualización en producción: [`docs/DEPLOY.md`](docs/DEPLOY.md).
