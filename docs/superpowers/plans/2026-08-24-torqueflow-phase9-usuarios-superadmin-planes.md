# Fase 9 — Usuarios/Roles + Panel de Super-Admin + Planes de Suscripción — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-scoped user CRUD with role management (módulo 10), a second, fully separate super-admin authentication realm to manage tenants and their subscription state (módulo 11), and a `Plan` model in the `public` schema whose `maxUsuarios`/`maxSedes` limits are enforced server-side (§9) — the mechanism the design doc's §9/§10 open pricing/limit decisions plug into once real numbers exist.

**Architecture:** Three layers, built bottom-up. (1) `public` schema gains `Plan` (nombre/precio-placeholder/maxUsuarios/maxSedes) and `Tenant` gains `planId` (required FK, every existing tenant backfilled to "Avanzado" so nothing already deployed gets newly restricted) and `estado` (ACTIVO/SUSPENDIDO). (2) A tiny cross-schema helper (`src/lib/planes/limites.ts`) is the only place that reads a tenant's plan limits from `publicDb`; `createSedeAction` (Fase 6) and the new `createUsuarioAction` each call it once before writing. (3) The super-admin panel is a **second, independent NextAuth instance** (`src/lib/super-admin/auth.ts`) — its own `SuperAdmin` model, its own cookie name, its own `basePath`, its own login page and guard function — deliberately not reusing `auth.ts`/`guards.ts`/the `next-auth.d.ts` module augmentation, because that augmentation is global and describes the tenant session's shape (role/tenantSchema/sedeActivaId, all required); a super-admin session genuinely has none of those fields, and a shared type would silently lie about it exactly the way Fase 6's `sedeActivaId` type-honesty finding warned against.

**Tech Stack:** Next.js 16.3.0 (App Router, Server Actions), React 19.2.8, Prisma 6.19.3 (exact pin, both `public` and `tenant` schemas), NextAuth 5.0.0-beta.32 (two independent instances), bcryptjs ^3.0.3, Zod 4.4.3, Vitest 4, Playwright 1.62. No new dependency.

## Global Constraints

- **Binding decisions (do not re-derive, do not ask the user again):**
  - Email stays SMTP-only (Fase 7/8 infra) — this phase adds no notification surface at all.
  - Multi-sede is already fully built (Fase 6) — this phase only adds the numeric *ceiling* (`maxSedes`) on top of it, no new sede UI.
  - **Plan enforcement in this phase covers ONLY the numeric limits `maxUsuarios`/`maxSedes`.** The design doc's §9 boolean feature flags (`hasDVI`, `hasAgendamiento`, `hasRecordatorios`, `hasWhatsapp`) are explicitly **not** modeled or enforced here — DVI/Agendamiento/Recordatorios stay available to every tenant regardless of plan, exactly as they are today. Do not add `hasDVI`-style columns to `Plan`: an unused, unenforced column is worse than no column.
  - `Plan.precio` is a placeholder (`Decimal?`, nullable, seeded `NULL`) — the design doc's own §10 leaves real pricing undefined; this phase builds the mechanism, not the number. Editable later from the super-admin panel with no new migration.
  - `maxUsuarios`/`maxSedes` values are the design doc §9 suggested defaults, locked in: Básico 3/1, Estándar 10/1, Avanzado NULL/NULL (`NULL` = sin límite práctico, not a sentinel like `-1` or `999999`).
  - **Tenant creation stays CLI-only** (`npm run tenant:provision`, built in Fase 1) — the super-admin *web* panel manages `estado` (activar/suspender) and `planId` for existing tenants, not tenant provisioning itself. Provisioning a schema is a heavy, migration-running operation; keeping it off an HTTP request path is a deliberate, documented scope trim, not an oversight.
  - **Super-admin auth is a dedicated `SuperAdmin` model + a second, independent NextAuth instance**, not a flag on a tenant `Usuario` and not env-var-only credentials — this was the explicit, recommended choice the user confirmed before this plan was written.
  - Prisma pinned exact `6.19.3` (project-wide, unchanged). IVA stays fixed at 19% (unrelated to this phase, unchanged).
- **Guard chokepoint:** every tenant-scoped action still calls `requireRole`/`requireSession` first, unconditionally, never inside a `try`. Every super-admin action calls `requireSuperAdmin()` first, unconditionally — a **different** function, from a **different** module (`src/lib/super-admin/guards.ts`), never `requireRole`/`requireSession` from `src/lib/auth/guards.ts`.
- **Sede isolation:** unaffected. Nothing in this phase touches `scopeOrden`/`scopeBodega`/etc.
- **Prisma naming:** camelCase fields, snake_case columns via `@map`, `@@map("tabla_en_plural")`, `cuid()` ids, hand-written migration SQL (no local Postgres — `prisma migrate deploy` runs against the remote dev schema).
- **User-facing copy is Spanish.**
- **"Structurally sensitive ⇒ ADMIN-only" convention (established Fase 5/6/7/8, reapplied here):** all of módulo 10's user CRUD is `requireRole(["ADMIN"])`, matching Sede CRUD's existing precedent — never `["ADMIN","RECEPCION"]`.
- **Last-ADMIN guard (new business rule this phase):** neither `updateUsuarioAction` (demoting) nor `deleteUsuarioAction` (removing) may leave a tenant with zero `ADMIN` users — structurally the same shape as Fase 6's "can't delete the last sede" guard.
- **FK-protected deletes reuse the existing generic translation.** `deleteUsuarioAction` does **not** pre-check all eight of `Usuario`'s `onDelete: Restrict` relations (órdenes creadas, DVIs, facturas, pagos, historial, entradas, citas, órdenes-mecánico) individually — `friendlyPrismaErrorMessage`'s existing `P2003` branch ("No se puede completar la operación porque hay registros relacionados.") already covers all of them with one generic, honest message. Only the last-ADMIN rule gets its own specific pre-check and message, because it is not a foreign key at all (same reasoning Fase 6 applied to Sede's "last sede" check).
- **Commits:** one commit per task, message format `fase9-task N: descripción breve`, pushed to `main` immediately (RULES.md §3). No branch, no PR.
- **Verification cadence (RULES.md §4):** `npx tsc --noEmit` and `npx vitest run` only at the end of a task.
- **No automatic retries (RULES.md §1):** if a command or test fails twice, stop and report.
- **Out of scope, do not build:** self-service plan upgrade/checkout, Stripe/any payment processor (§6 YAGNI, unchanged), tenant creation via the super-admin web UI, feature-flag (hasDVI/…) gating, a super-admin nav/multi-page shell beyond the one dashboard this phase needs, subdomain-exclusivity enforcement for `/superadmin/*` routes (documented simplification below, not a defect).

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `prisma/migrations/20260824200000_add_planes_tenant_estado/migration.sql` | `Plan` table + 3 seed rows, `Tenant.plan_id` (backfilled NOT NULL FK), `Tenant.estado` |
| `src/lib/planes/limites.ts` (+ `.test.ts`) | `obtenerLimitesPlan(tenantSchema)` — the one place that reads `publicDb.tenant.plan` |
| `src/lib/validation/usuario.ts` (+ `.test.ts`) | Zod schemas for creating/editing a tenant `Usuario` |
| `src/app/(dashboard)/usuarios/nuevo/page.tsx` + `nuevo-usuario-form.tsx` (+ `.test.tsx`) | Create-user form |
| `src/app/(dashboard)/usuarios/[id]/page.tsx` + `editar-usuario-form.tsx` (+ `.test.tsx`) | Edit-user form (nombre/email/role/optional password) + delete button |
| `prisma/migrations/20260824210000_add_super_admin/migration.sql` | `SuperAdmin` table (public schema) |
| `scripts/seed-super-admin.ts` (+ `.test.ts`), `scripts/cli/seed-super-admin.ts` | Bootstrap CLI for the platform owner's own login |
| `src/lib/super-admin/verify-credentials.ts` (+ `.test.ts`) | bcrypt-compare against `SuperAdmin`, mirrors `src/lib/auth/verify-credentials.ts` |
| `src/lib/super-admin/auth.ts` | Second, independent `NextAuth()` instance — own `basePath`/cookie name |
| `src/app/api/superadmin/auth/[...nextauth]/route.ts` | Route handler for the second instance |
| `src/lib/super-admin/guards.ts` (+ `.test.ts`) | `requireSuperAdmin()` — returns a narrow local `SuperAdminSession`, never the ambient `Session` type |
| `src/app/superadmin/layout.tsx` | Wraps children in `<SessionProvider basePath="/api/superadmin/auth">` |
| `src/app/superadmin/login/page.tsx` + `superadmin-login-form.tsx` (+ `.test.tsx`) | Super-admin login (mirrors the tenant `LoginForm`, own endpoint) |
| `src/app/actions/super-admin-actions.ts` (+ `.test.ts`) | `listTenantsConPlan`, `listPlanes`, `cambiarEstadoTenantAction`, `cambiarPlanTenantAction` |
| `src/app/superadmin/page.tsx` (+ `.test.tsx` for its child forms) | Tenant list — estado toggle, plan reassignment |

**Modified:** `prisma/schema.prisma` (public — `Plan`/`Tenant`), `scripts/provision-tenant.ts` (+ its tests), `src/app/actions/usuario-actions.ts` (+ `.test.ts`), `src/app/actions/sede-actions.ts` (+ `.test.ts`), `src/app/(dashboard)/usuarios/page.tsx`, `src/lib/tenant/resolve-tenant.ts` (+ `.test.ts`), `src/lib/auth/authorize-credentials.ts` (+ `.test.ts`), `src/lib/auth/guards.ts` (+ `.test.ts`), `src/lib/auth/login-error-message.ts` (+ `.test.ts`), `package.json`, `.env.example` (comment only, no new var), `e2e/tenant-flow.spec.ts`, `e2e/super-admin-flow.spec.ts` (new).

---

## Design decisions locked in

1. **`Plan` limits are `Int?`, not a sentinel.** `NULL` means "sin límite práctico" (Avanzado). Every limit check is `if (maxX !== null) { ... }` — never a magic `-1` or `Number.MAX_SAFE_INTEGER` a future reader could mistake for a real cap.
2. **`Tenant.planId` is a required FK (`onDelete: Restrict`), backfilled at migration time, not left nullable.** A nullable `planId` would push a "what does no-plan mean?" branch into every single call site of `obtenerLimitesPlan` forever. The migration adds the column nullable, backfills every existing row to the Avanzado plan's id (preserves today's unrestricted behavior for every tenant that already exists — no surprise regression), then sets `NOT NULL` — same three-step shape as Fase 6 Task 1's `UsuarioSede` backfill.
3. **New tenants provisioned going forward default to the Básico plan**, looked up by `nombre` (not a hardcoded id, robust to reseeding). A fresh tenant has exactly 1 sede and 0 usuarios at provision time — trivially within Básico's 1/3 limits.
4. **`obtenerLimitesPlan` is the only function that reads `publicDb` for plan data.** `createSedeAction`/`createUsuarioAction` each call it once, then do their own `count()` against `tenantDb` and compare — no shared cross-schema query object, no ORM relation spanning both databases (Prisma cannot span schemas here; this project has never pretended otherwise, see Fase 1's split `public`/`tenant` clients).
5. **The super-admin session type is never the ambient `next-auth` `Session`.** `requireSuperAdmin()` in `src/lib/super-admin/guards.ts` is the single chokepoint; it returns a local `SuperAdminSession { id, email, nombre }` interface. No super-admin action or page may import `Session` from `"next-auth"` — that type, via `src/types/next-auth.d.ts`'s global module augmentation, describes the *tenant* instance's shape and would silently type-check reads of fields (`role`, `tenantSchema`, `sedeActivaId`) that are actually `undefined` on a super-admin token.
6. **`/superadmin/*` is reachable from any subdomain, not enforced apex/`admin`-only, deliberately.** The real security boundary is the separate `SuperAdmin` credential store (a tenant employee's email/password simply won't match any row there) — subdomain-scoping the *route* on top of that would be defense-in-depth, not a closed hole, and is left as documented backlog rather than built now.
7. **A suspended tenant fails login the same way a wrong password does** (`authorizeCredentials` returns `null`, no distinct message) — consistent with this project's existing "don't let the login form become an oracle" posture (wrong password / unknown email / wrong sede are already indistinguishable). An **already-logged-in** session for a tenant suspended mid-session gets a distinct redirect (`requireSession` → `/login?error=tenant-suspendido`), because at that point the user already knows they have an account; hiding it would just be confusing, not safer.
8. **`deleteUsuarioAction` allows an ADMIN to delete their own account**, as long as they are not the last ADMIN. No special "can't delete yourself" rule is added — the last-ADMIN guard already makes self-deletion safe (a solo ADMIN can't remove themselves; a second ADMIN can remove either account, including their own). Adding a redundant self-protection rule would be scope creep past what the design doc or any prior phase's convention calls for.
9. **Password change on edit follows the exact "blank keeps existing" convention already used twice in this codebase** (Fase 7's SMTP password, Fase 6's implicit "existing password untouched" on `guardarConfiguracionSmtpAction`): `usuarioUpdateInputSchema`'s `password` is `optional().or(z.literal(""))`, and `updateUsuarioAction` only rehashes when a non-empty value is submitted.

---

### Task 1: `Plan` model + `Tenant.planId`/`Tenant.estado` (public schema) + `provisionTenant` update

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260824200000_add_planes_tenant_estado/migration.sql`
- Modify: `scripts/provision-tenant.ts`
- Test: `scripts/provision-tenant.test.ts` (append tests)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: generated Prisma types `Plan`, `EstadoTenant` (`"ACTIVO" | "SUSPENDIDO"`) from `@/generated/prisma-public`; `Tenant.planId`/`Tenant.plan`/`Tenant.estado` — consumed by Task 2 (`obtenerLimitesPlan`) and Task 9 (`resolveTenant`).

- [ ] **Step 1: Add `EstadoTenant` enum and `Plan` model, extend `Tenant`, in `prisma/schema.prisma`**

Replace the entire file with:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma-public"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum EstadoTenant {
  ACTIVO
  SUSPENDIDO
}

model Plan {
  id          String   @id @default(cuid())
  nombre      String   @unique
  precio      Decimal? @db.Decimal(10, 2)
  maxUsuarios Int?     @map("max_usuarios")
  maxSedes    Int?     @map("max_sedes")
  tenants     Tenant[]
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("planes")
}

model Tenant {
  id         String       @id @default(cuid())
  slug       String       @unique
  schemaName String       @unique @map("schema_name")
  estado     EstadoTenant @default(ACTIVO)
  planId     String       @map("plan_id")
  plan       Plan         @relation(fields: [planId], references: [id], onDelete: Restrict)
  createdAt  DateTime     @default(now()) @map("created_at")
  updatedAt  DateTime     @updatedAt @map("updated_at")

  @@map("tenants")
  @@index([planId])
}
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260824200000_add_planes_tenant_estado/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "EstadoTenant" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateTable
CREATE TABLE "planes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DECIMAL(10,2),
    "max_usuarios" INTEGER,
    "max_sedes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planes_nombre_key" ON "planes"("nombre");

-- Seed the three fixed tiers (design doc §9 suggested defaults). precio is
-- deliberately NULL -- real pricing is an explicit open decision (§10), not
-- part of this phase.
INSERT INTO "planes" ("id", "nombre", "precio", "max_usuarios", "max_sedes", "updated_at") VALUES
    ('plan_basico',   'Básico',   NULL, 3,    1,    CURRENT_TIMESTAMP),
    ('plan_estandar', 'Estándar', NULL, 10,   1,    CURRENT_TIMESTAMP),
    ('plan_avanzado', 'Avanzado', NULL, NULL, NULL, CURRENT_TIMESTAMP);

-- AlterTable: add the new columns nullable first so existing rows don't
-- reject the migration, backfill, then tighten to NOT NULL. Every tenant
-- that already exists is backfilled to Avanzado (unlimited) specifically so
-- this migration cannot newly restrict a tenant that is already live.
ALTER TABLE "tenants" ADD COLUMN "estado" "EstadoTenant" NOT NULL DEFAULT 'ACTIVO';
ALTER TABLE "tenants" ADD COLUMN "plan_id" TEXT;

UPDATE "tenants" SET "plan_id" = 'plan_avanzado' WHERE "plan_id" IS NULL;

ALTER TABLE "tenants" ALTER COLUMN "plan_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "tenants_plan_id_idx" ON "tenants"("plan_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Update `provisionTenant` to assign the Básico plan by default**

In `scripts/provision-tenant.ts`, change:

```ts
    const tenant = await publicDb.tenant.create({ data: { slug, schemaName } });
```

to:

```ts
    const planBasico = await publicDb.plan.findUniqueOrThrow({ where: { nombre: "Básico" } });
    const tenant = await publicDb.tenant.create({ data: { slug, schemaName, planId: planBasico.id } });
```

- [ ] **Step 4: Write the failing test**

Append to `scripts/provision-tenant.test.ts`, inside the existing `describe("provisionTenant", () => { ... })` block, directly after the `it("exposes the notificaciones_orden_enviadas table on a freshly provisioned tenant", ...)` test:

```ts
  it("assigns the Básico plan and ACTIVO estado to a newly provisioned tenant", async () => {
    const tenant = await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const planBasico = await publicDb.plan.findUniqueOrThrow({ where: { nombre: "Básico" } });
    expect(tenant.planId).toBe(planBasico.id);
    expect(tenant.estado).toBe("ACTIVO");
  });

  it("backfilled every pre-existing tenant row to the Avanzado plan", async () => {
    const planAvanzado = await publicDb.plan.findUniqueOrThrow({ where: { nombre: "Avanzado" } });
    const otrosTenants = await publicDb.tenant.findMany({ where: { schemaName: { not: SCHEMA } } });

    for (const otro of otrosTenants) {
      expect(otro.planId).toBe(planAvanzado.id);
    }
  });
```

Import `publicDb` at the top of the file if not already imported (`import { publicDb } from "@/lib/db/public-client";`).

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run scripts/provision-tenant.test.ts -t "Básico plan"`
Expected: FAIL — `publicDb.plan` is `undefined` (the Prisma client has not been regenerated yet) or `provisionTenant` throws (the migration has not been applied yet).

- [ ] **Step 6: Regenerate the Prisma client and apply the migration**

Run:

```bash
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
```

Expected: `generate` prints "Generated Prisma Client ... to ./src/generated/prisma-public"; `migrate deploy` prints "Applying migration `20260824200000_add_planes_tenant_estado`".

If `migrate deploy` reports drift, STOP and report — do not run `migrate reset` (RULES.md §1).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add prisma/schema.prisma prisma/migrations/20260824200000_add_planes_tenant_estado/migration.sql scripts/provision-tenant.ts scripts/provision-tenant.test.ts src/generated/prisma-public
git commit -m "fase9-task 1: add Plan model, Tenant.planId/estado, backfill existing tenants to Avanzado"
git push origin main
```

---

### Task 2: `obtenerLimitesPlan` + `maxSedes` enforcement in `createSedeAction`

**Files:**
- Create: `src/lib/planes/limites.ts` (+ `.test.ts`)
- Modify: `src/app/actions/sede-actions.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `publicDb` from `@/lib/db/public-client` (Fase 1); `Tenant.planId`/`Plan` (Task 1).
- Produces: `LimitesPlan` interface, `obtenerLimitesPlan(tenantSchema: string): Promise<LimitesPlan>` — consumed by Task 2's own `createSedeAction` change and by Task 4's `createUsuarioAction`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/planes/limites.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

import { obtenerLimitesPlan } from "./limites";

describe("obtenerLimitesPlan", () => {
  it("returns the tenant's plan limits, looked up by tenantSchema", async () => {
    mockFindUnique.mockResolvedValue({ plan: { maxUsuarios: 3, maxSedes: 1 } });

    const limites = await obtenerLimitesPlan("taller_perez");

    expect(limites).toEqual({ maxUsuarios: 3, maxSedes: 1 });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { schemaName: "taller_perez" },
      select: { plan: { select: { maxUsuarios: true, maxSedes: true } } },
    });
  });

  it("passes through null limits (Avanzado, sin límite práctico) unchanged", async () => {
    mockFindUnique.mockResolvedValue({ plan: { maxUsuarios: null, maxSedes: null } });

    const limites = await obtenerLimitesPlan("taller_perez");

    expect(limites).toEqual({ maxUsuarios: null, maxSedes: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/planes/limites.test.ts`
Expected: FAIL — `Cannot find module './limites'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/planes/limites.ts`:

```ts
import { publicDb } from "@/lib/db/public-client";

export interface LimitesPlan {
  maxUsuarios: number | null;
  maxSedes: number | null;
}

/**
 * The only function that reads publicDb for plan data. Prisma cannot span
 * the public/tenant schema split (see Fase 1), so this is a plain two-hop
 * lookup: publicDb.tenant -> its Plan -> the two numeric limits. `null`
 * means "sin límite práctico" (Avanzado), never a sentinel like -1.
 *
 * tenantSchema is guaranteed to resolve to a live Tenant+Plan for any caller
 * that reached this via requireRole()/requireSession() -- that already
 * proved the tenant exists (resolveTenant()) before minting the session, and
 * Tenant.planId is a required FK. A missing row here would mean the
 * session's own tenant vanished mid-request, not a normal input to validate.
 */
export async function obtenerLimitesPlan(tenantSchema: string): Promise<LimitesPlan> {
  const tenant = await publicDb.tenant.findUnique({
    where: { schemaName: tenantSchema },
    select: { plan: { select: { maxUsuarios: true, maxSedes: true } } },
  });
  return tenant!.plan;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/planes/limites.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 5: Write the failing test for `createSedeAction`'s new limit check**

In `src/app/actions/sede-actions.test.ts`, add near the top (after the existing `vi.mock("@/lib/db/tenant-client", ...)` block):

```ts
const mockObtenerLimitesPlan = vi.fn();
vi.mock("@/lib/planes/limites", () => ({
  obtenerLimitesPlan: (...args: unknown[]) => mockObtenerLimitesPlan(...args),
}));
```

In the `beforeEach` of the `describe("createSedeAction", ...)` block (or the shared one, whichever the file uses), add:

```ts
    mockObtenerLimitesPlan.mockReset().mockResolvedValue({ maxUsuarios: null, maxSedes: null });
```

Then add these three tests inside `describe("createSedeAction", ...)`. Before writing them, open `sede-actions.test.ts` and confirm the exact mock variable names its `vi.mock("@/lib/db/tenant-client", ...)` factory already uses for `sede.count`/`sede.create` (likely `mockSedeCount`/`mockCreate`, matching this file's established naming for the other `sede.*` mocks) — use those exact names below, adding a `sede.count` mock to the factory if one does not already exist:

```ts
  it("refuses to create a sede once the plan's maxSedes limit is reached", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: null, maxSedes: 1 });
    mockSedeCount.mockResolvedValue(1);
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    const result = await createSedeAction(initialState, formData);

    expect(result).toEqual({
      error: "Tu plan permite hasta 1 sede(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("allows creating a sede when under the plan's maxSedes limit", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: null, maxSedes: 2 });
    mockSedeCount.mockResolvedValue(1);
    mockCreate.mockResolvedValue({ id: "sede-2" });
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    const result = await createSedeAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
  });

  it("skips the count query entirely when maxSedes is null (Avanzado)", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: null, maxSedes: null });
    mockCreate.mockResolvedValue({ id: "sede-2" });
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    await createSedeAction(initialState, formData);

    expect(mockSedeCount).not.toHaveBeenCalled();
  });
```

If the existing test file's `tenantDb` mock object does not yet expose a `sede.count` mock, add one alongside the existing `sede.findMany`/`sede.findUnique`/`sede.create`/`sede.delete` mocks in its `vi.mock("@/lib/db/tenant-client", ...)` factory, named `mockSedeCount`, following the file's existing naming pattern for the other `sede.*` mocks.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/app/actions/sede-actions.test.ts`
Expected: FAIL — the three new tests fail (`obtenerLimitesPlan` not called by the unmodified `createSedeAction`, or `mockSedeCount` never invoked).

- [ ] **Step 7: Write the implementation**

In `src/app/actions/sede-actions.ts`, add the import:

```ts
import { obtenerLimitesPlan } from "@/lib/planes/limites";
```

Change `createSedeAction` from:

```ts
export async function createSedeAction(
  prevState: SedeFormState,
  formData: FormData,
): Promise<SedeFormState> {
  const parsed = parseSedeFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
```

to:

```ts
export async function createSedeAction(
  prevState: SedeFormState,
  formData: FormData,
): Promise<SedeFormState> {
  const parsed = parseSedeFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const { maxSedes } = await obtenerLimitesPlan(session.user.tenantSchema);
  if (maxSedes !== null) {
    const actuales = await tenantDb.sede.count();
    if (actuales >= maxSedes) {
      return {
        error: `Tu plan permite hasta ${maxSedes} sede(s). Actualiza tu plan para agregar más.`,
        success: false,
      };
    }
  }

  try {
```

(The rest of the function — the `try { await tenantDb.sede.create(...) } catch { ... }` block and everything after — is unchanged.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/sede-actions.test.ts src/lib/planes/limites.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/planes/limites.ts src/lib/planes/limites.test.ts src/app/actions/sede-actions.ts src/app/actions/sede-actions.test.ts
git commit -m "fase9-task 2: enforce Plan.maxSedes when creating a sede"
git push origin main
```

---

### Task 3: `src/lib/validation/usuario.ts`

**Files:**
- Create: `src/lib/validation/usuario.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `usuarioCreateInputSchema`, `UsuarioCreateInput`, `usuarioUpdateInputSchema`, `UsuarioUpdateInput` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/lib/validation/usuario.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { usuarioCreateInputSchema, usuarioUpdateInputSchema } from "./usuario";

describe("usuarioCreateInputSchema", () => {
  it("accepts a valid payload", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "TECNICO",
    });
    expect(result.success).toBe(true);
  });

  it("requires a password of at least 8 characters", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "corta",
      role: "TECNICO",
    });
    expect(result.success).toBe(false);
    expect(result.success ? null : result.error.issues[0]?.message).toBe(
      "La contraseña debe tener al menos 8 caracteres",
    );
  });

  it("rejects an invalid email", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "no-es-un-correo",
      password: "contraseña-larga",
      role: "TECNICO",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a role outside the fixed set", () => {
    const result = usuarioCreateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "contraseña-larga",
      role: "SUPERUSUARIO",
    });
    expect(result.success).toBe(false);
  });
});

describe("usuarioUpdateInputSchema", () => {
  it("accepts an empty password (keep the existing one)", () => {
    const result = usuarioUpdateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "",
      role: "TECNICO",
    });
    expect(result.success).toBe(true);
  });

  it("still enforces the 8-character minimum when a new password IS submitted", () => {
    const result = usuarioUpdateInputSchema.safeParse({
      nombre: "Ana Pérez",
      email: "ana@taller.test",
      password: "corta",
      role: "TECNICO",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/validation/usuario.test.ts`
Expected: FAIL — `Cannot find module './usuario'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/validation/usuario.ts`:

```ts
import { z } from "zod";

const roleSchema = z.enum(["ADMIN", "TECNICO", "RECEPCION"]);

export const usuarioCreateInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: roleSchema,
});

export type UsuarioCreateInput = z.infer<typeof usuarioCreateInputSchema>;

/**
 * password: blank means "keep the existing one" -- same convention as
 * ConfiguracionSmtp's password field (Fase 7), applied here for the first
 * time to a tenant Usuario's own credential.
 */
export const usuarioUpdateInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional().or(z.literal("")),
  role: roleSchema,
});

export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateInputSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/validation/usuario.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/validation/usuario.ts src/lib/validation/usuario.test.ts
git commit -m "fase9-task 3: add zod schemas for usuario create/update"
git push origin main
```

---

### Task 4: `usuario-actions.ts` — create/update/delete with role management

**Files:**
- Modify: `src/app/actions/usuario-actions.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `usuarioCreateInputSchema`/`usuarioUpdateInputSchema` (Task 3); `obtenerLimitesPlan` (Task 2); existing `requireRole`, `getTenantDb`, `friendlyPrismaErrorMessage`.
- Produces: `UsuarioFormState { error: string | null; success: boolean }`, `createUsuarioAction`, `updateUsuarioAction`, `deleteUsuarioAction` — consumed by Task 5's forms.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/actions/usuario-actions.test.ts` (create the file if it does not already have a top section for these — check the existing file first; it already tests `listUsuariosConSedes`/`setUsuarioSedesAction`, so extend its existing `vi.mock("@/lib/db/tenant-client", ...)` factory to also expose `usuario: { create: mockUsuarioCreate, update: mockUsuarioUpdate, delete: mockUsuarioDelete, findUnique: mockUsuarioFindUnique, count: mockUsuarioCount }`, and add `vi.mock("@/lib/planes/limites", () => ({ obtenerLimitesPlan: (...args: unknown[]) => mockObtenerLimitesPlan(...args) }))` with `const mockObtenerLimitesPlan = vi.fn();` near the top):

```ts
const initialUsuarioState: UsuarioFormState = { error: null, success: false };

describe("createUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockObtenerLimitesPlan.mockReset().mockResolvedValue({ maxUsuarios: null, maxSedes: null });
    mockUsuarioCount.mockReset();
    mockUsuarioCreate.mockReset();
  });

  it("creates a usuario when under the plan's maxUsuarios limit", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: 3, maxSedes: null });
    mockUsuarioCount.mockResolvedValue(1);
    mockUsuarioCreate.mockResolvedValue({ id: "u2" });
    const formData = new FormData();
    formData.set("nombre", "Ana Pérez");
    formData.set("email", "ana@taller.test");
    formData.set("password", "contraseña-larga");
    formData.set("role", "TECNICO");

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUsuarioCreate).toHaveBeenCalledWith({
      data: {
        nombre: "Ana Pérez",
        email: "ana@taller.test",
        passwordHash: expect.any(String),
        role: "TECNICO",
      },
    });
  });

  it("refuses to create a usuario once the plan's maxUsuarios limit is reached", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: 3, maxSedes: null });
    mockUsuarioCount.mockResolvedValue(3);
    const formData = new FormData();
    formData.set("nombre", "Ana Pérez");
    formData.set("email", "ana@taller.test");
    formData.set("password", "contraseña-larga");
    formData.set("role", "TECNICO");

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({
      error: "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    expect(mockUsuarioCreate).not.toHaveBeenCalled();
  });

  it("rejects a short password before touching the database", async () => {
    const formData = new FormData();
    formData.set("nombre", "Ana Pérez");
    formData.set("email", "ana@taller.test");
    formData.set("password", "corta");
    formData.set("role", "TECNICO");

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result.error).toBe("La contraseña debe tener al menos 8 caracteres");
    expect(mockUsuarioCreate).not.toHaveBeenCalled();
  });
});

describe("updateUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockUsuarioFindUnique.mockReset();
    mockUsuarioCount.mockReset();
    mockUsuarioUpdate.mockReset();
  });

  it("updates nombre/email/role without touching the password when the field is blank", async () => {
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = new FormData();
    formData.set("nombre", "Ana P.");
    formData.set("email", "ana2@taller.test");
    formData.set("password", "");
    formData.set("role", "RECEPCION");

    const result = await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUsuarioUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { nombre: "Ana P.", email: "ana2@taller.test", role: "RECEPCION" },
    });
  });

  it("rehashes the password only when a new one is submitted", async () => {
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = new FormData();
    formData.set("nombre", "Ana P.");
    formData.set("email", "ana2@taller.test");
    formData.set("password", "otra-contraseña-larga");
    formData.set("role", "RECEPCION");

    await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(mockUsuarioUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { nombre: "Ana P.", email: "ana2@taller.test", role: "RECEPCION", passwordHash: expect.any(String) },
    });
  });

  it("refuses to demote the last ADMIN", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockUsuarioCount.mockResolvedValue(1);
    const formData = new FormData();
    formData.set("nombre", "Ana P.");
    formData.set("email", "ana@taller.test");
    formData.set("password", "");
    formData.set("role", "TECNICO");

    const result = await updateUsuarioAction("u1", initialUsuarioState, formData);

    expect(result).toEqual({
      error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
      success: false,
    });
    expect(mockUsuarioUpdate).not.toHaveBeenCalled();
  });

  it("allows demoting an ADMIN when a second ADMIN still exists", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockUsuarioCount.mockResolvedValue(2);
    mockUsuarioUpdate.mockResolvedValue({ id: "u1" });
    const formData = new FormData();
    formData.set("nombre", "Ana P.");
    formData.set("email", "ana@taller.test");
    formData.set("password", "");
    formData.set("role", "TECNICO");

    const result = await updateUsuarioAction("u1", initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
  });
});

describe("deleteUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockUsuarioFindUnique.mockReset();
    mockUsuarioCount.mockReset();
    mockUsuarioDelete.mockReset();
  });

  it("refuses to delete the last ADMIN", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockUsuarioCount.mockResolvedValue(1);

    await expect(deleteUsuarioAction("u1")).rejects.toThrow(
      "No puedes eliminar al único administrador del taller.",
    );
    expect(mockUsuarioDelete).not.toHaveBeenCalled();
  });

  it("deletes a non-ADMIN usuario without checking the ADMIN count", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "TECNICO" });
    mockUsuarioDelete.mockResolvedValue({ id: "u2" });

    await deleteUsuarioAction("u2");

    expect(mockUsuarioCount).not.toHaveBeenCalled();
    expect(mockUsuarioDelete).toHaveBeenCalledWith({ where: { id: "u2" } });
  });

  it("translates a foreign-key-protected delete into the generic Spanish message", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "TECNICO" });
    mockUsuarioDelete.mockRejectedValue({ code: "P2003" });

    await expect(deleteUsuarioAction("u2")).rejects.toThrow(
      "No se puede completar la operación porque hay registros relacionados.",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/actions/usuario-actions.test.ts`
Expected: FAIL — `createUsuarioAction`/`updateUsuarioAction`/`deleteUsuarioAction` are not exported yet.

- [ ] **Step 3: Write the implementation**

In `src/app/actions/usuario-actions.ts`, add these imports:

```ts
import bcrypt from "bcryptjs";
import { usuarioCreateInputSchema, usuarioUpdateInputSchema } from "@/lib/validation/usuario";
import { obtenerLimitesPlan } from "@/lib/planes/limites";
import type { Prisma } from "@/generated/prisma-tenant";
```

Append at the end of the file:

```ts
export interface UsuarioFormState {
  error: string | null;
  success: boolean;
}

export async function createUsuarioAction(
  prevState: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const parsed = usuarioCreateInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const { maxUsuarios } = await obtenerLimitesPlan(session.user.tenantSchema);
  if (maxUsuarios !== null) {
    const actuales = await tenantDb.usuario.count();
    if (actuales >= maxUsuarios) {
      return {
        error: `Tu plan permite hasta ${maxUsuarios} usuario(s). Actualiza tu plan para agregar más.`,
        success: false,
      };
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  try {
    await tenantDb.usuario.create({
      data: {
        nombre: parsed.data.nombre,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el usuario"), success: false };
  }

  revalidatePath("/usuarios");
  return { error: null, success: true };
}

export async function updateUsuarioAction(
  usuarioId: string,
  prevState: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const parsed = usuarioUpdateInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  if (parsed.data.role !== "ADMIN") {
    const usuarioActual = await tenantDb.usuario.findUnique({
      where: { id: usuarioId },
      select: { role: true },
    });
    if (usuarioActual?.role === "ADMIN") {
      const totalAdmins = await tenantDb.usuario.count({ where: { role: "ADMIN" } });
      if (totalAdmins <= 1) {
        return {
          error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
          success: false,
        };
      }
    }
  }

  const datos: Prisma.UsuarioUpdateInput = {
    nombre: parsed.data.nombre,
    email: parsed.data.email,
    role: parsed.data.role,
  };
  if (parsed.data.password) {
    datos.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  try {
    await tenantDb.usuario.update({ where: { id: usuarioId }, data: datos });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el usuario"), success: false };
  }

  revalidatePath("/usuarios");
  return { error: null, success: true };
}

/**
 * Does NOT pre-check every one of Usuario's eight onDelete:Restrict
 * relations (órdenes, DVIs, facturas, pagos, historial, entradas, citas,
 * mecánico) -- friendlyPrismaErrorMessage's existing P2003 branch already
 * gives one honest, generic Spanish message for all of them. Only the
 * last-ADMIN rule gets its own check, because it is not a foreign key.
 */
export async function deleteUsuarioAction(usuarioId: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const usuario = await tenantDb.usuario.findUnique({
    where: { id: usuarioId },
    select: { role: true },
  });
  if (!usuario) {
    throw new Error("Usuario no encontrado");
  }

  if (usuario.role === "ADMIN") {
    const totalAdmins = await tenantDb.usuario.count({ where: { role: "ADMIN" } });
    if (totalAdmins <= 1) {
      throw new Error("No puedes eliminar al único administrador del taller.");
    }
  }

  try {
    await tenantDb.usuario.delete({ where: { id: usuarioId } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el usuario"));
  }

  revalidatePath("/usuarios");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/usuario-actions.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/app/actions/usuario-actions.ts src/app/actions/usuario-actions.test.ts
git commit -m "fase9-task 4: add usuario create/update/delete with role and last-ADMIN guards"
git push origin main
```

---

### Task 5: `/usuarios/nuevo` and `/usuarios/[id]` — create and edit UI

**Files:**
- Create: `src/app/(dashboard)/usuarios/nuevo/page.tsx`, `nuevo-usuario-form.tsx` (+ `.test.tsx`)
- Create: `src/app/(dashboard)/usuarios/[id]/page.tsx`, `editar-usuario-form.tsx` (+ `.test.tsx`)
- Modify: `src/app/(dashboard)/usuarios/page.tsx` (add "Crear usuario" link + per-row "Editar"/"Eliminar")

**Interfaces:**
- Consumes: `createUsuarioAction`, `updateUsuarioAction`, `deleteUsuarioAction`, `UsuarioFormState` (Task 4); `listUsuariosConSedes` (Fase 6, unchanged).
- Produces: nothing new for later tasks — this is the phase's leaf UI for módulo 10.

- [ ] **Step 1: Write the failing test for `NuevoUsuarioForm`**

Create `src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateUsuarioAction = vi.fn();
vi.mock("@/app/actions/usuario-actions", () => ({
  createUsuarioAction: (...args: unknown[]) => mockCreateUsuarioAction(...args),
}));

import { NuevoUsuarioForm } from "./nuevo-usuario-form";

describe("NuevoUsuarioForm", () => {
  beforeEach(() => {
    mockCreateUsuarioAction.mockReset();
    mockCreateUsuarioAction.mockResolvedValue({ error: null, success: false });
  });

  it("renders the three roles as options", () => {
    render(<NuevoUsuarioForm />);

    expect(screen.getByRole("option", { name: "ADMIN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "TECNICO" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "RECEPCION" })).toBeInTheDocument();
  });

  it("shows the error returned by the action", async () => {
    mockCreateUsuarioAction.mockResolvedValue({
      error: "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    render(<NuevoUsuarioForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.test.tsx"`
Expected: FAIL — `Cannot find module './nuevo-usuario-form'`.

- [ ] **Step 3: Write `NuevoUsuarioForm` and its page**

Create `src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createUsuarioAction, type UsuarioFormState } from "@/app/actions/usuario-actions";

const initialState: UsuarioFormState = { error: null, success: false };

export function NuevoUsuarioForm() {
  const [state, formAction, isPending] = useActionState(createUsuarioAction, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" required minLength={8} />

      <label htmlFor="role">Rol</label>
      <select id="role" name="role" defaultValue="TECNICO">
        <option value="ADMIN">ADMIN</option>
        <option value="TECNICO">TECNICO</option>
        <option value="RECEPCION">RECEPCION</option>
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear usuario"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Usuario creado</p> : null}
    </form>
  );
}
```

Create `src/app/(dashboard)/usuarios/nuevo/page.tsx`:

```tsx
import { NuevoUsuarioForm } from "./nuevo-usuario-form";

export default function NuevoUsuarioPage() {
  return (
    <main>
      <h1>Crear usuario</h1>
      <NuevoUsuarioForm />
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/(dashboard)/usuarios/nuevo/nuevo-usuario-form.test.tsx"`
Expected: PASS, both tests green.

- [ ] **Step 5: Write the failing test for `EditarUsuarioForm`**

Create `src/app/(dashboard)/usuarios/[id]/editar-usuario-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateUsuarioAction = vi.fn();
const mockDeleteUsuarioAction = vi.fn();
vi.mock("@/app/actions/usuario-actions", () => ({
  updateUsuarioAction: (...args: unknown[]) => mockUpdateUsuarioAction(...args),
  deleteUsuarioAction: (...args: unknown[]) => mockDeleteUsuarioAction(...args),
}));

import { EditarUsuarioForm } from "./editar-usuario-form";

const USUARIO = { id: "u1", nombre: "Ana Pérez", email: "ana@taller.test", role: "TECNICO" as const };

describe("EditarUsuarioForm", () => {
  beforeEach(() => {
    mockUpdateUsuarioAction.mockReset();
    mockUpdateUsuarioAction.mockResolvedValue({ error: null, success: false });
    mockDeleteUsuarioAction.mockReset();
  });

  it("pre-fills nombre/email/role from the given usuario, leaving password blank", () => {
    render(<EditarUsuarioForm usuario={USUARIO} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana Pérez");
    expect(screen.getByLabelText("Correo")).toHaveValue("ana@taller.test");
    expect(screen.getByLabelText("Rol")).toHaveValue("TECNICO");
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
  });

  it("shows the error returned by updateUsuarioAction", async () => {
    mockUpdateUsuarioAction.mockResolvedValue({
      error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
      success: false,
    });
    render(<EditarUsuarioForm usuario={{ ...USUARIO, role: "ADMIN" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No puedes quitar el rol de ADMIN al único administrador del taller.",
    );
  });

  it("calls deleteUsuarioAction with the usuario id when the delete button is clicked", async () => {
    mockDeleteUsuarioAction.mockResolvedValue(undefined);
    render(<EditarUsuarioForm usuario={USUARIO} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar usuario" }));

    expect(mockDeleteUsuarioAction).toHaveBeenCalledWith("u1");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/usuarios/[id]/editar-usuario-form.test.tsx"`
Expected: FAIL — `Cannot find module './editar-usuario-form'`.

- [ ] **Step 7: Write `EditarUsuarioForm` and its page**

Create `src/app/(dashboard)/usuarios/[id]/editar-usuario-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { updateUsuarioAction, deleteUsuarioAction, type UsuarioFormState } from "@/app/actions/usuario-actions";

const initialState: UsuarioFormState = { error: null, success: false };

export interface EditarUsuarioFormUsuario {
  id: string;
  nombre: string;
  email: string;
  role: "ADMIN" | "TECNICO" | "RECEPCION";
}

export function EditarUsuarioForm({ usuario }: { usuario: EditarUsuarioFormUsuario }) {
  const updateEsteUsuario = updateUsuarioAction.bind(null, usuario.id);
  const [state, formAction, isPending] = useActionState(updateEsteUsuario, initialState);

  return (
    <>
      <form action={formAction}>
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" name="nombre" required defaultValue={usuario.nombre} />

        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" required defaultValue={usuario.email} />

        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" defaultValue="" />
        <p>Déjala en blanco para conservar la contraseña actual.</p>

        <label htmlFor="role">Rol</label>
        <select id="role" name="role" defaultValue={usuario.role}>
          <option value="ADMIN">ADMIN</option>
          <option value="TECNICO">TECNICO</option>
          <option value="RECEPCION">RECEPCION</option>
        </select>

        <button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>

        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.success ? <p role="status">Usuario actualizado</p> : null}
      </form>

      <form action={deleteUsuarioAction.bind(null, usuario.id)}>
        <button type="submit">Eliminar usuario</button>
      </form>
    </>
  );
}
```

Create `src/app/(dashboard)/usuarios/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { listUsuariosConSedes } from "@/app/actions/usuario-actions";
import { EditarUsuarioForm } from "./editar-usuario-form";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuarios = await listUsuariosConSedes();
  const usuario = usuarios.find((u) => u.id === id);
  if (!usuario) {
    notFound();
  }

  return (
    <main>
      <h1>Editar usuario</h1>
      <EditarUsuarioForm usuario={usuario} />
    </main>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run "src/app/(dashboard)/usuarios/[id]/editar-usuario-form.test.tsx"`
Expected: PASS, all three tests green.

- [ ] **Step 9: Wire "Crear usuario" and per-row "Editar" links into `/usuarios/page.tsx`**

Open `src/app/(dashboard)/usuarios/page.tsx`, add a link to `/usuarios/nuevo` near its heading and, in the per-usuario row markup (alongside the existing `AsignarSedesForm`), a `<Link href={`/usuarios/${usuario.id}`}>Editar</Link>`. Match this file's existing rendering structure exactly — read it first, since the precise JSX shape (list vs. table) determines where the link belongs; do not restructure the existing sede-assignment rendering, only add to it.

- [ ] **Step 10: Run the full component test suite for `/usuarios` and typecheck**

Run: `npx vitest run "src/app/(dashboard)/usuarios"`
Expected: PASS, no regressions to the existing page/`AsignarSedesForm` tests.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add "src/app/(dashboard)/usuarios"
git commit -m "fase9-task 5: add usuario create/edit/delete UI"
git push origin main
```

---

### Task 6: `SuperAdmin` model (public schema) + bootstrap CLI

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260824210000_add_super_admin/migration.sql`
- Create: `scripts/seed-super-admin.ts` (+ `.test.ts`), `scripts/cli/seed-super-admin.ts`
- Modify: `package.json` (add `superadmin:seed` script)

**Interfaces:**
- Consumes: `publicDb` (Fase 1).
- Produces: generated Prisma type `SuperAdmin` from `@/generated/prisma-public`; `seedSuperAdmin(input): Promise<SuperAdmin>` — consumed by Task 7's `verifySuperAdminCredentials`.

- [ ] **Step 1: Add the `SuperAdmin` model to `prisma/schema.prisma`**

Append at the end of the file (after the `Tenant` model's closing `}`):

```prisma

model SuperAdmin {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  nombre       String
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("super_admins")
}
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260824210000_add_super_admin/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "super_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");
```

- [ ] **Step 3: Write the failing test**

Create `scripts/seed-super-admin.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { publicDb } from "@/lib/db/public-client";
import { seedSuperAdmin } from "./seed-super-admin";

const EMAIL = "owner@torqueflow.test";

afterEach(async () => {
  await publicDb.superAdmin.deleteMany({ where: { email: EMAIL } });
});

describe("seedSuperAdmin", () => {
  it("creates a SuperAdmin row with a bcrypt-hashed password", async () => {
    const admin = await seedSuperAdmin({ email: EMAIL, password: "clave-larga-segura", nombre: "Alejo" });

    expect(admin.email).toBe(EMAIL);
    expect(admin.passwordHash).not.toBe("clave-larga-segura");
    expect(await bcrypt.compare("clave-larga-segura", admin.passwordHash)).toBe(true);
  });

  it("is idempotent: re-seeding the same email updates it instead of duplicating", async () => {
    await seedSuperAdmin({ email: EMAIL, password: "clave-vieja", nombre: "Alejo" });
    await seedSuperAdmin({ email: EMAIL, password: "clave-nueva", nombre: "Alejo Z." });

    const admins = await publicDb.superAdmin.findMany({ where: { email: EMAIL } });
    expect(admins).toHaveLength(1);
    expect(admins[0].nombre).toBe("Alejo Z.");
    expect(await bcrypt.compare("clave-nueva", admins[0].passwordHash)).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run scripts/seed-super-admin.test.ts`
Expected: FAIL — `Cannot find module './seed-super-admin'` (and `publicDb.superAdmin` does not exist yet).

- [ ] **Step 5: Regenerate the Prisma client and apply the migration**

Run:

```bash
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
```

Expected: "Applying migration `20260824210000_add_super_admin`".

- [ ] **Step 6: Write the implementation**

Create `scripts/seed-super-admin.ts`:

```ts
import bcrypt from "bcryptjs";
import { publicDb } from "@/lib/db/public-client";
import type { SuperAdmin } from "@/generated/prisma-public";

export interface SeedSuperAdminInput {
  email: string;
  password: string;
  nombre: string;
}

export async function seedSuperAdmin({ email, password, nombre }: SeedSuperAdminInput): Promise<SuperAdmin> {
  const passwordHash = await bcrypt.hash(password, 12);
  return publicDb.superAdmin.upsert({
    where: { email },
    update: { passwordHash, nombre },
    create: { email, passwordHash, nombre },
  });
}
```

Create `scripts/cli/seed-super-admin.ts`:

```ts
import "dotenv/config";
import { seedSuperAdmin } from "../seed-super-admin";

const [email, password, nombre] = process.argv.slice(2);
if (!email || !password || !nombre) {
  console.error("Usage: npm run superadmin:seed -- <email> <password> <nombre>");
  process.exit(1);
}

seedSuperAdmin({ email, password, nombre })
  .then((admin) => {
    console.log(`Seeded super-admin "${admin.email}"`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

In `package.json`, add alongside the existing `tenant:*` scripts:

```json
    "superadmin:seed": "tsx scripts/cli/seed-super-admin.ts"
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run scripts/seed-super-admin.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add prisma/schema.prisma prisma/migrations/20260824210000_add_super_admin/migration.sql scripts/seed-super-admin.ts scripts/seed-super-admin.test.ts scripts/cli/seed-super-admin.ts package.json src/generated/prisma-public
git commit -m "fase9-task 6: add SuperAdmin model and bootstrap seed script"
git push origin main
```

---

### Task 7: Independent super-admin NextAuth instance + `requireSuperAdmin` guard

**Files:**
- Create: `src/lib/super-admin/verify-credentials.ts` (+ `.test.ts`)
- Create: `src/lib/super-admin/auth.ts`
- Create: `src/app/api/superadmin/auth/[...nextauth]/route.ts`
- Create: `src/lib/super-admin/guards.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `SuperAdmin` (Task 6).
- Produces: `verifySuperAdminCredentials`, `SuperAdminSession`, `requireSuperAdmin()` — consumed by Task 9's `super-admin-actions.ts` and Task 8's login form.

- [ ] **Step 1: Write the failing test for credential verification**

Create `src/lib/super-admin/verify-credentials.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { superAdmin: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

import bcrypt from "bcryptjs";
import { verifySuperAdminCredentials } from "./verify-credentials";

describe("verifySuperAdminCredentials", () => {
  it("returns the admin when the password matches", async () => {
    const passwordHash = await bcrypt.hash("clave-larga-segura", 12);
    mockFindUnique.mockResolvedValue({ id: "sa1", email: "owner@torqueflow.test", passwordHash, nombre: "Alejo" });

    const admin = await verifySuperAdminCredentials("owner@torqueflow.test", "clave-larga-segura");

    expect(admin?.id).toBe("sa1");
  });

  it("returns null when the email is unknown", async () => {
    mockFindUnique.mockResolvedValue(null);

    const admin = await verifySuperAdminCredentials("unknown@torqueflow.test", "cualquier-cosa");

    expect(admin).toBeNull();
  });

  it("returns null when the password does not match", async () => {
    const passwordHash = await bcrypt.hash("clave-correcta", 12);
    mockFindUnique.mockResolvedValue({ id: "sa1", email: "owner@torqueflow.test", passwordHash, nombre: "Alejo" });

    const admin = await verifySuperAdminCredentials("owner@torqueflow.test", "clave-incorrecta");

    expect(admin).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/super-admin/verify-credentials.test.ts`
Expected: FAIL — `Cannot find module './verify-credentials'`.

- [ ] **Step 3: Write `verify-credentials.ts`**

Create `src/lib/super-admin/verify-credentials.ts`:

```ts
import bcrypt from "bcryptjs";
import { publicDb } from "@/lib/db/public-client";
import type { SuperAdmin } from "@/generated/prisma-public";

export async function verifySuperAdminCredentials(email: string, password: string): Promise<SuperAdmin | null> {
  const admin = await publicDb.superAdmin.findUnique({ where: { email } });
  if (!admin) return null;

  const matches = await bcrypt.compare(password, admin.passwordHash);
  if (!matches) return null;

  return admin;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/super-admin/verify-credentials.test.ts`
Expected: PASS, all three tests green.

- [ ] **Step 5: Write the second NextAuth instance**

Create `src/lib/super-admin/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifySuperAdminCredentials } from "./verify-credentials";

/**
 * A second, fully independent NextAuth instance -- own basePath, own cookie
 * name, own session shape. Deliberately does NOT share src/auth.ts or the
 * next-auth.d.ts module augmentation: that augmentation is global and
 * describes the TENANT session (role/tenantSchema/sedeActivaId, all
 * required). A super-admin session has none of those fields; sharing the
 * type would let TypeScript silently allow reading fields that are actually
 * undefined here. See src/lib/super-admin/guards.ts for the narrow local
 * type every caller must use instead.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  basePath: "/api/superadmin/auth",
  session: { strategy: "jwt" },
  pages: { signIn: "/superadmin/login" },
  cookies: {
    sessionToken: {
      name: "superadmin-session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const admin = await verifySuperAdminCredentials(email, password);
        if (!admin) return null;

        return { id: admin.id, email: admin.email, name: admin.nombre };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      session.user.id = token.sub as string;
      return session;
    },
  },
});
```

- [ ] **Step 6: Write the route handler**

Create `src/app/api/superadmin/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/super-admin/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Write the failing test for `requireSuperAdmin`**

Create `src/lib/super-admin/guards.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("./auth", () => ({ auth: () => mockAuth() }));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

import { requireSuperAdmin } from "./guards";

describe("requireSuperAdmin", () => {
  it("returns a narrow SuperAdminSession when a session exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "sa1", email: "owner@torqueflow.test", name: "Alejo" } });

    const session = await requireSuperAdmin();

    expect(session).toEqual({ id: "sa1", email: "owner@torqueflow.test", nombre: "Alejo" });
  });

  it("redirects to /superadmin/login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    mockRedirect.mockImplementation(() => {
      throw new Error("REDIRECT:/superadmin/login");
    });

    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/superadmin/login");
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run src/lib/super-admin/guards.test.ts`
Expected: FAIL — `Cannot find module './guards'`.

- [ ] **Step 9: Write `guards.ts`**

Create `src/lib/super-admin/guards.ts`:

```ts
import { redirect } from "next/navigation";
import { auth } from "./auth";

export interface SuperAdminSession {
  id: string;
  email: string;
  nombre: string;
}

/**
 * The single chokepoint for every super-admin-only action/page. Returns a
 * local, narrow type -- never `Session` from "next-auth" -- for the reason
 * documented at the top of ./auth.ts.
 */
export async function requireSuperAdmin(): Promise<SuperAdminSession> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/superadmin/login");
  }

  return {
    id: session.user.id as string,
    email: session.user.email as string,
    nombre: session.user.name as string,
  };
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run src/lib/super-admin/guards.test.ts`
Expected: PASS, both tests green.

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. **If this fails on `src/lib/super-admin/auth.ts`'s `Credentials`/`NextAuth` config shape (e.g. `basePath` or `cookies.sessionToken` not recognized by the installed `next-auth@5.0.0-beta.32` types), check `node_modules/next-auth/index.d.ts` and `node_modules/next-auth/react.d.ts` directly for this exact beta's actual config surface before changing anything — do not guess from general Auth.js knowledge, this project's own AGENTS.md requires reading the installed package's own types for exactly this class of API-surface question.** Fix only the specific mismatch found; do not restructure the guard/session design.

- [ ] **Step 12: Commit**

```bash
git add src/lib/super-admin/verify-credentials.ts src/lib/super-admin/verify-credentials.test.ts src/lib/super-admin/auth.ts src/app/api/superadmin/auth/\[...nextauth\]/route.ts src/lib/super-admin/guards.ts src/lib/super-admin/guards.test.ts
git commit -m "fase9-task 7: add independent super-admin NextAuth instance and guard"
git push origin main
```

---

### Task 8: `/superadmin/login` — separate login page

**Files:**
- Create: `src/app/superadmin/layout.tsx`
- Create: `src/app/superadmin/login/page.tsx`, `superadmin-login-form.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `signIn` re-exported implicitly via `next-auth/react` + the `SessionProvider` wired to Task 7's `basePath` (client-side only — no server import from `src/lib/super-admin/auth.ts` in this task's client component).
- Produces: nothing new for later tasks — this is the login surface for Task 10's dashboard.

- [ ] **Step 1: Write `src/app/superadmin/layout.tsx`**

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Wraps everything under /superadmin in a SessionProvider pointed at the
 * super-admin NextAuth instance's own basePath (Task 7). Without this, the
 * client-side signIn()/signOut() helpers in superadmin-login-form.tsx would
 * default to "/api/auth" -- the TENANT instance's route -- since next-auth/react
 * has no other way to know a second instance exists.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath="/api/superadmin/auth">{children}</SessionProvider>;
}
```

- [ ] **Step 2: Write the failing test for the login form**

Create `src/app/superadmin/login/superadmin-login-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();
const mockPush = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { SuperAdminLoginForm } from "./superadmin-login-form";

describe("SuperAdminLoginForm", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
  });

  it("redirects to /superadmin on a successful sign-in", async () => {
    mockSignIn.mockResolvedValue({ ok: true });
    render(<SuperAdminLoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "owner@torqueflow.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "clave-larga-segura");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "owner@torqueflow.test",
      password: "clave-larga-segura",
      redirect: false,
    });
    expect(mockPush).toHaveBeenCalledWith("/superadmin");
  });

  it("shows one generic error on failure, never distinguishing wrong email from wrong password", async () => {
    mockSignIn.mockResolvedValue({ ok: false });
    render(<SuperAdminLoginForm />);

    await userEvent.type(screen.getByLabelText("Correo"), "owner@torqueflow.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "incorrecta");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run "src/app/superadmin/login/superadmin-login-form.test.tsx"`
Expected: FAIL — `Cannot find module './superadmin-login-form'`.

- [ ] **Step 4: Write `superadmin-login-form.tsx` and its page**

Create `src/app/superadmin/login/superadmin-login-form.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function SuperAdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await signIn("credentials", { email, password, redirect: false });
    setIsPending(false);

    if (!result?.ok) {
      setError("Correo o contraseña incorrectos");
      return;
    }

    router.push("/superadmin");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" required />

      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Ingresando..." : "Ingresar"}
      </button>

      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
```

Create `src/app/superadmin/login/page.tsx`:

```tsx
import { SuperAdminLoginForm } from "./superadmin-login-form";

export default function SuperAdminLoginPage() {
  return (
    <main>
      <h1>TorqueFlow — Panel de super-admin</h1>
      <SuperAdminLoginForm />
    </main>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "src/app/superadmin/login/superadmin-login-form.test.tsx"`
Expected: PASS, both tests green.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/app/superadmin/layout.tsx src/app/superadmin/login
git commit -m "fase9-task 8: add super-admin login page"
git push origin main
```

---

### Task 9: Suspended-tenant enforcement (`resolveTenant`, login, active session)

**Files:**
- Modify: `src/lib/tenant/resolve-tenant.ts` (+ `.test.ts`)
- Modify: `src/lib/auth/authorize-credentials.ts` (+ `.test.ts`)
- Modify: `src/lib/auth/guards.ts` (+ `.test.ts`)
- Modify: `src/lib/auth/login-error-message.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: `Tenant.estado` (Task 1).
- Produces: `ResolvedTenant.estado` — consumed by Task 10's `cambiarEstadoTenantAction` callers indirectly (no direct import; this task is the enforcement half, Task 10 is the control half).

- [ ] **Step 1: Write the failing test for `resolveTenant`**

In `src/lib/tenant/resolve-tenant.test.ts`, add (matching the file's existing mocking style for `publicDb.tenant.findUnique`):

```ts
  it("includes the tenant's estado in the resolved value", async () => {
    mockFindUnique.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez", estado: "SUSPENDIDO" });

    const tenant = await resolveTenant();

    expect(tenant).toEqual({ slug: "taller-perez", schemaName: "taller_perez", estado: "SUSPENDIDO" });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/tenant/resolve-tenant.test.ts`
Expected: FAIL — the returned object has no `estado` field yet.

- [ ] **Step 3: Update `resolveTenant`**

In `src/lib/tenant/resolve-tenant.ts`, change:

```ts
export interface ResolvedTenant {
  slug: string;
  schemaName: string;
}
```

to:

```ts
export interface ResolvedTenant {
  slug: string;
  schemaName: string;
  estado: "ACTIVO" | "SUSPENDIDO";
}
```

and change:

```ts
  return { slug: tenant.slug, schemaName: tenant.schemaName };
```

to:

```ts
  return { slug: tenant.slug, schemaName: tenant.schemaName, estado: tenant.estado };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tenant/resolve-tenant.test.ts`
Expected: PASS, all tests green (including the existing ones — `estado` is additive, no prior assertion breaks since none previously asserted the exact returned shape with `toEqual` against a literal missing the field; if any did, update it to include `estado: "ACTIVO"`).

- [ ] **Step 5: Write the failing test for login-time blocking**

In `src/lib/auth/authorize-credentials.test.ts`, add a test asserting that a `SUSPENDIDO` tenant makes `authorizeCredentials` return `null` even with correct credentials — mock `resolveTenant` to return `estado: "SUSPENDIDO"` and assert the function never reaches `verifyCredentials`/`getTenantDb`:

```ts
  it("returns null for a suspended tenant without ever checking credentials", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez", estado: "SUSPENDIDO" });

    const result = await authorizeCredentials({ email: "a@a.test", password: "x", sedeId: "s1" });

    expect(result).toBeNull();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });
```

(Match the exact mock variable names already established in this test file — `mockResolveTenant`/`mockVerifyCredentials` or whatever it currently uses; inspect the file first.)

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/authorize-credentials.test.ts`
Expected: FAIL — the unmodified function still calls `verifyCredentials`.

- [ ] **Step 7: Update `authorizeCredentials`**

In `src/lib/auth/authorize-credentials.ts`, change:

```ts
  const tenant = await resolveTenant();
  if (!tenant) return null;

  const tenantDb = getTenantDb(tenant.schemaName);
```

to:

```ts
  const tenant = await resolveTenant();
  if (!tenant) return null;
  // A suspended tenant fails the same way a wrong password does -- no
  // distinct message, consistent with this login flow already treating wrong
  // password/unknown email/wrong sede as indistinguishable.
  if (tenant.estado === "SUSPENDIDO") return null;

  const tenantDb = getTenantDb(tenant.schemaName);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth/authorize-credentials.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 9: Write the failing test for an already-logged-in session**

In `src/lib/auth/guards.test.ts`, add a test to `describe("requireSession", ...)` asserting a redirect to `/login?error=tenant-suspendido` when `resolveTenant` returns `estado: "SUSPENDIDO"` (matching this file's existing pattern for the `tenant-mismatch`/`sede-requerida` redirect tests):

```ts
  it("redirects to /login?error=tenant-suspendido when the tenant has been suspended mid-session", async () => {
    mockAuth.mockResolvedValue({ user: { tenantSchema: "taller_perez", sedeActivaId: "s1" } });
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez", estado: "SUSPENDIDO" });
    mockRedirect.mockImplementation(() => {
      throw new Error("REDIRECT:/login?error=tenant-suspendido");
    });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=tenant-suspendido");
  });
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/guards.test.ts`
Expected: FAIL — `requireSession` does not check `estado` yet.

- [ ] **Step 11: Update `requireSession`**

In `src/lib/auth/guards.ts`, change:

```ts
  const tenant = await resolveTenant();
  if (!tenant || tenant.schemaName !== session.user.tenantSchema) {
    redirect("/login?error=tenant-mismatch");
  }
```

to:

```ts
  const tenant = await resolveTenant();
  if (!tenant || tenant.schemaName !== session.user.tenantSchema) {
    redirect("/login?error=tenant-mismatch");
  }
  if (tenant.estado === "SUSPENDIDO") {
    redirect("/login?error=tenant-suspendido");
  }
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth/guards.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 13: Add the error copy**

In `src/lib/auth/login-error-message.ts`, add a new branch:

```ts
  if (code === "tenant-suspendido") {
    return "Tu taller está suspendido. Contacta al proveedor del servicio.";
  }
```

Add a matching test in `src/lib/auth/login-error-message.test.ts`, following the file's existing per-code test pattern.

- [ ] **Step 14: Run the full auth test suite and typecheck**

Run: `npx vitest run src/lib/tenant/resolve-tenant.test.ts src/lib/auth`
Expected: PASS, no regressions.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 15: Commit**

```bash
git add src/lib/tenant/resolve-tenant.ts src/lib/tenant/resolve-tenant.test.ts src/lib/auth/authorize-credentials.ts src/lib/auth/authorize-credentials.test.ts src/lib/auth/guards.ts src/lib/auth/guards.test.ts src/lib/auth/login-error-message.ts src/lib/auth/login-error-message.test.ts
git commit -m "fase9-task 9: block login and active sessions for a suspended tenant"
git push origin main
```

---

### Task 10: Super-admin dashboard — list tenants, toggle estado, change plan

**Files:**
- Create: `src/app/actions/super-admin-actions.ts` (+ `.test.ts`)
- Create: `src/app/superadmin/page.tsx`, `tenant-row-actions.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: `requireSuperAdmin` (Task 7).
- Produces: nothing new for later tasks — the phase's last new capability.

- [ ] **Step 1: Write the failing tests for `super-admin-actions.ts`**

Create `src/app/actions/super-admin-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireSuperAdmin = vi.fn();
vi.mock("@/lib/super-admin/guards", () => ({
  requireSuperAdmin: () => mockRequireSuperAdmin(),
}));

const mockTenantFindMany = vi.fn();
const mockTenantUpdate = vi.fn();
const mockPlanFindMany = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: {
    tenant: { findMany: (...args: unknown[]) => mockTenantFindMany(...args), update: (...args: unknown[]) => mockTenantUpdate(...args) },
    plan: { findMany: (...args: unknown[]) => mockPlanFindMany(...args) },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listTenantsConPlan,
  listPlanes,
  cambiarEstadoTenantAction,
  cambiarPlanTenantAction,
  type SuperAdminFormState,
} from "./super-admin-actions";

const initialState: SuperAdminFormState = { error: null, success: false };

beforeEach(() => {
  mockRequireSuperAdmin.mockReset().mockResolvedValue({ id: "sa1", email: "owner@torqueflow.test", nombre: "Alejo" });
  mockTenantFindMany.mockReset();
  mockTenantUpdate.mockReset();
  mockPlanFindMany.mockReset();
});

describe("listTenantsConPlan", () => {
  it("requires a super-admin session and returns every tenant with its plan", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", slug: "taller-perez", estado: "ACTIVO", plan: { id: "plan_basico", nombre: "Básico" } },
    ]);

    const tenants = await listTenantsConPlan();

    expect(mockRequireSuperAdmin).toHaveBeenCalled();
    expect(tenants).toHaveLength(1);
    expect(tenants[0].plan.nombre).toBe("Básico");
  });
});

describe("cambiarEstadoTenantAction", () => {
  it("toggles a tenant's estado", async () => {
    mockTenantUpdate.mockResolvedValue({ id: "t1", estado: "SUSPENDIDO" });
    const formData = new FormData();
    formData.set("estado", "SUSPENDIDO");

    const result = await cambiarEstadoTenantAction("t1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockTenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { estado: "SUSPENDIDO" } });
  });

  it("rejects an estado value outside the fixed enum", async () => {
    const formData = new FormData();
    formData.set("estado", "BORRADO");

    const result = await cambiarEstadoTenantAction("t1", initialState, formData);

    expect(result.error).toBe("Estado inválido");
    expect(mockTenantUpdate).not.toHaveBeenCalled();
  });
});

describe("cambiarPlanTenantAction", () => {
  it("reassigns a tenant's plan", async () => {
    mockTenantUpdate.mockResolvedValue({ id: "t1", planId: "plan_estandar" });
    const formData = new FormData();
    formData.set("planId", "plan_estandar");

    const result = await cambiarPlanTenantAction("t1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockTenantUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { planId: "plan_estandar" } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/actions/super-admin-actions.test.ts`
Expected: FAIL — `Cannot find module './super-admin-actions'`.

- [ ] **Step 3: Write `super-admin-actions.ts`**

Create `src/app/actions/super-admin-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { publicDb } from "@/lib/db/public-client";
import type { Plan, Prisma } from "@/generated/prisma-public";

export interface SuperAdminFormState {
  error: string | null;
  success: boolean;
}

const TENANT_CON_PLAN_INCLUDE = { plan: true } satisfies Prisma.TenantInclude;
export type TenantConPlan = Prisma.TenantGetPayload<{ include: typeof TENANT_CON_PLAN_INCLUDE }>;

export async function listTenantsConPlan(): Promise<TenantConPlan[]> {
  await requireSuperAdmin();
  return publicDb.tenant.findMany({ include: TENANT_CON_PLAN_INCLUDE, orderBy: { slug: "asc" } });
}

export async function listPlanes(): Promise<Plan[]> {
  await requireSuperAdmin();
  return publicDb.plan.findMany({ orderBy: { nombre: "asc" } });
}

export async function cambiarEstadoTenantAction(
  tenantId: string,
  prevState: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const estado = formData.get("estado");
  if (estado !== "ACTIVO" && estado !== "SUSPENDIDO") {
    return { error: "Estado inválido", success: false };
  }

  await requireSuperAdmin();

  await publicDb.tenant.update({ where: { id: tenantId }, data: { estado } });

  revalidatePath("/superadmin");
  return { error: null, success: true };
}

export async function cambiarPlanTenantAction(
  tenantId: string,
  prevState: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const planId = String(formData.get("planId") ?? "");
  if (!planId) {
    return { error: "Selecciona un plan", success: false };
  }

  await requireSuperAdmin();

  await publicDb.tenant.update({ where: { id: tenantId }, data: { planId } });

  revalidatePath("/superadmin");
  return { error: null, success: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/super-admin-actions.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Write the failing test for the dashboard's row component**

Create `src/app/superadmin/tenant-row-actions.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCambiarEstadoTenantAction = vi.fn();
const mockCambiarPlanTenantAction = vi.fn();
vi.mock("@/app/actions/super-admin-actions", () => ({
  cambiarEstadoTenantAction: (...args: unknown[]) => mockCambiarEstadoTenantAction(...args),
  cambiarPlanTenantAction: (...args: unknown[]) => mockCambiarPlanTenantAction(...args),
}));

import { TenantRowActions } from "./tenant-row-actions";

const PLANES = [
  { id: "plan_basico", nombre: "Básico" },
  { id: "plan_estandar", nombre: "Estándar" },
  { id: "plan_avanzado", nombre: "Avanzado" },
];

describe("TenantRowActions", () => {
  beforeEach(() => {
    mockCambiarEstadoTenantAction.mockReset().mockResolvedValue({ error: null, success: false });
    mockCambiarPlanTenantAction.mockReset().mockResolvedValue({ error: null, success: false });
  });

  it("offers 'Suspender' for an ACTIVO tenant and 'Activar' for a SUSPENDIDO one", () => {
    const { rerender } = render(
      <TenantRowActions tenantId="t1" estadoActual="ACTIVO" planIdActual="plan_basico" planes={PLANES} />,
    );
    expect(screen.getByRole("button", { name: "Suspender" })).toBeInTheDocument();

    rerender(<TenantRowActions tenantId="t1" estadoActual="SUSPENDIDO" planIdActual="plan_basico" planes={PLANES} />);
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();
  });

  it("submits the new plan when the select changes and the form is submitted", async () => {
    render(<TenantRowActions tenantId="t1" estadoActual="ACTIVO" planIdActual="plan_basico" planes={PLANES} />);

    await userEvent.selectOptions(screen.getByLabelText("Plan"), "plan_estandar");
    await userEvent.click(screen.getByRole("button", { name: "Guardar plan" }));

    expect(mockCambiarPlanTenantAction).toHaveBeenCalledWith("t1", expect.anything(), expect.any(FormData));
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run "src/app/superadmin/tenant-row-actions.test.tsx"`
Expected: FAIL — `Cannot find module './tenant-row-actions'`.

- [ ] **Step 7: Write `tenant-row-actions.tsx` and the dashboard page**

Create `src/app/superadmin/tenant-row-actions.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  cambiarEstadoTenantAction,
  cambiarPlanTenantAction,
  type SuperAdminFormState,
} from "@/app/actions/super-admin-actions";

const initialState: SuperAdminFormState = { error: null, success: false };

export function TenantRowActions({
  tenantId,
  estadoActual,
  planIdActual,
  planes,
}: {
  tenantId: string;
  estadoActual: "ACTIVO" | "SUSPENDIDO";
  planIdActual: string;
  planes: { id: string; nombre: string }[];
}) {
  const cambiarEstadoDeEsteTenant = cambiarEstadoTenantAction.bind(null, tenantId);
  const cambiarPlanDeEsteTenant = cambiarPlanTenantAction.bind(null, tenantId);
  const [estadoState, estadoFormAction, estadoPending] = useActionState(cambiarEstadoDeEsteTenant, initialState);
  const [planState, planFormAction, planPending] = useActionState(cambiarPlanDeEsteTenant, initialState);

  const nuevoEstado = estadoActual === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO";

  return (
    <>
      <form action={estadoFormAction}>
        <input type="hidden" name="estado" value={nuevoEstado} />
        <button type="submit" disabled={estadoPending}>
          {estadoActual === "ACTIVO" ? "Suspender" : "Activar"}
        </button>
        {estadoState.error ? <p role="alert">{estadoState.error}</p> : null}
      </form>

      <form action={planFormAction}>
        <label htmlFor={`plan-${tenantId}`}>Plan</label>
        <select id={`plan-${tenantId}`} name="planId" defaultValue={planIdActual}>
          {planes.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.nombre}
            </option>
          ))}
        </select>
        <button type="submit" disabled={planPending}>
          Guardar plan
        </button>
        {planState.error ? <p role="alert">{planState.error}</p> : null}
      </form>
    </>
  );
}
```

Create `src/app/superadmin/page.tsx`:

```tsx
import { listTenantsConPlan, listPlanes } from "@/app/actions/super-admin-actions";
import { TenantRowActions } from "./tenant-row-actions";

export default async function SuperAdminPage() {
  const [tenants, planes] = await Promise.all([listTenantsConPlan(), listPlanes()]);

  return (
    <main>
      <h1>Talleres</h1>
      <table>
        <thead>
          <tr>
            <th>Taller</th>
            <th>Estado</th>
            <th>Plan</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id}>
              <td>{tenant.slug}</td>
              <td>{tenant.estado}</td>
              <td>{tenant.plan.nombre}</td>
              <td>
                <TenantRowActions
                  tenantId={tenant.id}
                  estadoActual={tenant.estado}
                  planIdActual={tenant.planId}
                  planes={planes}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run "src/app/superadmin/tenant-row-actions.test.tsx"`
Expected: PASS, both tests green.

- [ ] **Step 9: Run the full unit suite and typecheck**

Run: `npx vitest run`
Expected: PASS, no regressions (the known `tenant-client.test.ts`/`provision-tenant.test.ts` shared-schema concurrency flake, if it appears, is pre-existing — confirm clean in isolation, don't treat as new).

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add src/app/actions/super-admin-actions.ts src/app/actions/super-admin-actions.test.ts src/app/superadmin/page.tsx src/app/superadmin/tenant-row-actions.tsx "src/app/superadmin/tenant-row-actions.test.tsx"
git commit -m "fase9-task 10: add super-admin dashboard (tenant estado + plan management)"
git push origin main
```

---

### Task 11: e2e coverage — usuario CRUD and the super-admin flow

**Files:**
- Modify: `e2e/tenant-flow.spec.ts`
- Create: `e2e/super-admin-flow.spec.ts`

**Interfaces:**
- Consumes: everything built in Tasks 1–10.
- Produces: nothing (final task of the phase).

- [ ] **Step 1: Extend `e2e/tenant-flow.spec.ts` with usuario CRUD**

Add, after the existing `/usuarios` sede-assignment section of the shared flow (locate it by its `"Sedes actualizadas"` assertion from Fase 6 Task 12, per the ledger): ADMIN navigates to `/usuarios/nuevo`, creates a TECNICO usuario, confirms it appears in the list; ADMIN navigates to that usuario's `/usuarios/[id]`, changes the role to RECEPCION, confirms the change; ADMIN deletes that usuario, confirms it's gone from the list. Write the exact `page.getByLabel(...)`/`page.getByRole(...)` calls by reading the current `/usuarios` list page's rendered markup first (from Task 5's Step 9 change) — do not guess selector text.

- [ ] **Step 2: Write `e2e/super-admin-flow.spec.ts`**

A new, separate spec, deliberately **not** sharing `tenant-flow.spec.ts`'s `taller-e2e-smoke` tenant or its `e2e/global-setup.ts`. Two independent reasons: (a) it's a completely different auth realm/domain, so nothing in the shared setup helps it; (b) `playwright.config.ts` has `fullyParallel: false` but not `workers: 1` (confirmed by the earlier run's "Running 2 tests using 2 workers" — `landing.spec.ts` and `tenant-flow.spec.ts` ran concurrently), so a `super-admin-flow.spec.ts` that *suspended* the shared tenant could race `tenant-flow.spec.ts`'s own 25-route walk through it, mid-run, from a different worker. This spec provisions its own small, disposable tenant instead — exactly the same primitives `e2e/global-setup.ts` uses (`provisionTenant`/`seedTenantUser`), just called directly, not shared:

```ts
import { test, expect } from "@playwright/test";
import { provisionTenant } from "../scripts/provision-tenant";
import { seedTenantUser } from "../scripts/seed-tenant-user";
import { seedSuperAdmin } from "../scripts/seed-super-admin";
import { publicDb } from "../src/lib/db/public-client";

const SLUG = "taller-e2e-superadmin";
const SCHEMA = "taller_e2e_superadmin";
const TENANT_ADMIN_EMAIL = "admin@e2e-superadmin.test";
const TENANT_ADMIN_PASSWORD = "SmokeTest123!";
const SUPERADMIN_EMAIL = "e2e-superadmin@torqueflow.test";
const SUPERADMIN_PASSWORD = "clave-e2e-super-segura";

test.beforeAll(async () => {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: SLUG } });

  await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
  await seedTenantUser({
    schemaName: SCHEMA,
    email: TENANT_ADMIN_EMAIL,
    password: TENANT_ADMIN_PASSWORD,
    nombre: "Admin E2E Superadmin",
    role: "ADMIN",
  });
  await seedSuperAdmin({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD, nombre: "E2E Owner" });
});

test.afterAll(async () => {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
  await publicDb.superAdmin.deleteMany({ where: { email: SUPERADMIN_EMAIL } });
});

test("super-admin logs in, suspends a tenant, confirms the tenant's login is blocked, then reactivates it and changes its plan", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/superadmin/login");
  await page.getByLabel("Correo").fill(SUPERADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(SUPERADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/superadmin$/);

  await expect(page.getByRole("heading", { name: "Talleres" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: SLUG });
  await expect(row.getByRole("cell", { name: "Básico" })).toBeVisible();

  await row.getByRole("button", { name: "Suspender" }).click();
  await expect(row.getByRole("button", { name: "Activar" })).toBeVisible();

  // A suspended tenant's own login must fail the same way wrong credentials
  // would -- this phase's design decision 7, no distinct message.
  await page.goto(`http://${SLUG}.localhost:3000/login`);
  await page.getByLabel("Correo").fill(TENANT_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(TENANT_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Correo, contraseña o sede incorrectos");

  await page.goto("http://localhost:3000/superadmin");
  await row.getByRole("button", { name: "Activar" }).click();
  await expect(row.getByRole("button", { name: "Suspender" })).toBeVisible();

  await row.getByLabel("Plan").selectOption({ label: "Estándar" });
  await row.getByRole("button", { name: "Guardar plan" }).click();
  await expect(row.getByRole("cell", { name: "Estándar" })).toBeVisible();

  // Reactivated: the tenant's own login must work again.
  await page.goto(`http://${SLUG}.localhost:3000/login`);
  await page.getByLabel("Correo").fill(TENANT_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(TENANT_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
});
```

Before finalizing, confirm the login page's error alert text against `src/app/login/login-form.tsx`'s actual current string ("Correo, contraseña o sede incorrectos" as of Fase 6) and the `/superadmin` table's exact cell text (Task 10's `page.tsx` renders `tenant.plan.nombre` directly, so `getByRole("cell", { name: "Básico" })` matches verbatim) — both are read directly above in this same plan, not guessed.

- [ ] **Step 3: Run both e2e specs**

Run: `npx playwright test e2e/tenant-flow.spec.ts e2e/super-admin-flow.spec.ts`
Expected: PASS. If a failure looks like Playwright config/global-setup wiring rather than application logic, stop and report per RULES.md §1 — do not iterate blindly.

- [ ] **Step 4: Run the full unit suite one last time and typecheck**

Run: `npx vitest run`
Run: `npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add e2e/tenant-flow.spec.ts e2e/super-admin-flow.spec.ts
git commit -m "fase9-task 11: add e2e coverage for usuario CRUD and the super-admin flow"
git push origin main
```

---

## Self-review notes

- **Spec coverage:** módulo 10 (Task 3–5), módulo 11 (Task 6–8, 10), §9 plan mechanism + numeric enforcement (Task 1–2, 4), §10 (precio left an explicit nullable placeholder, Task 1; maxUsuarios/maxSedes locked to the design doc's own suggested defaults, Task 1) are each covered by a task. The user's four confirmed decisions (dedicated SuperAdmin table, numeric-only gating, placeholder pricing, design-doc-default limits) are each a numbered "Design decision locked in."
- **Type consistency checked:** `LimitesPlan` (Task 2) is consumed identically by `createSedeAction` (Task 2) and `createUsuarioAction` (Task 4) — same `{ maxUsuarios, maxSedes }` shape, same `!== null` guard idiom. `SuperAdminSession` (Task 7) is the only type any Task 10 action or Task 8 form touches for the super-admin identity — no file imports `Session` from `"next-auth"` for the super-admin realm. `ResolvedTenant.estado` (Task 9) and `Tenant.estado`'s Prisma enum (Task 1) use the identical two literal strings.
- **No placeholders:** every step has complete, runnable code. The one place this plan explicitly defers a mechanical detail to implementation-time (Task 7 Step 11's `next-auth` beta-version type check, and Task 11's selector-text-from-real-markup instructions) is flagged as a verification gate with a concrete fallback instruction ("check the installed types," "read the file first"), not a vague "handle it later" — consistent with this project's own AGENTS.md directive to verify against installed package sources rather than assume.
