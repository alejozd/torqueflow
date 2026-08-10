# Design note: tenant resolution splits across Edge and Node runtimes

Date: 2026-08-09
Related: docs/design/2026-08-02-taller-saas-multitenant-design.md §4, §4.1

## Why this exists

Next.js Middleware (`src/middleware.ts`) always runs in the Edge runtime.
Prisma's query engine needs Node APIs to open a raw Postgres connection,
which the Edge runtime does not provide. Resolving a tenant fully — subdomain
parsing *and* the `public.Tenant` database lookup — cannot happen inside
`middleware.ts`.

## The split

1. **Edge (`src/middleware.ts`)**: pure Host-header parsing only, via
   `extractTenantSlug` (`src/lib/tenant/subdomain.ts` — no I/O, no Node APIs).
   Tags the request with an `x-tenant-slug` header (constant:
   `TENANT_SLUG_HEADER` in `src/lib/tenant/constants.ts`). Never imports
   Prisma or anything that transitively does.
2. **Node (`resolveTenant()` in `src/lib/tenant/resolve-tenant.ts`)**: called
   from Server Components, Server Actions, and NextAuth's `authorize()` —
   all Node runtime by default in this project. Reads the `x-tenant-slug`
   header via `next/headers` and queries `publicDb.tenant.findUnique(...)`.

## Consequence for future contributors

Do not "simplify" this by moving the `Tenant` lookup into `middleware.ts`,
and do not add `export const runtime = "edge"` to any route/layout that
calls `resolveTenant()` — either change breaks the split above and Prisma
will fail to connect at runtime.
