# Fase 7 — Agendamiento de Citas + Recordatorios de Mantenimiento Preventivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add staff-managed, sede-scoped appointment booking (`Cita`) and real SMTP-delivered preventive-maintenance reminders (per-tenant SMTP config with an encrypted password, a pure due-date rule, and a secret-gated cron endpoint that sweeps every tenant).

**Architecture:** Citas follow the exact Fase 6 sede-isolation pattern already used by Órdenes — a new `scopeCita()` in `src/lib/sede/scope.ts`, `findFirst`/`updateMany`/`deleteMany` everywhere, `session.user.sedeActivaId` from `requireSession()`. Reminders are a platform-level job, not a session-scoped one: a protected route `GET /api/cron/recordatorios` authenticates a shared secret, enumerates tenants from `publicDb.tenant`, and for each tenant reads its own `ConfiguracionSmtp` row (SMTP password encrypted at rest with AES-256-GCM under a master key in `.env`), evaluates a pure due-date rule per vehicle, sends via Nodemailer, and writes a `RecordatorioEnviado` audit row that also serves as the de-duplication cooldown. Every layer is split so the domain rule and the orchestration are DB-free and unit-testable: `mantenimiento.ts` (pure math), `ejecutar-recordatorios.ts` (orchestration over an injected gateway), `gateway-prisma.ts` (the only Prisma-aware piece), `route.ts` (auth + wiring only).

**Tech Stack:** Next.js 16.3.0 (App Router, Server Actions), React 19.2.8, Prisma 6.19.3 (PostgreSQL, one schema per tenant), NextAuth 5 beta, Zod 4.4.3, Nodemailer (new), Node `crypto` (AES-256-GCM), Vitest 4 (jsdom), Playwright 1.62.

## Global Constraints

- **Guard chokepoint:** every server action and every page calls `requireSession()` or `requireRole([...])` from `src/lib/auth/guards.ts` **first, unconditionally, never inside a `try`/`catch`**. `requireSession()` already guarantees `session.user.sedeActivaId` is a non-empty string (Fase 6 fix) — never write a fallback for it, never re-derive a sede.
  - **Deliberate deviation from older files:** Fases 2–4 parse the FormData *before* calling the guard (documented as a Minor convention item in the ledger). All new Fase 7 action files call the guard **before** parsing. Do not "fix" the old files — RULES.md §7 forbids touching prior-phase backlog.
- **Sede isolation:** any read of a sede-owned row is `findFirst({ where: { id, ...scopeCita(session.user.sedeActivaId) } })` — never `findUnique`. Any write is `updateMany`/`deleteMany` with the same spread plus a `count === 0` check. `Cliente` and `Vehiculo` stay tenant-wide on purpose (design doc §5 módulo 12: "Clientes y vehículos siguen compartidos a nivel de tenant").
- **Prisma naming:** camelCase Prisma fields, snake_case columns via `@map`, `@@map("tabla_en_plural")`, `cuid()` ids, `createdAt`/`updatedAt` mapped to `created_at`/`updated_at`.
- **Zod quirk (established, do not re-derive):** every required string read from FormData must use `formData.get("campo") ?? ""`. With a bare `formData.get(...)`, an absent field yields `null` and zod 4.4.3 emits its generic type error instead of the custom Spanish message.
- **Zod dates:** do **not** use `z.coerce.date()`. Use `z.string().min(1, ...).refine(...).transform((v) => new Date(v))` so the custom Spanish message survives across zod 4.x patch versions.
- **User-facing copy is Spanish.** Code, comments, identifiers, and test names are English-or-Spanish following the file's existing convention (domain nouns stay Spanish: `cita`, `sede`, `recordatorio`).
- **Fixed global constants, NOT configurable per tenant:** `UMBRAL_KM = 5000`, `UMBRAL_MESES = 6`, `COOLDOWN_RECORDATORIO_DIAS = 90`. No config table for the rule itself.
- **Out of scope, do not build:** public/unauthenticated booking page, WhatsApp/SMS, SendGrid/SES/Resend or any external email provider, HTML templating engines, `Plan`/`maxSedes` billing tiers (deferred to Fase 9).
- **Commits:** one commit per task, message format `fase7-task N: descripción breve`, pushed to `main` immediately (RULES.md §3). No branch, no PR — this project commits direct to main.
- **Verification cadence (RULES.md §4):** run `npx tsc --noEmit` and `npm test` only at the end of a task, not during.
- **No automatic retries (RULES.md §1):** if a command or test fails twice, stop and report.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `prisma/tenant/migrations/20260821210000_add_citas_smtp_recordatorios/migration.sql` | The three new tables + two new enums |
| `src/lib/crypto/secret-box.ts` (+ `.test.ts`) | AES-256-GCM encrypt/decrypt of one secret string under `SMTP_ENCRYPTION_KEY` |
| `src/lib/email/smtp-config.ts` (+ `.test.ts`) | The singleton row id, the stored/decrypted config shapes, `descifrarConfiguracionSmtp` |
| `src/lib/email/enviar-email.ts` (+ `.test.ts`) | The only Nodemailer-aware module: build a transport, send one message |
| `src/lib/validation/cita.ts` (+ `.test.ts`) | Zod schemas for cita create/update and estado change |
| `src/lib/validation/smtp.ts` (+ `.test.ts`) | Zod schema for the SMTP config form |
| `src/app/actions/cita-actions.ts` (+ `.test.ts`) | Sede-scoped, IDOR-safe Cita CRUD |
| `src/app/actions/smtp-actions.ts` (+ `.test.ts`) | ADMIN-only SMTP config read/save/test |
| `src/app/(dashboard)/citas/page.tsx` | Citas list (server component) |
| `src/app/(dashboard)/citas/nueva-cita-form.tsx` (+ `.test.tsx`) | Booking form |
| `src/app/(dashboard)/citas/[id]/page.tsx` | Cita detail — the direct-URL IDOR boundary |
| `src/app/(dashboard)/citas/[id]/cambiar-estado-cita-form.tsx` (+ `.test.tsx`) | Estado change form |
| `src/app/(dashboard)/configuracion-smtp/page.tsx` | ADMIN-only SMTP settings page |
| `src/app/(dashboard)/configuracion-smtp/configuracion-smtp-form.tsx` (+ `.test.tsx`) | SMTP settings form + test-send button |
| `src/lib/recordatorios/mantenimiento.ts` (+ `.test.ts`) | Pure 5000 km / 6 month "whichever comes first" rule |
| `src/lib/recordatorios/plantilla.ts` (+ `.test.ts`) | Plain-text + basic-HTML reminder body |
| `src/lib/recordatorios/ejecutar-recordatorios.ts` (+ `.test.ts`) | DB-free orchestrator over an injected gateway, partial-failure tolerant |
| `src/lib/recordatorios/gateway-prisma.ts` | The only Prisma-aware reminder module |
| `src/app/api/cron/recordatorios/route.ts` (+ `.test.ts`) | Shared-secret auth + wiring |

**Modified:** `prisma/tenant/schema.prisma`, `src/lib/sede/scope.ts` (+ `.test.ts`), `src/app/(dashboard)/layout.tsx`, `package.json`, `.env.example`, `e2e/global-setup.ts`, `e2e/tenant-flow.spec.ts`, `scripts/provision-tenant.test.ts`, `.superpowers/sdd/progress.md`.

---

## Design decisions locked in (do not re-derive)

1. **`ConfiguracionSmtp` is a singleton row, not a table of rows.** Primary key is a literal `id String @id @default("singleton")` plus a database `CHECK ("id" = 'singleton')` constraint. The tenant schema *is* the tenant boundary, so a second row would be meaningless; the CHECK makes "at most one" a database invariant rather than an application convention, and `upsert({ where: { id: CONFIGURACION_SMTP_ID } })` becomes trivially correct with no race.
2. **De-duplication is a `RecordatorioEnviado` log table, not a field on `Vehiculo`.** A field would answer only "when", losing which address was mailed and why. The log gives an audit trail per vehicle *and* per client, needs no migration on `Vehiculo`, and Fase 8 (order-status notifications) can reuse the same shape. The cooldown rule is: skip any vehicle with a `RecordatorioEnviado` row newer than `COOLDOWN_RECORDATORIO_DIAS` (90) days.
3. **Cron auth is a shared secret in an `Authorization: Bearer` header, compared with `timingSafeEqual` over SHA-256 digests of both sides.** Hashing first makes the two buffers equal-length so `timingSafeEqual` cannot throw on a length mismatch (which would itself leak the secret's length). An unset `CRON_SECRET` fails closed (401), never open. No session, no `requireSession()` — the caller is an external scheduler (Vercel Cron, system cron).
4. **The 6-month clock reads delivered `OrdenTrabajo` rows (`estado = ENTREGADA`, ordered by `entregadaAt`), not `HistorialVehiculo`.** `HistorialVehiculo` is free text with no service-type field and a `fecha` that defaults to `now()`, so a note typed months later is indistinguishable from a service; an `ENTREGADA` orden with a non-null `entregadaAt` is a structurally guaranteed "this shop delivered work on this date". It is also the row that carries `kilometrajeIngreso`, so both halves of the rule read one consistent source instead of two that can disagree.
5. **The km half of the rule is a projection, because no model stores a vehicle's current odometer.** From the two most recent delivered órdenes we derive `kmPorDia = (kmÚltimo − kmAnterior) / díasEntreLecturas` and project the date the vehicle reaches +5000 km. With fewer than two readings, or a non-positive rate, the km branch simply does not fire and only the 6-month branch applies. "Whichever comes first" is then implemented literally: compute both due dates and take the earlier one.
6. **`mantenimiento.ts` stays Prisma-free**, exactly like `scope.ts`: it exports a `MotivoMantenimiento = "KILOMETRAJE" | "TIEMPO"` string union that structurally matches the generated `MotivoRecordatorio` Prisma enum, so the gateway can assign it directly without an import or a cast.
7. **Roles:** reading the agenda is `requireSession()` (a técnico must see what is coming into their sede). Booking and editing are `requireRole(["ADMIN", "RECEPCION"])`. Changing estado — including cancelling — is also `["ADMIN", "RECEPCION"]`, because cancelling is ordinary front-desk work. **Hard delete is `["ADMIN"]` only**, matching the "structurally destructive ⇒ ADMIN-only" rule Fases 5 and 6 applied.
8. **e2e extends `e2e/tenant-flow.spec.ts` rather than adding a spec file.** The file is 399 lines — large but not unwieldy — and `playwright.config.ts` sets `fullyParallel: false` with a single shared `globalSetup` that provisions one tenant schema. A second spec would have to re-create a cliente, a vehículo and a second sede in that same shared schema and would collide with `tenant-flow`'s own "Sede norte". Appending reuses all of it with zero setup duplication and zero collision risk.

---

### Task 1: Prisma schema + migration for Cita, ConfiguracionSmtp, RecordatorioEnviado

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/20260821210000_add_citas_smtp_recordatorios/migration.sql`
- Test: `scripts/provision-tenant.test.ts` (append one test)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: generated Prisma types `Cita`, `EstadoCita` (`"PROGRAMADA" | "CONFIRMADA" | "CANCELADA" | "COMPLETADA"`), `ConfiguracionSmtp`, `RecordatorioEnviado`, `MotivoRecordatorio` (`"KILOMETRAJE" | "TIEMPO"`) from `@/generated/prisma-tenant`; tables `citas`, `configuracion_smtp`, `recordatorios_enviados`.

- [ ] **Step 1: Add the two enums to `prisma/tenant/schema.prisma`**

Insert immediately after the existing `EstadoOrden` enum block (which ends at the line `}` following `ANULADA`):

```prisma
enum EstadoCita {
  PROGRAMADA
  CONFIRMADA
  CANCELADA
  COMPLETADA
}

enum MotivoRecordatorio {
  KILOMETRAJE
  TIEMPO
}
```

- [ ] **Step 2: Add the back-relations on the four existing models**

In `model Usuario`, add this line directly below `pagosRegistrados  Pago[]`:

```prisma
  citasCreadas      Cita[]              @relation("CitaCreadoPor")
```

In `model Cliente`, add these two lines directly below `facturas  Factura[]`:

```prisma
  citas         Cita[]
  recordatorios RecordatorioEnviado[]
```

In `model Vehiculo`, add these two lines directly below `ordenes   OrdenTrabajo[]`:

```prisma
  citas         Cita[]
  recordatorios RecordatorioEnviado[]
```

In `model Sede`, add this line directly below `usuarios  UsuarioSede[]`:

```prisma
  citas     Cita[]
```

- [ ] **Step 3: Append the three new models at the end of `prisma/tenant/schema.prisma`**

```prisma
/// A booked appointment. Staff-only in v1: RECEPCION/ADMIN book on behalf of a
/// customer who called or walked in — there is no public booking surface.
/// Carries its own sede_id (like OrdenTrabajo, unlike Repuesto) because an
/// appointment is made *at* a location; scopeCita() in src/lib/sede/scope.ts is
/// the single definition of that boundary.
model Cita {
  id          String     @id @default(cuid())
  clienteId   String     @map("cliente_id")
  cliente     Cliente    @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  vehiculoId  String     @map("vehiculo_id")
  vehiculo    Vehiculo   @relation(fields: [vehiculoId], references: [id], onDelete: Restrict)
  sedeId      String     @map("sede_id")
  sede        Sede       @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  fechaHora   DateTime   @map("fecha_hora")
  estado      EstadoCita @default(PROGRAMADA)
  motivo      String
  notas       String?
  creadoPorId String     @map("creado_por_id")
  creadoPor   Usuario    @relation("CitaCreadoPor", fields: [creadoPorId], references: [id], onDelete: Restrict)
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  @@map("citas")
  @@index([sedeId])
  @@index([clienteId])
  @@index([vehiculoId])
  @@index([fechaHora])
}

/// The tenant's own SMTP server. Exactly one row per tenant schema: the schema
/// IS the tenant boundary, so the id is a literal constant and the migration
/// adds a CHECK constraint enforcing it, making "at most one row" a database
/// invariant rather than an application convention.
///
/// password_cifrado is never plaintext: it is an AES-256-GCM envelope produced
/// by src/lib/crypto/secret-box.ts under the SMTP_ENCRYPTION_KEY master key.
model ConfiguracionSmtp {
  id              String   @id @default("singleton")
  host            String
  puerto          Int
  usuario         String
  passwordCifrado String   @map("password_cifrado")
  fromEmail       String   @map("from_email")
  fromNombre      String   @map("from_nombre")
  activo          Boolean  @default(true)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("configuracion_smtp")
}

/// One row per reminder email actually delivered. Doubles as the de-duplication
/// ledger: the reminder job skips any vehicle whose newest row here is younger
/// than COOLDOWN_RECORDATORIO_DIAS. A field on Vehiculo would answer only
/// "when"; this also records which address was mailed and which threshold
/// fired, and Fase 8's order-status notifications can reuse the same shape.
model RecordatorioEnviado {
  id           String             @id @default(cuid())
  vehiculoId   String             @map("vehiculo_id")
  vehiculo     Vehiculo           @relation(fields: [vehiculoId], references: [id], onDelete: Cascade)
  clienteId    String             @map("cliente_id")
  cliente      Cliente            @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  emailDestino String             @map("email_destino")
  motivo       MotivoRecordatorio
  enviadoAt    DateTime           @default(now()) @map("enviado_at")

  @@map("recordatorios_enviados")
  @@index([vehiculoId, enviadoAt])
  @@index([clienteId])
}
```

- [ ] **Step 4: Write the migration SQL**

Create `prisma/tenant/migrations/20260821210000_add_citas_smtp_recordatorios/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PROGRAMADA', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA');

-- CreateEnum
CREATE TYPE "MotivoRecordatorio" AS ENUM ('KILOMETRAJE', 'TIEMPO');

-- CreateTable
CREATE TABLE "citas" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoCita" NOT NULL DEFAULT 'PROGRAMADA',
    "motivo" TEXT NOT NULL,
    "notas" TEXT,
    "creado_por_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_smtp" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "host" TEXT NOT NULL,
    "puerto" INTEGER NOT NULL,
    "usuario" TEXT NOT NULL,
    "password_cifrado" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "from_nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_smtp_pkey" PRIMARY KEY ("id")
);

-- Enforce the singleton in the database, not just in application code: one
-- tenant schema means one SMTP server, and a second row would silently make
-- "which config does the reminder job use?" ambiguous.
ALTER TABLE "configuracion_smtp"
    ADD CONSTRAINT "configuracion_smtp_id_singleton" CHECK ("id" = 'singleton');

-- CreateTable
CREATE TABLE "recordatorios_enviados" (
    "id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "email_destino" TEXT NOT NULL,
    "motivo" "MotivoRecordatorio" NOT NULL,
    "enviado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordatorios_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "citas_sede_id_idx" ON "citas"("sede_id");

-- CreateIndex
CREATE INDEX "citas_cliente_id_idx" ON "citas"("cliente_id");

-- CreateIndex
CREATE INDEX "citas_vehiculo_id_idx" ON "citas"("vehiculo_id");

-- CreateIndex
CREATE INDEX "citas_fecha_hora_idx" ON "citas"("fecha_hora");

-- CreateIndex
CREATE INDEX "recordatorios_enviados_vehiculo_id_enviado_at_idx" ON "recordatorios_enviados"("vehiculo_id", "enviado_at");

-- CreateIndex
CREATE INDEX "recordatorios_enviados_cliente_id_idx" ON "recordatorios_enviados"("cliente_id");

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios_enviados" ADD CONSTRAINT "recordatorios_enviados_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios_enviados" ADD CONSTRAINT "recordatorios_enviados_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Write the failing test**

Append to `scripts/provision-tenant.test.ts`, inside the existing `describe("provisionTenant", () => { ... })` block, right after the `it("exposes the usuarioSede bridge table on a freshly provisioned tenant", ...)` test:

```ts
  it("exposes the citas, configuracion_smtp and recordatorios_enviados tables on a freshly provisioned tenant", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);

    expect(await tenantDb.cita.count()).toBe(0);
    expect(await tenantDb.configuracionSmtp.count()).toBe(0);
    expect(await tenantDb.recordatorioEnviado.count()).toBe(0);
  });

  it("refuses a second configuracion_smtp row: the singleton is a database invariant", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);
    await tenantDb.configuracionSmtp.create({
      data: {
        host: "smtp.taller.test",
        puerto: 587,
        usuario: "avisos@taller.test",
        passwordCifrado: "v1:aaa:bbb:ccc",
        fromEmail: "avisos@taller.test",
        fromNombre: "Taller",
      },
    });

    await expect(
      tenantDb.$executeRawUnsafe(
        `INSERT INTO "configuracion_smtp"
           ("id", "host", "puerto", "usuario", "password_cifrado", "from_email", "from_nombre", "updated_at")
         VALUES ('otra', 'x', 25, 'u', 'v1:a:b:c', 'e@t.test', 'T', CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toThrow();
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run scripts/provision-tenant.test.ts -t "citas, configuracion_smtp"`
Expected: FAIL — `tenantDb.cita` is `undefined` (the Prisma client has not been regenerated yet).

- [ ] **Step 7: Regenerate the Prisma client and apply the migration to the reference schema**

Run:

```bash
npx prisma generate --schema=prisma/tenant/schema.prisma
npx prisma migrate deploy --schema=prisma/tenant/schema.prisma
```

Expected: `generate` prints "Generated Prisma Client ... to ./src/generated/prisma-tenant"; `migrate deploy` prints "1 migration found" and "Applying migration `20260821210000_add_citas_smtp_recordatorios`".

If `migrate deploy` reports drift instead, STOP and report — do not run `migrate reset` (RULES.md §1).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations/20260821210000_add_citas_smtp_recordatorios/migration.sql scripts/provision-tenant.test.ts src/generated/prisma-tenant
git commit -m "fase7-task 1: add Cita, ConfiguracionSmtp and RecordatorioEnviado to the tenant schema"
git push origin main
```

If `src/generated/prisma-tenant` is gitignored, `git add` will say nothing was added for it — that is expected; commit the rest.

---

### Task 2: `scopeCita` — the sede boundary for citas

**Files:**
- Modify: `src/lib/sede/scope.ts`
- Test: `src/lib/sede/scope.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at the type level (this module is deliberately Prisma-type-free).
- Produces: `scopeCita(sedeActivaId: string): { sedeId: string }` — spread into every Cita `where` clause by Task 5.

- [ ] **Step 1: Write the failing test**

In `src/lib/sede/scope.test.ts`, change the import line to include `scopeCita`:

```ts
import { scopeBodega, scopeCita, scopeEntrada, scopeFactura, scopeOrden, scopeRepuesto } from "./scope";
```

And add this test inside the existing `describe("sede scope filters", ...)`, directly after the `scopeBodega` test:

```ts
  it("scopes citas on their own sedeId column, like órdenes", () => {
    expect(scopeCita("sede-1")).toEqual({ sedeId: "sede-1" });
  });

  it("returns a fresh scopeCita object each call so callers can safely spread and mutate", () => {
    expect(scopeCita("sede-1")).not.toBe(scopeCita("sede-1"));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/sede/scope.test.ts`
Expected: FAIL — `"./scope" has no exported member 'scopeCita'`.

- [ ] **Step 3: Add the function**

In `src/lib/sede/scope.ts`, insert directly after the `scopeOrden` function (keeping the direct-column functions together, before the inherited-sede ones):

```ts
/** Cita.sedeId is a required, indexed column -- an appointment is made *at* a sede. */
export function scopeCita(sedeActivaId: string): { sedeId: string } {
  return { sedeId: sedeActivaId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/sede/scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sede/scope.ts src/lib/sede/scope.test.ts
git commit -m "fase7-task 2: add scopeCita to the sede scope module"
git push origin main
```

---

### Task 3: SMTP secret encryption + the stored/decrypted config shapes

**Files:**
- Create: `src/lib/crypto/secret-box.ts`
- Create: `src/lib/crypto/secret-box.test.ts`
- Create: `src/lib/email/smtp-config.ts`
- Create: `src/lib/email/smtp-config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cifrarSecreto(textoPlano: string): string` — returns `v1:<ivB64>:<tagB64>:<cifradoB64>`
  - `descifrarSecreto(sobre: string): string`
  - `obtenerClaveMaestra(): Buffer`
  - `CONFIGURACION_SMTP_ID = "singleton"`
  - `interface ConfiguracionSmtpAlmacenada { host: string; puerto: number; usuario: string; passwordCifrado: string; fromEmail: string; fromNombre: string; activo: boolean }`
  - `interface SmtpConfigDescifrada { host: string; puerto: number; usuario: string; password: string; fromEmail: string; fromNombre: string }`
  - `descifrarConfiguracionSmtp(fila: ConfiguracionSmtpAlmacenada): SmtpConfigDescifrada`

These two files are one task because `smtp-config.ts` is the sole consumer of `secret-box.ts`; they share a single test cycle and a reviewer would accept or reject them together.

- [ ] **Step 1: Write the failing crypto test**

Create `src/lib/crypto/secret-box.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cifrarSecreto, descifrarSecreto, obtenerClaveMaestra } from "./secret-box";

const CLAVE_VALIDA = "0".repeat(63) + "1";
const OTRA_CLAVE = "f".repeat(64);
const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = CLAVE_VALIDA;
});

afterEach(() => {
  if (claveOriginal === undefined) {
    delete process.env.SMTP_ENCRYPTION_KEY;
  } else {
    process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
  }
});

describe("obtenerClaveMaestra", () => {
  it("rejects a missing SMTP_ENCRYPTION_KEY instead of defaulting to anything", () => {
    delete process.env.SMTP_ENCRYPTION_KEY;
    expect(() => obtenerClaveMaestra()).toThrow(/SMTP_ENCRYPTION_KEY/);
  });

  it("rejects a key that is not 64 hex characters", () => {
    process.env.SMTP_ENCRYPTION_KEY = "demasiado-corta";
    expect(() => obtenerClaveMaestra()).toThrow(/64 caracteres hexadecimales/);
  });

  it("returns 32 bytes for a valid key", () => {
    expect(obtenerClaveMaestra()).toHaveLength(32);
  });
});

describe("cifrarSecreto / descifrarSecreto", () => {
  it("round-trips a password unchanged", () => {
    const sobre = cifrarSecreto("sup3r-s3cr3t@!");
    expect(descifrarSecreto(sobre)).toBe("sup3r-s3cr3t@!");
  });

  it("round-trips non-ASCII characters unchanged", () => {
    const sobre = cifrarSecreto("contraseña-ñandú-€");
    expect(descifrarSecreto(sobre)).toBe("contraseña-ñandú-€");
  });

  it("never emits the plaintext in the envelope", () => {
    const sobre = cifrarSecreto("sup3r-s3cr3t@!");
    expect(sobre).not.toContain("sup3r-s3cr3t@!");
  });

  it("produces a different envelope every call (random IV), both decrypting correctly", () => {
    const a = cifrarSecreto("misma-clave");
    const b = cifrarSecreto("misma-clave");
    expect(a).not.toBe(b);
    expect(descifrarSecreto(a)).toBe("misma-clave");
    expect(descifrarSecreto(b)).toBe("misma-clave");
  });

  it("uses a versioned four-part envelope", () => {
    const partes = cifrarSecreto("x").split(":");
    expect(partes).toHaveLength(4);
    expect(partes[0]).toBe("v1");
  });

  it("refuses an envelope that was tampered with (GCM auth tag)", () => {
    const partes = cifrarSecreto("sup3r-s3cr3t@!").split(":");
    const cifradoAlterado = Buffer.from(partes[3], "base64");
    cifradoAlterado[0] = cifradoAlterado[0] ^ 0xff;
    const sobreAlterado = [partes[0], partes[1], partes[2], cifradoAlterado.toString("base64")].join(":");

    expect(() => descifrarSecreto(sobreAlterado)).toThrow();
  });

  it("refuses an envelope encrypted under a different master key", () => {
    const sobre = cifrarSecreto("sup3r-s3cr3t@!");
    process.env.SMTP_ENCRYPTION_KEY = OTRA_CLAVE;

    expect(() => descifrarSecreto(sobre)).toThrow();
  });

  it("refuses a malformed envelope", () => {
    expect(() => descifrarSecreto("no-es-un-sobre")).toThrow(/Formato de secreto cifrado inválido/);
    expect(() => descifrarSecreto("v2:a:b:c")).toThrow(/Formato de secreto cifrado inválido/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/crypto/secret-box.test.ts`
Expected: FAIL — `Failed to resolve import "./secret-box"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/crypto/secret-box.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for the one secret this app stores at rest: each
 * tenant's SMTP password. AES-256-GCM is authenticated encryption, so a
 * tampered ciphertext fails loudly at decrypt time instead of yielding
 * garbage that would then be handed to an SMTP server.
 *
 * The envelope is "v1:<iv>:<authTag>:<ciphertext>", all base64. Base64's
 * alphabet never contains ":", so splitting on ":" is unambiguous. The "v1"
 * prefix exists so a future algorithm change can be detected rather than
 * silently mis-decrypted.
 *
 * The master key lives in SMTP_ENCRYPTION_KEY (.env), never in the database:
 * that is the whole point -- a database dump alone must not yield working SMTP
 * credentials. Rotating the key invalidates every stored password; each tenant
 * must then re-enter it from /configuracion-smtp.
 */
const ALGORITMO = "aes-256-gcm";
const LONGITUD_IV = 12;
const VERSION = "v1";
const LONGITUD_CLAVE_HEX = 64;

export function obtenerClaveMaestra(): Buffer {
  const hex = process.env.SMTP_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("SMTP_ENCRYPTION_KEY no está configurada");
  }
  if (hex.length !== LONGITUD_CLAVE_HEX || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("SMTP_ENCRYPTION_KEY debe ser 64 caracteres hexadecimales (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function cifrarSecreto(textoPlano: string): string {
  const clave = obtenerClaveMaestra();
  const iv = randomBytes(LONGITUD_IV);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), tag.toString("base64"), cifrado.toString("base64")].join(":");
}

export function descifrarSecreto(sobre: string): string {
  const clave = obtenerClaveMaestra();
  const partes = sobre.split(":");
  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error("Formato de secreto cifrado inválido");
  }

  const iv = Buffer.from(partes[1], "base64");
  const tag = Buffer.from(partes[2], "base64");
  const cifrado = Buffer.from(partes[3], "base64");

  const decipher = createDecipheriv(ALGORITMO, clave, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/crypto/secret-box.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Write the failing smtp-config test**

Create `src/lib/email/smtp-config.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  CONFIGURACION_SMTP_ID,
  descifrarConfiguracionSmtp,
  type ConfiguracionSmtpAlmacenada,
} from "./smtp-config";

const CLAVE_VALIDA = "0".repeat(63) + "1";
const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = CLAVE_VALIDA;
});

afterEach(() => {
  if (claveOriginal === undefined) {
    delete process.env.SMTP_ENCRYPTION_KEY;
  } else {
    process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
  }
});

function filaDePrueba(passwordPlano: string): ConfiguracionSmtpAlmacenada {
  return {
    host: "smtp.taller.test",
    puerto: 587,
    usuario: "avisos@taller.test",
    passwordCifrado: cifrarSecreto(passwordPlano),
    fromEmail: "avisos@taller.test",
    fromNombre: "Taller Pérez",
    activo: true,
  };
}

describe("CONFIGURACION_SMTP_ID", () => {
  it("is the literal singleton id the migration's CHECK constraint enforces", () => {
    expect(CONFIGURACION_SMTP_ID).toBe("singleton");
  });
});

describe("descifrarConfiguracionSmtp", () => {
  it("returns the row's fields with the password decrypted and the ciphertext dropped", () => {
    const resultado = descifrarConfiguracionSmtp(filaDePrueba("clave-del-taller"));

    expect(resultado).toEqual({
      host: "smtp.taller.test",
      puerto: 587,
      usuario: "avisos@taller.test",
      password: "clave-del-taller",
      fromEmail: "avisos@taller.test",
      fromNombre: "Taller Pérez",
    });
    expect(resultado).not.toHaveProperty("passwordCifrado");
    expect(resultado).not.toHaveProperty("activo");
  });

  it("propagates the decrypt failure instead of returning an empty password", () => {
    const fila = { ...filaDePrueba("clave"), passwordCifrado: "v1:a:b:c" };

    expect(() => descifrarConfiguracionSmtp(fila)).toThrow();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/email/smtp-config.test.ts`
Expected: FAIL — `Failed to resolve import "./smtp-config"`.

- [ ] **Step 7: Write the implementation**

Create `src/lib/email/smtp-config.ts`:

```ts
import { descifrarSecreto } from "@/lib/crypto/secret-box";

/**
 * The literal primary key of the one ConfiguracionSmtp row a tenant schema may
 * hold. The migration adds CHECK ("id" = 'singleton'), so this constant and the
 * database agree by construction and every read/write is an upsert on this id.
 */
export const CONFIGURACION_SMTP_ID = "singleton";

/** The row as it sits in the database: the password is an encrypted envelope. */
export interface ConfiguracionSmtpAlmacenada {
  host: string;
  puerto: number;
  usuario: string;
  passwordCifrado: string;
  fromEmail: string;
  fromNombre: string;
  activo: boolean;
}

/**
 * The shape the mail transport needs. Deliberately has no `passwordCifrado` and
 * no `activo`: a value of this type has already passed the "should we send at
 * all?" decision, and carrying the ciphertext alongside the plaintext would
 * invite logging both.
 */
export interface SmtpConfigDescifrada {
  host: string;
  puerto: number;
  usuario: string;
  password: string;
  fromEmail: string;
  fromNombre: string;
}

export function descifrarConfiguracionSmtp(fila: ConfiguracionSmtpAlmacenada): SmtpConfigDescifrada {
  return {
    host: fila.host,
    puerto: fila.puerto,
    usuario: fila.usuario,
    password: descifrarSecreto(fila.passwordCifrado),
    fromEmail: fila.fromEmail,
    fromNombre: fila.fromNombre,
  };
}
```

- [ ] **Step 8: Run both test files and typecheck**

Run: `npx vitest run src/lib/crypto src/lib/email && npx tsc --noEmit`
Expected: PASS, 15 tests; `tsc` silent.

- [ ] **Step 9: Commit**

```bash
git add src/lib/crypto/secret-box.ts src/lib/crypto/secret-box.test.ts src/lib/email/smtp-config.ts src/lib/email/smtp-config.test.ts
git commit -m "fase7-task 3: add AES-256-GCM secret box and the SMTP config shapes"
git push origin main
```

---

### Task 4: Zod validation schemas for Cita and SMTP config

**Files:**
- Create: `src/lib/validation/cita.ts`
- Create: `src/lib/validation/cita.test.ts`
- Create: `src/lib/validation/smtp.ts`
- Create: `src/lib/validation/smtp.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `citaInputSchema` → `CitaInput { vehiculoId: string; fechaHora: Date; motivo: string; notas?: string }`
  - `estadoCitaSchema` → `z.ZodEnum` over `"PROGRAMADA" | "CONFIRMADA" | "CANCELADA" | "COMPLETADA"`
  - `smtpConfigInputSchema` → `SmtpConfigInput { host: string; puerto: number; usuario: string; password?: string; fromEmail: string; fromNombre: string; activo: boolean }`

- [ ] **Step 1: Write the failing cita validation test**

Create `src/lib/validation/cita.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { citaInputSchema, estadoCitaSchema } from "./cita";

describe("citaInputSchema", () => {
  it("accepts a datetime-local value and converts it to a Date", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "2026-09-01T10:30",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.fechaHora).toBeInstanceOf(Date);
      expect(resultado.data.fechaHora.getFullYear()).toBe(2026);
      expect(resultado.data.motivo).toBe("Cambio de aceite");
    }
  });

  it("rejects a missing vehiculoId with the Spanish message", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "",
      fechaHora: "2026-09-01T10:30",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("Selecciona un vehículo");
    }
  });

  it("rejects an empty fechaHora with the Spanish message", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("La fecha y hora son obligatorias");
    }
  });

  it("rejects an unparseable fechaHora with the Spanish message", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "no-es-una-fecha",
      motivo: "Cambio de aceite",
      notas: "",
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("La fecha y hora no son válidas");
    }
  });

  it("rejects an empty motivo with the Spanish message", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "2026-09-01T10:30",
      motivo: "",
      notas: "",
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El motivo es obligatorio");
    }
  });

  it("tolerates an empty notas, since an untouched textarea submits an empty string", () => {
    const resultado = citaInputSchema.safeParse({
      vehiculoId: "veh-1",
      fechaHora: "2026-09-01T10:30",
      motivo: "Revisión",
      notas: "",
    });

    expect(resultado.success).toBe(true);
  });
});

describe("estadoCitaSchema", () => {
  it("accepts the four valid estados", () => {
    for (const estado of ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"]) {
      expect(estadoCitaSchema.safeParse(estado).success).toBe(true);
    }
  });

  it("rejects anything else, including an EstadoOrden value", () => {
    expect(estadoCitaSchema.safeParse("ENTREGADA").success).toBe(false);
    expect(estadoCitaSchema.safeParse("").success).toBe(false);
    expect(estadoCitaSchema.safeParse(null).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/validation/cita.test.ts`
Expected: FAIL — `Failed to resolve import "./cita"`.

- [ ] **Step 3: Write the cita schema**

Create `src/lib/validation/cita.ts`:

```ts
import { z } from "zod";

/**
 * The <input type="datetime-local"> value ("2026-09-01T10:30") is validated and
 * converted by hand rather than with z.coerce.date(). z.coerce.date()'s custom
 * error parameter changed shape across zod 4 minors, and this project has
 * already been bitten once by a zod message regression (see the ledger's Fase 3
 * `?? ""` note); Date.parse + refine + transform is version-proof and keeps the
 * Spanish message under our control.
 *
 * clienteId is NOT part of this schema on purpose: the action derives it from
 * the chosen vehículo, so a caller cannot post a vehículo belonging to one
 * cliente together with a different cliente's id.
 */
export const citaInputSchema = z.object({
  vehiculoId: z.string().min(1, "Selecciona un vehículo"),
  fechaHora: z
    .string()
    .min(1, "La fecha y hora son obligatorias")
    .refine((valor) => !Number.isNaN(Date.parse(valor)), "La fecha y hora no son válidas")
    .transform((valor) => new Date(valor)),
  motivo: z.string().min(1, "El motivo es obligatorio"),
  notas: z.string().optional().or(z.literal("")),
});

export type CitaInput = z.infer<typeof citaInputSchema>;

/** Mirrors the EstadoCita enum in prisma/tenant/schema.prisma. */
export const estadoCitaSchema = z.enum(["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"], {
  message: "Estado de cita inválido",
});

export type EstadoCitaInput = z.infer<typeof estadoCitaSchema>;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/validation/cita.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing SMTP validation test**

Create `src/lib/validation/smtp.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { smtpConfigInputSchema } from "./smtp";

const valido = {
  host: "smtp.taller.test",
  puerto: "587",
  usuario: "avisos@taller.test",
  password: "clave-del-taller",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
  activo: "on",
};

describe("smtpConfigInputSchema", () => {
  it("accepts a full form submission and coerces puerto to a number", () => {
    const resultado = smtpConfigInputSchema.safeParse(valido);

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.puerto).toBe(587);
      expect(resultado.data.activo).toBe(true);
    }
  });

  it("treats an absent checkbox value as activo=false", () => {
    const resultado = smtpConfigInputSchema.safeParse({ ...valido, activo: "" });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.activo).toBe(false);
    }
  });

  it("accepts an empty password, which the action reads as 'keep the stored one'", () => {
    const resultado = smtpConfigInputSchema.safeParse({ ...valido, password: "" });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.password).toBe("");
    }
  });

  it("rejects an empty host", () => {
    const resultado = smtpConfigInputSchema.safeParse({ ...valido, host: "" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El servidor SMTP es obligatorio");
    }
  });

  it("rejects a puerto outside 1-65535", () => {
    expect(smtpConfigInputSchema.safeParse({ ...valido, puerto: "0" }).success).toBe(false);
    expect(smtpConfigInputSchema.safeParse({ ...valido, puerto: "70000" }).success).toBe(false);
    expect(smtpConfigInputSchema.safeParse({ ...valido, puerto: "no-numero" }).success).toBe(false);
  });

  it("rejects a fromEmail that is not an email address", () => {
    const resultado = smtpConfigInputSchema.safeParse({ ...valido, fromEmail: "no-es-email" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0].message).toBe("El correo remitente no es válido");
    }
  });

  it("rejects an empty usuario and an empty fromNombre", () => {
    expect(smtpConfigInputSchema.safeParse({ ...valido, usuario: "" }).success).toBe(false);
    expect(smtpConfigInputSchema.safeParse({ ...valido, fromNombre: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/validation/smtp.test.ts`
Expected: FAIL — `Failed to resolve import "./smtp"`.

- [ ] **Step 7: Write the SMTP schema**

Create `src/lib/validation/smtp.ts`:

```ts
import { z } from "zod";

/**
 * The per-tenant SMTP server form.
 *
 * `password` is optional and tolerates "": the form never renders the stored
 * password back to the browser, so an ADMIN editing the host or port submits an
 * empty password field. The action reads "" as "keep whatever is stored" and
 * only refuses it when there is no stored row yet.
 *
 * `activo` is an HTML checkbox: present ("on") when checked, absent/"" when not.
 * z.literal("on") would reject the unchecked case, so it is parsed as a plain
 * string and mapped to a boolean.
 */
export const smtpConfigInputSchema = z.object({
  host: z.string().min(1, "El servidor SMTP es obligatorio"),
  puerto: z.coerce
    .number({ message: "El puerto debe ser un número" })
    .int("El puerto debe ser un número entero")
    .min(1, "El puerto debe estar entre 1 y 65535")
    .max(65535, "El puerto debe estar entre 1 y 65535"),
  usuario: z.string().min(1, "El usuario SMTP es obligatorio"),
  password: z.string().optional().or(z.literal("")),
  fromEmail: z.string().min(1, "El correo remitente es obligatorio").email("El correo remitente no es válido"),
  fromNombre: z.string().min(1, "El nombre del remitente es obligatorio"),
  activo: z.string().optional().transform((valor) => valor === "on" || valor === "true"),
});

export type SmtpConfigInput = z.infer<typeof smtpConfigInputSchema>;
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/lib/validation/smtp.test.ts`
Expected: PASS, 7 tests.

If `z.string().email()` emits a deprecation warning, ignore it — `proveedorInputSchema` already uses it and the ledger records it as accepted backlog, not a Fase 7 concern.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/validation/cita.ts src/lib/validation/cita.test.ts src/lib/validation/smtp.ts src/lib/validation/smtp.test.ts
git commit -m "fase7-task 4: add Zod schemas for citas and SMTP config"
git push origin main
```

---

### Task 5: Cita server actions — sede-scoped and IDOR-safe

**Files:**
- Create: `src/app/actions/cita-actions.ts`
- Create: `src/app/actions/cita-actions.test.ts`

**Interfaces:**
- Consumes: `scopeCita` (Task 2); `citaInputSchema`, `estadoCitaSchema` (Task 4); generated `Cita`/`EstadoCita`/`Prisma` types (Task 1); existing `requireSession`/`requireRole`, `getTenantDb`, `friendlyPrismaErrorMessage`.
- Produces:
  - `interface CitaFormState { error: string | null; success: boolean }`
  - `interface VehiculoOption { id: string; placa: string; marca: string; modelo: string; clienteNombre: string }`
  - `type CitaConDetalle` (Prisma payload with `cliente`, `vehiculo`, `creadoPor`)
  - `listCitas(estado?: EstadoCita): Promise<CitaConDetalle[]>`
  - `getCita(id: string): Promise<CitaConDetalle | null>`
  - `listVehiculosParaCita(): Promise<VehiculoOption[]>`
  - `createCitaAction(prevState: CitaFormState, formData: FormData): Promise<CitaFormState>`
  - `updateCitaAction(id: string, prevState: CitaFormState, formData: FormData): Promise<CitaFormState>`
  - `cambiarEstadoCitaAction(id: string, prevState: CitaFormState, formData: FormData): Promise<CitaFormState>`
  - `deleteCitaAction(id: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/app/actions/cita-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCitaFindMany = vi.fn();
const mockCitaFindFirst = vi.fn();
const mockCitaCreate = vi.fn();
const mockCitaUpdateMany = vi.fn();
const mockCitaDeleteMany = vi.fn();
const mockVehiculoFindMany = vi.fn();
const mockVehiculoFindUnique = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    cita: {
      findMany: mockCitaFindMany,
      findFirst: mockCitaFindFirst,
      create: mockCitaCreate,
      updateMany: mockCitaUpdateMany,
      deleteMany: mockCitaDeleteMany,
    },
    vehiculo: { findMany: mockVehiculoFindMany, findUnique: mockVehiculoFindUnique },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  cambiarEstadoCitaAction,
  createCitaAction,
  deleteCitaAction,
  getCita,
  listCitas,
  listVehiculosParaCita,
  updateCitaAction,
  type CitaFormState,
} from "./cita-actions";

const initialState: CitaFormState = { error: null, success: false };
const RECEPCION = {
  user: { id: "u-rec", role: "RECEPCION", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
};
const ADMIN = {
  user: { id: "u-adm", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
};

function formularioValido(): FormData {
  const formData = new FormData();
  formData.set("vehiculoId", "veh-1");
  formData.set("fechaHora", "2026-09-01T10:30");
  formData.set("motivo", "Cambio de aceite");
  formData.set("notas", "");
  return formData;
}

beforeEach(() => {
  mockRequireRole.mockReset().mockResolvedValue(RECEPCION);
  mockRequireSession.mockReset().mockResolvedValue(RECEPCION);
  mockCitaFindMany.mockReset().mockResolvedValue([]);
  mockCitaFindFirst.mockReset().mockResolvedValue(null);
  mockCitaCreate.mockReset().mockResolvedValue({ id: "cita-1" });
  mockCitaUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mockCitaDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  mockVehiculoFindMany.mockReset().mockResolvedValue([]);
  mockVehiculoFindUnique.mockReset().mockResolvedValue({ id: "veh-1", clienteId: "cli-1" });
});

describe("listCitas", () => {
  it("is readable by any authenticated role and filters by the sede activa", async () => {
    await listCitas();

    expect(mockRequireSession).toHaveBeenCalled();
    expect(mockCitaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sedeId: "sede-1" }, orderBy: { fechaHora: "asc" } }),
    );
  });

  it("adds the estado filter without dropping the sede filter", async () => {
    await listCitas("CONFIRMADA");

    expect(mockCitaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sedeId: "sede-1", estado: "CONFIRMADA" } }),
    );
  });
});

describe("getCita", () => {
  it("uses findFirst with the sede filter, never findUnique -- this is the IDOR boundary", async () => {
    await getCita("cita-1");

    expect(mockCitaFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cita-1", sedeId: "sede-1" } }),
    );
  });

  it("returns null for a cita in another sede", async () => {
    mockCitaFindFirst.mockResolvedValue(null);

    expect(await getCita("cita-de-otra-sede")).toBeNull();
  });
});

describe("listVehiculosParaCita", () => {
  it("is deliberately NOT sede-scoped: vehículos are tenant-wide", async () => {
    mockVehiculoFindMany.mockResolvedValue([
      { id: "veh-1", placa: "ABC123", marca: "Mazda", modelo: "3", cliente: { nombre: "Ana" } },
    ]);

    const resultado = await listVehiculosParaCita();

    expect(resultado).toEqual([
      { id: "veh-1", placa: "ABC123", marca: "Mazda", modelo: "3", clienteNombre: "Ana" },
    ]);
    const args = mockVehiculoFindMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
  });
});

describe("createCitaAction", () => {
  it("is limited to ADMIN and RECEPCION", async () => {
    await createCitaAction(initialState, formularioValido());

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("calls the guard before validating, so an invalid form from a forbidden role still redirects", async () => {
    mockRequireRole.mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));

    await expect(createCitaAction(initialState, new FormData())).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCitaCreate).not.toHaveBeenCalled();
  });

  it("stamps the sede activa and the creating user, and derives clienteId from the vehículo", async () => {
    const resultado = await createCitaAction(initialState, formularioValido());

    expect(resultado).toEqual({ error: null, success: true });
    expect(mockCitaCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "cli-1",
        vehiculoId: "veh-1",
        sedeId: "sede-1",
        fechaHora: new Date("2026-09-01T10:30"),
        motivo: "Cambio de aceite",
        notas: null,
        creadoPorId: "u-rec",
      },
    });
  });

  it("refuses a vehiculoId that does not exist", async () => {
    mockVehiculoFindUnique.mockResolvedValue(null);

    const resultado = await createCitaAction(initialState, formularioValido());

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe("El vehículo seleccionado no existe.");
    expect(mockCitaCreate).not.toHaveBeenCalled();
  });

  it("returns the Spanish validation message when motivo is missing", async () => {
    const formData = formularioValido();
    formData.delete("motivo");

    const resultado = await createCitaAction(initialState, formData);

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe("El motivo es obligatorio");
    expect(mockCitaCreate).not.toHaveBeenCalled();
  });
});

describe("updateCitaAction", () => {
  it("writes through updateMany carrying the sede filter, never update-by-id", async () => {
    const resultado = await updateCitaAction("cita-1", initialState, formularioValido());

    expect(resultado).toEqual({ error: null, success: true });
    expect(mockCitaUpdateMany).toHaveBeenCalledWith({
      where: { id: "cita-1", sedeId: "sede-1" },
      data: {
        vehiculoId: "veh-1",
        clienteId: "cli-1",
        fechaHora: new Date("2026-09-01T10:30"),
        motivo: "Cambio de aceite",
        notas: null,
      },
    });
  });

  it("reports a not-found instead of silently succeeding when the cita is in another sede", async () => {
    mockCitaUpdateMany.mockResolvedValue({ count: 0 });

    const resultado = await updateCitaAction("cita-ajena", initialState, formularioValido());

    expect(resultado).toEqual({ error: "Cita no encontrada", success: false });
  });
});

describe("cambiarEstadoCitaAction", () => {
  it("is limited to ADMIN and RECEPCION and writes through updateMany with the sede filter", async () => {
    const formData = new FormData();
    formData.set("estado", "CANCELADA");

    const resultado = await cambiarEstadoCitaAction("cita-1", initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(resultado).toEqual({ error: null, success: true });
    expect(mockCitaUpdateMany).toHaveBeenCalledWith({
      where: { id: "cita-1", sedeId: "sede-1" },
      data: { estado: "CANCELADA" },
    });
  });

  it("rejects an estado that is not part of EstadoCita", async () => {
    const formData = new FormData();
    formData.set("estado", "ENTREGADA");

    const resultado = await cambiarEstadoCitaAction("cita-1", initialState, formData);

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe("Estado de cita inválido");
    expect(mockCitaUpdateMany).not.toHaveBeenCalled();
  });

  it("reports a not-found when the cita belongs to another sede", async () => {
    mockCitaUpdateMany.mockResolvedValue({ count: 0 });
    const formData = new FormData();
    formData.set("estado", "CONFIRMADA");

    const resultado = await cambiarEstadoCitaAction("cita-ajena", initialState, formData);

    expect(resultado).toEqual({ error: "Cita no encontrada", success: false });
  });
});

describe("deleteCitaAction", () => {
  it("is ADMIN-only, stricter than booking", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);

    await deleteCitaAction("cita-1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockCitaDeleteMany).toHaveBeenCalledWith({ where: { id: "cita-1", sedeId: "sede-1" } });
  });

  it("throws instead of silently doing nothing when the cita is in another sede", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    mockCitaDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteCitaAction("cita-ajena")).rejects.toThrow("Cita no encontrada");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/actions/cita-actions.test.ts`
Expected: FAIL — `Failed to resolve import "./cita-actions"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/actions/cita-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { citaInputSchema, estadoCitaSchema } from "@/lib/validation/cita";
import { scopeCita } from "@/lib/sede/scope";
import type { EstadoCita, Prisma } from "@/generated/prisma-tenant";

export interface CitaFormState {
  error: string | null;
  success: boolean;
}

export interface VehiculoOption {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  clienteNombre: string;
}

const CITA_DETALLE_INCLUDE = {
  cliente: { select: { id: true, nombre: true, telefono: true, email: true } },
  vehiculo: { select: { id: true, placa: true, marca: true, modelo: true } },
  creadoPor: { select: { id: true, nombre: true } },
} satisfies Prisma.CitaInclude;

export type CitaConDetalle = Prisma.CitaGetPayload<{ include: typeof CITA_DETALLE_INCLUDE }>;

const NO_ENCONTRADA = "Cita no encontrada";

function parseCitaFormData(formData: FormData) {
  return citaInputSchema.safeParse({
    vehiculoId: formData.get("vehiculoId") ?? "",
    fechaHora: formData.get("fechaHora") ?? "",
    motivo: formData.get("motivo") ?? "",
    notas: formData.get("notas") ?? "",
  });
}

function revalidarCitas(id?: string): void {
  revalidatePath("/citas");
  if (id) {
    revalidatePath(`/citas/${id}`);
  }
}

/**
 * The agenda is readable by every authenticated role: a técnico needs to know
 * what is arriving at their sede today, even though they cannot book.
 */
export async function listCitas(estado?: EstadoCita): Promise<CitaConDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.cita.findMany({
    where: { ...scopeCita(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: CITA_DETALLE_INCLUDE,
    orderBy: { fechaHora: "asc" },
  });
}

export async function getCita(id: string): Promise<CitaConDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // findFirst, not findUnique: findUnique cannot carry the sede filter, so an id
  // from another sede would resolve. This is the IDOR boundary.
  return tenantDb.cita.findFirst({
    where: { id, ...scopeCita(session.user.sedeActivaId) },
    include: CITA_DETALLE_INCLUDE,
  });
}

/**
 * Deliberately NOT sede-scoped. Clientes and vehículos are tenant-wide by
 * design (design doc §5, módulo 12): the same customer may bring the same car
 * to any sede of the same taller, so any sede must be able to book it.
 */
export async function listVehiculosParaCita(): Promise<VehiculoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const vehiculos = await tenantDb.vehiculo.findMany({
    select: {
      id: true,
      placa: true,
      marca: true,
      modelo: true,
      cliente: { select: { nombre: true } },
    },
    orderBy: { placa: "asc" },
  });

  return vehiculos.map((vehiculo) => ({
    id: vehiculo.id,
    placa: vehiculo.placa,
    marca: vehiculo.marca,
    modelo: vehiculo.modelo,
    clienteNombre: vehiculo.cliente.nombre,
  }));
}

export async function createCitaAction(
  prevState: CitaFormState,
  formData: FormData,
): Promise<CitaFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);

  const parsed = parseCitaFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  // The cliente is derived from the vehículo, never taken from the form: that
  // makes "book vehicle X under client Y" unrepresentable.
  const vehiculo = await tenantDb.vehiculo.findUnique({
    where: { id: parsed.data.vehiculoId },
    select: { id: true, clienteId: true },
  });
  if (!vehiculo) {
    return { error: "El vehículo seleccionado no existe.", success: false };
  }

  try {
    await tenantDb.cita.create({
      data: {
        clienteId: vehiculo.clienteId,
        vehiculoId: vehiculo.id,
        sedeId: session.user.sedeActivaId,
        fechaHora: parsed.data.fechaHora,
        motivo: parsed.data.motivo,
        notas: parsed.data.notas || null,
        creadoPorId: session.user.id,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la cita"), success: false };
  }

  revalidarCitas();
  return { error: null, success: true };
}

export async function updateCitaAction(
  id: string,
  prevState: CitaFormState,
  formData: FormData,
): Promise<CitaFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);

  const parsed = parseCitaFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  const vehiculo = await tenantDb.vehiculo.findUnique({
    where: { id: parsed.data.vehiculoId },
    select: { id: true, clienteId: true },
  });
  if (!vehiculo) {
    return { error: "El vehículo seleccionado no existe.", success: false };
  }

  try {
    // updateMany, not update: update({ where: { id } }) accepts only unique
    // columns, so it cannot carry the sede filter and would write across sedes.
    const { count } = await tenantDb.cita.updateMany({
      where: { id, ...scopeCita(session.user.sedeActivaId) },
      data: {
        vehiculoId: vehiculo.id,
        clienteId: vehiculo.clienteId,
        fechaHora: parsed.data.fechaHora,
        motivo: parsed.data.motivo,
        notas: parsed.data.notas || null,
      },
    });
    if (count === 0) {
      return { error: NO_ENCONTRADA, success: false };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar la cita"), success: false };
  }

  revalidarCitas(id);
  return { error: null, success: true };
}

/**
 * Cancelling is ordinary front-desk work, so this stays ADMIN+RECEPCION. There
 * is no transition table (unlike EstadoOrden): an appointment can legitimately
 * move back from CONFIRMADA to PROGRAMADA when a customer reschedules by phone.
 */
export async function cambiarEstadoCitaAction(
  id: string,
  prevState: CitaFormState,
  formData: FormData,
): Promise<CitaFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);

  const parsed = estadoCitaSchema.safeParse(formData.get("estado") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Estado de cita inválido", success: false };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const { count } = await tenantDb.cita.updateMany({
      where: { id, ...scopeCita(session.user.sedeActivaId) },
      data: { estado: parsed.data },
    });
    if (count === 0) {
      return { error: NO_ENCONTRADA, success: false };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al cambiar el estado de la cita"), success: false };
  }

  revalidarCitas(id);
  return { error: null, success: true };
}

/**
 * ADMIN-only: deleting destroys the record that a customer was expected at a
 * given time. RECEPCION cancels (estado CANCELADA) instead, which is reversible
 * and auditable. Same "structurally destructive => ADMIN-only" rule Fases 5 and
 * 6 applied to reportes and sedes.
 */
export async function deleteCitaAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const { count } = await tenantDb.cita.deleteMany({
    where: { id, ...scopeCita(session.user.sedeActivaId) },
  });
  if (count === 0) {
    throw new Error(NO_ENCONTRADA);
  }

  revalidarCitas();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/actions/cita-actions.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/app/actions/cita-actions.ts src/app/actions/cita-actions.test.ts
git commit -m "fase7-task 5: add sede-scoped, IDOR-safe cita server actions"
git push origin main
```

---

### Task 6: SMTP configuration server actions (ADMIN-only)

**Files:**
- Create: `src/app/actions/smtp-actions.ts`
- Create: `src/app/actions/smtp-actions.test.ts`

**Interfaces:**
- Consumes: `cifrarSecreto` (Task 3), `CONFIGURACION_SMTP_ID`/`descifrarConfiguracionSmtp`/`SmtpConfigDescifrada` (Task 3), `smtpConfigInputSchema` (Task 4), `enviarEmail` (Task 10 — declared here as an import, so **Task 10 must land before this task's test can pass**; if executing strictly in order, see Step 0 below).
- Produces:
  - `interface SmtpFormState { error: string | null; success: boolean }`
  - `interface ConfiguracionSmtpVista { host: string; puerto: number; usuario: string; fromEmail: string; fromNombre: string; activo: boolean; passwordConfigurada: boolean }`
  - `getConfiguracionSmtp(): Promise<ConfiguracionSmtpVista | null>`
  - `guardarConfiguracionSmtpAction(prevState: SmtpFormState, formData: FormData): Promise<SmtpFormState>`
  - `probarConfiguracionSmtpAction(prevState: SmtpFormState, formData: FormData): Promise<SmtpFormState>`

- [ ] **Step 0: Dependency note — execute Task 10 first if you are running strictly sequentially**

This task imports `enviarEmail` from `@/lib/email/enviar-email`, which Task 10 creates. Two valid orders:
- Run Task 10 before Task 6 (recommended when executing sequentially), or
- Run Task 6 now and let its test mock `@/lib/email/enviar-email` (the test below does exactly that, so it passes in isolation), then let `npx tsc --noEmit` at the end of Task 10 confirm the real module exists.

If `tsc` fails at Step 5 below with "Cannot find module '@/lib/email/enviar-email'", stop and do Task 10 first, then return here — do not stub the module.

- [ ] **Step 1: Write the failing test**

Create `src/app/actions/smtp-actions.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    configuracionSmtp: { findUnique: mockFindUnique, upsert: mockUpsert },
  }),
}));

const mockEnviarEmail = vi.fn();
vi.mock("@/lib/email/enviar-email", () => ({
  enviarEmail: (...args: unknown[]) => mockEnviarEmail(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  getConfiguracionSmtp,
  guardarConfiguracionSmtpAction,
  probarConfiguracionSmtpAction,
  type SmtpFormState,
} from "./smtp-actions";

const CLAVE_VALIDA = "0".repeat(63) + "1";
const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;
const initialState: SmtpFormState = { error: null, success: false };
const ADMIN = {
  user: {
    id: "u-adm",
    email: "admin@taller.test",
    role: "ADMIN",
    tenantSchema: "taller_perez",
    sedeActivaId: "sede-1",
  },
};

function formularioValido(): FormData {
  const formData = new FormData();
  formData.set("host", "smtp.taller.test");
  formData.set("puerto", "587");
  formData.set("usuario", "avisos@taller.test");
  formData.set("password", "clave-del-taller");
  formData.set("fromEmail", "avisos@taller.test");
  formData.set("fromNombre", "Taller Pérez");
  formData.set("activo", "on");
  return formData;
}

function filaAlmacenada(passwordPlano = "clave-guardada") {
  return {
    id: "singleton",
    host: "smtp.viejo.test",
    puerto: 465,
    usuario: "viejo@taller.test",
    passwordCifrado: cifrarSecreto(passwordPlano),
    fromEmail: "viejo@taller.test",
    fromNombre: "Taller Viejo",
    activo: true,
  };
}

beforeEach(() => {
  process.env.SMTP_ENCRYPTION_KEY = CLAVE_VALIDA;
  mockRequireRole.mockReset().mockResolvedValue(ADMIN);
  mockFindUnique.mockReset().mockResolvedValue(null);
  mockUpsert.mockReset().mockResolvedValue({ id: "singleton" });
  mockEnviarEmail.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  if (claveOriginal === undefined) {
    delete process.env.SMTP_ENCRYPTION_KEY;
  } else {
    process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
  }
});

describe("getConfiguracionSmtp", () => {
  it("is ADMIN-only", async () => {
    await getConfiguracionSmtp();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("returns null when the tenant has never configured SMTP", async () => {
    expect(await getConfiguracionSmtp()).toBeNull();
  });

  it("never returns the password or its ciphertext, only whether one is stored", async () => {
    mockFindUnique.mockResolvedValue(filaAlmacenada());

    const vista = await getConfiguracionSmtp();

    expect(vista).toEqual({
      host: "smtp.viejo.test",
      puerto: 465,
      usuario: "viejo@taller.test",
      fromEmail: "viejo@taller.test",
      fromNombre: "Taller Viejo",
      activo: true,
      passwordConfigurada: true,
    });
    expect(JSON.stringify(vista)).not.toContain("clave-guardada");
    expect(JSON.stringify(vista)).not.toContain("v1:");
  });

  it("reads the singleton row by its literal id", async () => {
    await getConfiguracionSmtp();

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "singleton" } });
  });
});

describe("guardarConfiguracionSmtpAction", () => {
  it("is ADMIN-only and calls the guard before validating", async () => {
    mockRequireRole.mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));

    await expect(guardarConfiguracionSmtpAction(initialState, new FormData())).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("encrypts the password before writing and never stores it in plaintext", async () => {
    const resultado = await guardarConfiguracionSmtpAction(initialState, formularioValido());

    expect(resultado).toEqual({ error: null, success: true });
    const args = mockUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ id: "singleton" });
    expect(args.create.passwordCifrado).toMatch(/^v1:/);
    expect(args.create.passwordCifrado).not.toContain("clave-del-taller");
    expect(JSON.stringify(args)).not.toContain("clave-del-taller");
  });

  it("keeps the stored password when the form leaves the field blank", async () => {
    const fila = filaAlmacenada();
    mockFindUnique.mockResolvedValue(fila);
    const formData = formularioValido();
    formData.set("password", "");

    const resultado = await guardarConfiguracionSmtpAction(initialState, formData);

    expect(resultado).toEqual({ error: null, success: true });
    const args = mockUpsert.mock.calls[0][0];
    expect(args.update.passwordCifrado).toBe(fila.passwordCifrado);
  });

  it("refuses a blank password when there is no stored configuration yet", async () => {
    const formData = formularioValido();
    formData.set("password", "");

    const resultado = await guardarConfiguracionSmtpAction(initialState, formData);

    expect(resultado).toEqual({
      error: "La contraseña es obligatoria la primera vez que configuras el SMTP.",
      success: false,
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns the Spanish validation message for an invalid puerto", async () => {
    const formData = formularioValido();
    formData.set("puerto", "70000");

    const resultado = await guardarConfiguracionSmtpAction(initialState, formData);

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe("El puerto debe estar entre 1 y 65535");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("probarConfiguracionSmtpAction", () => {
  it("is ADMIN-only", async () => {
    mockFindUnique.mockResolvedValue(filaAlmacenada());

    await probarConfiguracionSmtpAction(initialState, new FormData());

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("refuses when no configuration is stored", async () => {
    const resultado = await probarConfiguracionSmtpAction(initialState, new FormData());

    expect(resultado).toEqual({
      error: "Configura y guarda el servidor SMTP antes de enviar una prueba.",
      success: false,
    });
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("sends the test message to the signed-in ADMIN's own address using the decrypted config", async () => {
    mockFindUnique.mockResolvedValue(filaAlmacenada("clave-guardada"));

    const resultado = await probarConfiguracionSmtpAction(initialState, new FormData());

    expect(resultado).toEqual({ error: null, success: true });
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      {
        host: "smtp.viejo.test",
        puerto: 465,
        usuario: "viejo@taller.test",
        password: "clave-guardada",
        fromEmail: "viejo@taller.test",
        fromNombre: "Taller Viejo",
      },
      expect.objectContaining({ para: "admin@taller.test" }),
    );
  });

  it("reports a friendly Spanish message when the SMTP server rejects the connection", async () => {
    mockFindUnique.mockResolvedValue(filaAlmacenada());
    mockEnviarEmail.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1:465"));

    const resultado = await probarConfiguracionSmtpAction(initialState, new FormData());

    expect(resultado.success).toBe(false);
    expect(resultado.error).toContain("No se pudo enviar el correo de prueba");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/actions/smtp-actions.test.ts`
Expected: FAIL — `Failed to resolve import "./smtp-actions"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/actions/smtp-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  CONFIGURACION_SMTP_ID,
  descifrarConfiguracionSmtp,
  type ConfiguracionSmtpAlmacenada,
} from "@/lib/email/smtp-config";
import { enviarEmail } from "@/lib/email/enviar-email";
import { smtpConfigInputSchema } from "@/lib/validation/smtp";

export interface SmtpFormState {
  error: string | null;
  success: boolean;
}

/**
 * What the settings page is allowed to see. There is no `password` and no
 * `passwordCifrado`: the browser never receives either, not even the envelope.
 * `passwordConfigurada` is the only thing the form needs in order to render
 * "leave blank to keep the current password".
 */
export interface ConfiguracionSmtpVista {
  host: string;
  puerto: number;
  usuario: string;
  fromEmail: string;
  fromNombre: string;
  activo: boolean;
  passwordConfigurada: boolean;
}

export async function getConfiguracionSmtp(): Promise<ConfiguracionSmtpVista | null> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const fila = await tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
  if (!fila) {
    return null;
  }

  return {
    host: fila.host,
    puerto: fila.puerto,
    usuario: fila.usuario,
    fromEmail: fila.fromEmail,
    fromNombre: fila.fromNombre,
    activo: fila.activo,
    passwordConfigurada: fila.passwordCifrado.length > 0,
  };
}

export async function guardarConfiguracionSmtpAction(
  prevState: SmtpFormState,
  formData: FormData,
): Promise<SmtpFormState> {
  const session = await requireRole(["ADMIN"]);

  const parsed = smtpConfigInputSchema.safeParse({
    host: formData.get("host") ?? "",
    puerto: formData.get("puerto") ?? "",
    usuario: formData.get("usuario") ?? "",
    password: formData.get("password") ?? "",
    fromEmail: formData.get("fromEmail") ?? "",
    fromNombre: formData.get("fromNombre") ?? "",
    activo: formData.get("activo") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const existente = await tenantDb.configuracionSmtp.findUnique({
    where: { id: CONFIGURACION_SMTP_ID },
  });

  // A blank password field means "keep what is stored" -- the form cannot show
  // the current password, so requiring a re-type on every host/port edit would
  // push admins to keep it in a text file somewhere.
  const passwordNueva = parsed.data.password ?? "";
  if (!passwordNueva && !existente) {
    return {
      error: "La contraseña es obligatoria la primera vez que configuras el SMTP.",
      success: false,
    };
  }
  const passwordCifrado = passwordNueva ? cifrarSecreto(passwordNueva) : existente!.passwordCifrado;

  const campos = {
    host: parsed.data.host,
    puerto: parsed.data.puerto,
    usuario: parsed.data.usuario,
    passwordCifrado,
    fromEmail: parsed.data.fromEmail,
    fromNombre: parsed.data.fromNombre,
    activo: parsed.data.activo,
  };

  try {
    await tenantDb.configuracionSmtp.upsert({
      where: { id: CONFIGURACION_SMTP_ID },
      create: { id: CONFIGURACION_SMTP_ID, ...campos },
      update: campos,
    });
  } catch (err) {
    return {
      error: friendlyPrismaErrorMessage(err, "Error al guardar la configuración SMTP"),
      success: false,
    };
  }

  revalidatePath("/configuracion-smtp");
  return { error: null, success: true };
}

/**
 * Sends one test message to the signed-in ADMIN's own address. The destination
 * deliberately comes from the session, not from the form: a settings page that
 * mails an arbitrary attacker-supplied address through the tenant's own server
 * is an open relay with extra steps.
 */
export async function probarConfiguracionSmtpAction(
  prevState: SmtpFormState,
  formData: FormData,
): Promise<SmtpFormState> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const fila = await tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
  if (!fila) {
    return {
      error: "Configura y guarda el servidor SMTP antes de enviar una prueba.",
      success: false,
    };
  }

  const destino = session.user.email;
  if (!destino) {
    return { error: "Tu usuario no tiene un correo donde recibir la prueba.", success: false };
  }

  try {
    const config = descifrarConfiguracionSmtp(fila as ConfiguracionSmtpAlmacenada);
    await enviarEmail(config, {
      para: destino,
      asunto: "TorqueFlow — prueba de configuración SMTP",
      texto:
        "Este es un correo de prueba enviado desde TorqueFlow.\n\n" +
        "Si lo recibiste, la configuración SMTP de tu taller funciona y los " +
        "recordatorios de mantenimiento podrán enviarse.",
      html:
        "<p>Este es un correo de prueba enviado desde <strong>TorqueFlow</strong>.</p>" +
        "<p>Si lo recibiste, la configuración SMTP de tu taller funciona y los " +
        "recordatorios de mantenimiento podrán enviarse.</p>",
    });
  } catch {
    // The raw SMTP/crypto error can carry the host, the user and internal IPs.
    // It is logged nowhere and shown as one generic message.
    return {
      error: "No se pudo enviar el correo de prueba. Revisa el servidor, el puerto y las credenciales.",
      success: false,
    };
  }

  return { error: null, success: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/actions/smtp-actions.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output. (If it reports a missing `@/lib/email/enviar-email`, go do Task 10 and come back — see Step 0.)

```bash
git add src/app/actions/smtp-actions.ts src/app/actions/smtp-actions.test.ts
git commit -m "fase7-task 6: add ADMIN-only SMTP configuration actions with encrypted password storage"
git push origin main
```

---

### Task 7: Citas UI — list page, booking form, detail page, estado form, nav link

**Files:**
- Create: `src/app/(dashboard)/citas/page.tsx`
- Create: `src/app/(dashboard)/citas/nueva-cita-form.tsx`
- Create: `src/app/(dashboard)/citas/nueva-cita-form.test.tsx`
- Create: `src/app/(dashboard)/citas/[id]/page.tsx`
- Create: `src/app/(dashboard)/citas/[id]/cambiar-estado-cita-form.tsx`
- Create: `src/app/(dashboard)/citas/[id]/cambiar-estado-cita-form.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `listCitas`, `getCita`, `listVehiculosParaCita`, `createCitaAction`, `cambiarEstadoCitaAction`, `CitaFormState`, `VehiculoOption`, `CitaConDetalle` (Task 5).
- Produces: routes `/citas` and `/citas/[id]`. The detail route is what Task 13's e2e uses to prove the sede IDOR boundary by direct URL — the Fase 6 review explicitly called out that list-hiding alone is not proof.

- [ ] **Step 1: Write the failing form test**

Create `src/app/(dashboard)/citas/nueva-cita-form.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/cita-actions", () => ({
  createCitaAction: vi.fn(),
}));

import { NuevaCitaForm } from "./nueva-cita-form";

const vehiculos = [
  { id: "veh-1", placa: "ABC123", marca: "Mazda", modelo: "3", clienteNombre: "Ana Pérez" },
  { id: "veh-2", placa: "XYZ789", marca: "Renault", modelo: "Logan", clienteNombre: "Beto Ruiz" },
];

describe("NuevaCitaForm", () => {
  it("renders one option per vehículo, labelled with placa and cliente", () => {
    render(<NuevaCitaForm vehiculos={vehiculos} />);

    expect(screen.getByRole("option", { name: "ABC123 — Mazda 3 (Ana Pérez)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "XYZ789 — Renault Logan (Beto Ruiz)" })).toBeInTheDocument();
  });

  it("renders the fecha, motivo and notas fields", () => {
    render(<NuevaCitaForm vehiculos={vehiculos} />);

    expect(screen.getByLabelText("Fecha y hora")).toHaveAttribute("type", "datetime-local");
    expect(screen.getByLabelText("Motivo")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agendar cita" })).toBeInTheDocument();
  });

  it("explains the empty state instead of rendering a useless empty select", () => {
    render(<NuevaCitaForm vehiculos={[]} />);

    expect(screen.getByText("Registra un cliente y su vehículo antes de agendar una cita.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agendar cita" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/citas/nueva-cita-form.test.tsx"`
Expected: FAIL — `Failed to resolve import "./nueva-cita-form"`.

- [ ] **Step 3: Write the booking form**

Create `src/app/(dashboard)/citas/nueva-cita-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createCitaAction, type CitaFormState, type VehiculoOption } from "@/app/actions/cita-actions";

const initialState: CitaFormState = { error: null, success: false };

export function NuevaCitaForm({ vehiculos }: { vehiculos: VehiculoOption[] }) {
  const [state, formAction, isPending] = useActionState(createCitaAction, initialState);

  if (vehiculos.length === 0) {
    return <p>Registra un cliente y su vehículo antes de agendar una cita.</p>;
  }

  return (
    <form noValidate action={formAction}>
      <label htmlFor="vehiculoId">Vehículo</label>
      <select id="vehiculoId" name="vehiculoId" required defaultValue="">
        <option value="" disabled>
          Selecciona un vehículo
        </option>
        {vehiculos.map((vehiculo) => (
          <option key={vehiculo.id} value={vehiculo.id}>
            {`${vehiculo.placa} — ${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.clienteNombre})`}
          </option>
        ))}
      </select>

      <label htmlFor="fechaHora">Fecha y hora</label>
      <input id="fechaHora" name="fechaHora" type="datetime-local" required />

      <label htmlFor="motivo">Motivo</label>
      <input id="motivo" name="motivo" required />

      <label htmlFor="notas">Notas</label>
      <textarea id="notas" name="notas" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agendar cita"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Cita agendada</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "src/app/(dashboard)/citas/nueva-cita-form.test.tsx"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing estado-form test**

Create `src/app/(dashboard)/citas/[id]/cambiar-estado-cita-form.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/cita-actions", () => ({
  cambiarEstadoCitaAction: vi.fn(),
}));

import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";

describe("CambiarEstadoCitaForm", () => {
  it("offers the four estados and preselects the current one", () => {
    render(<CambiarEstadoCitaForm citaId="cita-1" estadoActual="CONFIRMADA" />);

    const select = screen.getByLabelText<HTMLSelectElement>("Estado");
    expect(select.value).toBe("CONFIRMADA");
    for (const estado of ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"]) {
      expect(screen.getByRole("option", { name: estado })).toBeInTheDocument();
    }
  });

  it("renders the submit button", () => {
    render(<CambiarEstadoCitaForm citaId="cita-1" estadoActual="PROGRAMADA" />);

    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/citas/[id]/cambiar-estado-cita-form.test.tsx"`
Expected: FAIL — `Failed to resolve import "./cambiar-estado-cita-form"`.

- [ ] **Step 7: Write the estado form**

Create `src/app/(dashboard)/citas/[id]/cambiar-estado-cita-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { cambiarEstadoCitaAction, type CitaFormState } from "@/app/actions/cita-actions";
import type { EstadoCita } from "@/generated/prisma-tenant";

const initialState: CitaFormState = { error: null, success: false };

const ESTADOS: EstadoCita[] = ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"];

export function CambiarEstadoCitaForm({
  citaId,
  estadoActual,
}: {
  citaId: string;
  estadoActual: EstadoCita;
}) {
  const [state, formAction, isPending] = useActionState(
    cambiarEstadoCitaAction.bind(null, citaId),
    initialState,
  );

  return (
    <form noValidate action={formAction}>
      <label htmlFor="estado">Estado</label>
      <select id="estado" name="estado" defaultValue={estadoActual}>
        {ESTADOS.map((estado) => (
          <option key={estado} value={estado}>
            {estado}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Actualizar estado"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Estado actualizado</p> : null}
    </form>
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run "src/app/(dashboard)/citas/[id]/cambiar-estado-cita-form.test.tsx"`
Expected: PASS, 2 tests.

- [ ] **Step 9: Write the list page**

Create `src/app/(dashboard)/citas/page.tsx`:

```tsx
import Link from "next/link";
import { listCitas, listVehiculosParaCita } from "@/app/actions/cita-actions";
import { NuevaCitaForm } from "./nueva-cita-form";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

export default async function CitasPage() {
  // Both reads go through the actions module, so the guard and the sede filter
  // are applied in exactly one place instead of being restated here.
  const [citas, vehiculos] = await Promise.all([listCitas(), listVehiculosParaCita()]);

  return (
    <main>
      <h1>Citas</h1>
      <NuevaCitaForm vehiculos={vehiculos} />

      {citas.length === 0 ? (
        <p>No hay citas agendadas en esta sede.</p>
      ) : (
        <ul>
          {citas.map((cita) => (
            <li key={cita.id}>
              <Link href={`/citas/${cita.id}`}>
                {`${formatoFecha.format(cita.fechaHora)} — ${cita.vehiculo.placa} — ${cita.motivo}`}
              </Link>
              <span>{` [${cita.estado}]`}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 10: Write the detail page**

Create `src/app/(dashboard)/citas/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getCita } from "@/app/actions/cita-actions";
import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeStyle: "short" });

export default async function CitaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cita = await getCita(id);

  // getCita is a sede-scoped findFirst, so a cita from another sede arrives here
  // as null and this 404s. That is the whole IDOR boundary for this route:
  // pasting another sede's cita URL must not resolve.
  if (!cita) {
    notFound();
  }

  return (
    <main>
      <h1>{`Cita ${cita.vehiculo.placa}`}</h1>
      <p>{`Fecha: ${formatoFecha.format(cita.fechaHora)}`}</p>
      <p>{`Cliente: ${cita.cliente.nombre}`}</p>
      <p>{`Vehículo: ${cita.vehiculo.marca} ${cita.vehiculo.modelo} (${cita.vehiculo.placa})`}</p>
      <p>{`Motivo: ${cita.motivo}`}</p>
      {cita.notas ? <p>{`Notas: ${cita.notas}`}</p> : null}
      <p>{`Agendada por: ${cita.creadoPor.nombre}`}</p>
      <p>{`Estado actual: ${cita.estado}`}</p>

      <CambiarEstadoCitaForm citaId={cita.id} estadoActual={cita.estado} />
    </main>
  );
}
```

- [ ] **Step 11: Add the nav link**

In `src/app/(dashboard)/layout.tsx`, insert a `Citas` link into the `<nav>` immediately after the `Órdenes` link, so the line reads:

```tsx
          <Link href="/ordenes">Órdenes</Link>
          <Link href="/citas">Citas</Link>
          <Link href="/bodegas">Bodegas</Link>
```

It is unguarded by role: `listCitas` uses `requireSession()`, so every role may read the agenda.

- [ ] **Step 12: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, whole suite green; `tsc` silent.

- [ ] **Step 13: Commit**

```bash
git add "src/app/(dashboard)/citas" "src/app/(dashboard)/layout.tsx"
git commit -m "fase7-task 7: add citas list, booking form, detail page and nav link"
git push origin main
```

---

### Task 8: SMTP settings UI (ADMIN-only)

**Files:**
- Create: `src/app/(dashboard)/configuracion-smtp/page.tsx`
- Create: `src/app/(dashboard)/configuracion-smtp/configuracion-smtp-form.tsx`
- Create: `src/app/(dashboard)/configuracion-smtp/configuracion-smtp-form.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `getConfiguracionSmtp`, `guardarConfiguracionSmtpAction`, `probarConfiguracionSmtpAction`, `SmtpFormState`, `ConfiguracionSmtpVista` (Task 6).
- Produces: route `/configuracion-smtp`.

- [ ] **Step 1: Write the failing test**

Create `src/app/(dashboard)/configuracion-smtp/configuracion-smtp-form.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/smtp-actions", () => ({
  guardarConfiguracionSmtpAction: vi.fn(),
  probarConfiguracionSmtpAction: vi.fn(),
}));

import { ConfiguracionSmtpForm } from "./configuracion-smtp-form";

const configuracion = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
  activo: true,
  passwordConfigurada: true,
};

describe("ConfiguracionSmtpForm", () => {
  it("prefills every stored field except the password", () => {
    render(<ConfiguracionSmtpForm configuracion={configuracion} />);

    expect(screen.getByLabelText<HTMLInputElement>("Servidor SMTP").value).toBe("smtp.taller.test");
    expect(screen.getByLabelText<HTMLInputElement>("Puerto").value).toBe("587");
    expect(screen.getByLabelText<HTMLInputElement>("Usuario").value).toBe("avisos@taller.test");
    expect(screen.getByLabelText<HTMLInputElement>("Correo remitente").value).toBe("avisos@taller.test");
    expect(screen.getByLabelText<HTMLInputElement>("Nombre del remitente").value).toBe("Taller Pérez");
    expect(screen.getByLabelText<HTMLInputElement>("Contraseña").value).toBe("");
  });

  it("masks the password field and tells the admin that leaving it blank keeps the stored one", () => {
    render(<ConfiguracionSmtpForm configuracion={configuracion} />);

    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    expect(screen.getByText("Déjala en blanco para conservar la contraseña guardada.")).toBeInTheDocument();
  });

  it("marks the password as required when nothing is stored yet", () => {
    render(<ConfiguracionSmtpForm configuracion={null} />);

    expect(screen.getByLabelText("Contraseña")).toBeRequired();
    expect(
      screen.queryByText("Déjala en blanco para conservar la contraseña guardada."),
    ).not.toBeInTheDocument();
  });

  it("renders the activo checkbox reflecting the stored value", () => {
    render(<ConfiguracionSmtpForm configuracion={{ ...configuracion, activo: false }} />);

    expect(screen.getByLabelText<HTMLInputElement>("Enviar recordatorios")).not.toBeChecked();
  });

  it("offers the test-send button only once a configuration is stored", () => {
    render(<ConfiguracionSmtpForm configuracion={configuracion} />);
    expect(screen.getByRole("button", { name: "Enviar correo de prueba" })).toBeInTheDocument();
  });

  it("hides the test-send button when nothing is stored yet", () => {
    render(<ConfiguracionSmtpForm configuracion={null} />);
    expect(screen.queryByRole("button", { name: "Enviar correo de prueba" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/(dashboard)/configuracion-smtp/configuracion-smtp-form.test.tsx"`
Expected: FAIL — `Failed to resolve import "./configuracion-smtp-form"`.

- [ ] **Step 3: Write the form**

Create `src/app/(dashboard)/configuracion-smtp/configuracion-smtp-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  guardarConfiguracionSmtpAction,
  probarConfiguracionSmtpAction,
  type ConfiguracionSmtpVista,
  type SmtpFormState,
} from "@/app/actions/smtp-actions";

const initialState: SmtpFormState = { error: null, success: false };

export function ConfiguracionSmtpForm({
  configuracion,
}: {
  configuracion: ConfiguracionSmtpVista | null;
}) {
  const [state, formAction, isPending] = useActionState(guardarConfiguracionSmtpAction, initialState);
  const [pruebaState, pruebaAction, pruebaPending] = useActionState(
    probarConfiguracionSmtpAction,
    initialState,
  );

  return (
    <>
      <form noValidate action={formAction}>
        <label htmlFor="host">Servidor SMTP</label>
        <input id="host" name="host" required defaultValue={configuracion?.host ?? ""} />

        <label htmlFor="puerto">Puerto</label>
        <input
          id="puerto"
          name="puerto"
          type="number"
          required
          defaultValue={configuracion ? String(configuracion.puerto) : "587"}
        />

        <label htmlFor="usuario">Usuario</label>
        <input id="usuario" name="usuario" required defaultValue={configuracion?.usuario ?? ""} />

        <label htmlFor="password">Contraseña</label>
        {/* The stored password is never sent to the browser, not even encrypted:
            the field always starts empty and an empty submission means "keep it". */}
        <input id="password" name="password" type="password" required={!configuracion} defaultValue="" />
        {configuracion ? <p>Déjala en blanco para conservar la contraseña guardada.</p> : null}

        <label htmlFor="fromEmail">Correo remitente</label>
        <input id="fromEmail" name="fromEmail" required defaultValue={configuracion?.fromEmail ?? ""} />

        <label htmlFor="fromNombre">Nombre del remitente</label>
        <input id="fromNombre" name="fromNombre" required defaultValue={configuracion?.fromNombre ?? ""} />

        <label htmlFor="activo">Enviar recordatorios</label>
        <input id="activo" name="activo" type="checkbox" defaultChecked={configuracion?.activo ?? true} />

        <button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar configuración"}
        </button>

        {state.error ? <p role="alert">{state.error}</p> : null}
        {state.success ? <p role="status">Configuración guardada</p> : null}
      </form>

      {configuracion ? (
        <form action={pruebaAction}>
          <button type="submit" disabled={pruebaPending}>
            {pruebaPending ? "Enviando..." : "Enviar correo de prueba"}
          </button>
          {pruebaState.error ? <p role="alert">{pruebaState.error}</p> : null}
          {pruebaState.success ? <p role="status">Correo de prueba enviado</p> : null}
        </form>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "src/app/(dashboard)/configuracion-smtp/configuracion-smtp-form.test.tsx"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the page**

Create `src/app/(dashboard)/configuracion-smtp/page.tsx`:

```tsx
import { getConfiguracionSmtp } from "@/app/actions/smtp-actions";
import { ConfiguracionSmtpForm } from "./configuracion-smtp-form";

export default async function ConfiguracionSmtpPage() {
  // getConfiguracionSmtp calls requireRole(["ADMIN"]), so a TECNICO/RECEPCION
  // reaching this URL is redirected before anything renders.
  const configuracion = await getConfiguracionSmtp();

  return (
    <main>
      <h1>Configuración SMTP</h1>
      <p>
        TorqueFlow envía los recordatorios de mantenimiento usando el servidor de correo de tu propio
        taller. La contraseña se guarda cifrada y nunca se muestra de vuelta.
      </p>
      <ConfiguracionSmtpForm configuracion={configuracion} />
    </main>
  );
}
```

- [ ] **Step 6: Add the ADMIN-only nav link**

In `src/app/(dashboard)/layout.tsx`, add the link after the existing `Usuarios` link so the block reads:

```tsx
          {esAdmin ? <Link href="/usuarios">Usuarios</Link> : null}
          {esAdmin ? <Link href="/configuracion-smtp">SMTP</Link> : null}
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS; `tsc` silent.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(dashboard)/configuracion-smtp" "src/app/(dashboard)/layout.tsx"
git commit -m "fase7-task 8: add the ADMIN-only SMTP configuration page"
git push origin main
```

---

### Task 9: The maintenance-due rule (pure, no Prisma, no I/O)

**Files:**
- Create: `src/lib/recordatorios/mantenimiento.ts`
- Create: `src/lib/recordatorios/mantenimiento.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `UMBRAL_KM = 5000`, `UMBRAL_MESES = 6`, `COOLDOWN_RECORDATORIO_DIAS = 90`
  - `type MotivoMantenimiento = "KILOMETRAJE" | "TIEMPO"`
  - `interface LecturaServicio { fecha: Date; kilometraje: number | null }`
  - `interface EvaluacionMantenimiento { vencido: boolean; motivo: MotivoMantenimiento | null; fechaVencimiento: Date | null; bloqueadoPorCooldown: boolean }`
  - `sumarMeses(fecha: Date, meses: number): Date`
  - `evaluarMantenimiento(servicios: LecturaServicio[], ultimoRecordatorioAt: Date | null, ahora: Date): EvaluacionMantenimiento`

`servicios` is ordered **most recent first** and holds at most the two newest delivered órdenes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/recordatorios/mantenimiento.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  COOLDOWN_RECORDATORIO_DIAS,
  UMBRAL_KM,
  UMBRAL_MESES,
  evaluarMantenimiento,
  sumarMeses,
  type LecturaServicio,
} from "./mantenimiento";

const d = (iso: string) => new Date(iso);

describe("constantes globales", () => {
  it("fixes the thresholds in code, not per tenant", () => {
    expect(UMBRAL_KM).toBe(5000);
    expect(UMBRAL_MESES).toBe(6);
    expect(COOLDOWN_RECORDATORIO_DIAS).toBe(90);
  });
});

describe("sumarMeses", () => {
  it("adds whole months", () => {
    expect(sumarMeses(d("2026-01-15T00:00:00Z"), 6).toISOString()).toBe("2026-07-15T00:00:00.000Z");
  });

  it("clamps to the last day of the target month instead of rolling over", () => {
    expect(sumarMeses(d("2025-08-31T00:00:00Z"), 6).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("does not mutate its argument", () => {
    const original = d("2026-01-15T00:00:00Z");
    sumarMeses(original, 6);
    expect(original.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("evaluarMantenimiento", () => {
  it("is never due for a vehicle with no delivered service on record", () => {
    expect(evaluarMantenimiento([], null, d("2026-08-21T00:00:00Z"))).toEqual({
      vencido: false,
      motivo: null,
      fechaVencimiento: null,
      bloqueadoPorCooldown: false,
    });
  });

  it("is not due five months after the only service, with no km data", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-03-21T00:00:00Z"), kilometraje: null }];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(false);
    expect(resultado.fechaVencimiento?.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("is due on the TIEMPO threshold six months after the only service", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-02-21T00:00:00Z"), kilometraje: null }];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.motivo).toBe("TIEMPO");
  });

  it("ignores the km branch when only one reading exists, since no rate can be derived", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-08-01T00:00:00Z"), kilometraje: 60000 }];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(false);
    expect(resultado.motivo).toBe(null);
  });

  it("is due on KILOMETRAJE when the projected distance reaches 5000 km before six months pass", () => {
    // 5000 km in 100 days => 50 km/día. 5000 more km => 100 days after the last
    // service (2026-05-01), i.e. 2026-08-09 -- well before the 6-month date.
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-05-01T00:00:00Z"), kilometraje: 65000 },
      { fecha: d("2026-01-21T00:00:00Z"), kilometraje: 60000 },
    ];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.motivo).toBe("KILOMETRAJE");
    expect(resultado.fechaVencimiento?.toISOString().slice(0, 10)).toBe("2026-08-09");
  });

  it("is not yet due when the projected 5000 km lie in the future and six months have not passed", () => {
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-08-01T00:00:00Z"), kilometraje: 65000 },
      { fecha: d("2026-04-23T00:00:00Z"), kilometraje: 60000 },
    ];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(false);
    expect(resultado.motivo).toBe(null);
  });

  it("picks whichever threshold comes FIRST when both eventually fire", () => {
    // 500 km in 100 days => 5 km/día => 1000 days to reach 5000 km, far later
    // than the 6-month date. TIEMPO must win.
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-02-01T00:00:00Z"), kilometraje: 60500 },
      { fecha: d("2025-10-24T00:00:00Z"), kilometraje: 60000 },
    ];

    const resultado = evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.motivo).toBe("TIEMPO");
  });

  it("ignores a non-positive or zero km rate instead of dividing by it", () => {
    const sinAvance: LecturaServicio[] = [
      { fecha: d("2026-08-01T00:00:00Z"), kilometraje: 60000 },
      { fecha: d("2026-04-23T00:00:00Z"), kilometraje: 60000 },
    ];
    const retrocede: LecturaServicio[] = [
      { fecha: d("2026-08-01T00:00:00Z"), kilometraje: 59000 },
      { fecha: d("2026-04-23T00:00:00Z"), kilometraje: 60000 },
    ];

    expect(evaluarMantenimiento(sinAvance, null, d("2026-08-21T00:00:00Z")).motivo).toBe(null);
    expect(evaluarMantenimiento(retrocede, null, d("2026-08-21T00:00:00Z")).motivo).toBe(null);
  });

  it("ignores the km branch when either reading has no kilometraje recorded", () => {
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-05-01T00:00:00Z"), kilometraje: 65000 },
      { fecha: d("2026-01-21T00:00:00Z"), kilometraje: null },
    ];

    expect(evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z")).motivo).toBe(null);
  });

  it("ignores the km branch when both readings share the same day, avoiding a divide-by-zero", () => {
    const servicios: LecturaServicio[] = [
      { fecha: d("2026-05-01T10:00:00Z"), kilometraje: 65000 },
      { fecha: d("2026-05-01T08:00:00Z"), kilometraje: 60000 },
    ];

    expect(evaluarMantenimiento(servicios, null, d("2026-08-21T00:00:00Z")).motivo).toBe(null);
  });

  it("flags the cooldown when a reminder went out less than 90 days ago, while staying due", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-02-21T00:00:00Z"), kilometraje: null }];

    const resultado = evaluarMantenimiento(servicios, d("2026-07-21T00:00:00Z"), d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.bloqueadoPorCooldown).toBe(true);
  });

  it("clears the cooldown once more than 90 days have passed", () => {
    const servicios: LecturaServicio[] = [{ fecha: d("2026-02-21T00:00:00Z"), kilometraje: null }];

    const resultado = evaluarMantenimiento(servicios, d("2026-01-21T00:00:00Z"), d("2026-08-21T00:00:00Z"));

    expect(resultado.vencido).toBe(true);
    expect(resultado.bloqueadoPorCooldown).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/recordatorios/mantenimiento.test.ts`
Expected: FAIL — `Failed to resolve import "./mantenimiento"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/recordatorios/mantenimiento.ts`:

```ts
/**
 * When is a vehicle due for preventive maintenance?
 *
 * The rule, fixed in code and NOT configurable per tenant: 5000 km OR 6 months
 * since the last delivered service, whichever comes first. Both are implemented
 * as due *dates* and the earlier one wins, so "whichever comes first" is literal
 * rather than an if/else that happens to check km before time.
 *
 * The signal is the delivered OrdenTrabajo (estado ENTREGADA, ordered by
 * entregadaAt), not HistorialVehiculo: HistorialVehiculo is free text with no
 * service-type field and a `fecha` defaulting to now(), so a note typed months
 * after the fact is indistinguishable from an actual service. The delivered
 * orden is also the row carrying kilometrajeIngreso, so both halves of the rule
 * read one consistent source.
 *
 * No model stores a vehicle's current odometer, so the km half is a projection:
 * from the two newest readings we derive km/day and compute the date the
 * vehicle reaches +5000 km. With fewer than two readings, a missing reading, a
 * same-day pair, or a non-positive rate, the km branch simply does not fire and
 * only the 6-month branch applies.
 *
 * Deliberately Prisma-free and I/O-free, like src/lib/sede/scope.ts: the whole
 * rule is auditable and testable without a database. `ahora` is a parameter,
 * never `new Date()` inside, so every test is deterministic.
 */
export const UMBRAL_KM = 5000;
export const UMBRAL_MESES = 6;
export const COOLDOWN_RECORDATORIO_DIAS = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** "KILOMETRAJE" | "TIEMPO" matches the MotivoRecordatorio Prisma enum by value,
 *  which lets the gateway assign it directly without importing generated types. */
export type MotivoMantenimiento = "KILOMETRAJE" | "TIEMPO";

export interface LecturaServicio {
  /** entregadaAt of a delivered orden. */
  fecha: Date;
  /** kilometrajeIngreso of that same orden; null when it was never recorded. */
  kilometraje: number | null;
}

export interface EvaluacionMantenimiento {
  vencido: boolean;
  motivo: MotivoMantenimiento | null;
  fechaVencimiento: Date | null;
  bloqueadoPorCooldown: boolean;
}

export function sumarMeses(fecha: Date, meses: number): Date {
  const resultado = new Date(fecha.getTime());
  const diaOriginal = resultado.getUTCDate();
  resultado.setUTCMonth(resultado.getUTCMonth() + meses);
  // Aug 31 + 6 months would roll into March; clamp back to the last day of the
  // intended month instead of silently landing in the following one.
  if (resultado.getUTCDate() < diaOriginal) {
    resultado.setUTCDate(0);
  }
  return resultado;
}

function fechaVencimientoPorKilometraje(servicios: LecturaServicio[]): Date | null {
  const [ultimo, anterior] = servicios;
  if (!ultimo || !anterior) return null;
  if (ultimo.kilometraje === null || anterior.kilometraje === null) return null;

  const dias = (ultimo.fecha.getTime() - anterior.fecha.getTime()) / MS_POR_DIA;
  if (dias < 1) return null;

  const kmRecorridos = ultimo.kilometraje - anterior.kilometraje;
  if (kmRecorridos <= 0) return null;

  const kmPorDia = kmRecorridos / dias;
  const diasHastaUmbral = UMBRAL_KM / kmPorDia;
  return new Date(ultimo.fecha.getTime() + diasHastaUmbral * MS_POR_DIA);
}

/**
 * @param servicios delivered services, MOST RECENT FIRST, at most two.
 * @param ultimoRecordatorioAt when the newest reminder for this vehicle was sent.
 * @param ahora the evaluation instant (injected, never read from the clock here).
 */
export function evaluarMantenimiento(
  servicios: LecturaServicio[],
  ultimoRecordatorioAt: Date | null,
  ahora: Date,
): EvaluacionMantenimiento {
  const ultimo = servicios[0];
  if (!ultimo) {
    return { vencido: false, motivo: null, fechaVencimiento: null, bloqueadoPorCooldown: false };
  }

  const fechaTiempo = sumarMeses(ultimo.fecha, UMBRAL_MESES);
  const fechaKm = fechaVencimientoPorKilometraje(servicios);

  const usaKm = fechaKm !== null && fechaKm.getTime() < fechaTiempo.getTime();
  const fechaVencimiento = usaKm ? (fechaKm as Date) : fechaTiempo;
  const motivoCandidato: MotivoMantenimiento = usaKm ? "KILOMETRAJE" : "TIEMPO";

  const vencido = fechaVencimiento.getTime() <= ahora.getTime();

  const bloqueadoPorCooldown =
    ultimoRecordatorioAt !== null &&
    ahora.getTime() - ultimoRecordatorioAt.getTime() < COOLDOWN_RECORDATORIO_DIAS * MS_POR_DIA;

  return {
    vencido,
    motivo: vencido ? motivoCandidato : null,
    fechaVencimiento,
    bloqueadoPorCooldown,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/recordatorios/mantenimiento.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/recordatorios/mantenimiento.ts src/lib/recordatorios/mantenimiento.test.ts
git commit -m "fase7-task 9: add the pure 5000km/6-month maintenance-due rule"
git push origin main
```

---

### Task 10: Nodemailer transport + the reminder message template

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `src/lib/email/enviar-email.ts`
- Create: `src/lib/email/enviar-email.test.ts`
- Create: `src/lib/recordatorios/plantilla.ts`
- Create: `src/lib/recordatorios/plantilla.test.ts`

**Interfaces:**
- Consumes: `SmtpConfigDescifrada` (Task 3), `MotivoMantenimiento` (Task 9).
- Produces:
  - `interface MensajeEmail { para: string; asunto: string; texto: string; html: string }`
  - `enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void>`
  - `interface DatosRecordatorio { clienteNombre: string; placa: string; marca: string; modelo: string; motivo: MotivoMantenimiento; tallerNombre: string }`
  - `construirMensajeRecordatorio(para: string, datos: DatosRecordatorio): MensajeEmail`

- [ ] **Step 1: Install Nodemailer**

Run:

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Expected: `package.json` gains `"nodemailer"` under `dependencies` and `"@types/nodemailer"` under `devDependencies`.

- [ ] **Step 2: Write the failing transport test**

Create `src/lib/email/enviar-email.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => mockCreateTransport(...args) },
}));

import { enviarEmail } from "./enviar-email";
import type { SmtpConfigDescifrada } from "./smtp-config";

const config: SmtpConfigDescifrada = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  password: "clave-del-taller",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
};

const mensaje = {
  para: "ana@cliente.test",
  asunto: "Recordatorio",
  texto: "Texto plano",
  html: "<p>Texto plano</p>",
};

beforeEach(() => {
  mockSendMail.mockReset().mockResolvedValue({ messageId: "abc" });
  mockCreateTransport.mockClear();
});

describe("enviarEmail", () => {
  it("builds the transport from the decrypted config", async () => {
    await enviarEmail(config, mensaje);

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp.taller.test",
      port: 587,
      secure: false,
      auth: { user: "avisos@taller.test", pass: "clave-del-taller" },
    });
  });

  it("uses implicit TLS on port 465, the only port where SMTP starts encrypted", async () => {
    await enviarEmail({ ...config, puerto: 465 }, mensaje);

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it("sends the message with a named From and both bodies", async () => {
    await enviarEmail(config, mensaje);

    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"Taller Pérez" <avisos@taller.test>',
      to: "ana@cliente.test",
      subject: "Recordatorio",
      text: "Texto plano",
      html: "<p>Texto plano</p>",
    });
  });

  it("propagates a transport failure so the caller can count it as failed", async () => {
    mockSendMail.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(enviarEmail(config, mensaje)).rejects.toThrow("ECONNREFUSED");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/email/enviar-email.test.ts`
Expected: FAIL — `Failed to resolve import "./enviar-email"`.

- [ ] **Step 4: Write the transport**

Create `src/lib/email/enviar-email.ts`:

```ts
import nodemailer from "nodemailer";
import type { SmtpConfigDescifrada } from "./smtp-config";

/**
 * The only Nodemailer-aware module in the codebase. Everything upstream deals
 * in MensajeEmail values, so the reminder job, the SMTP test button and any
 * future Fase 8 notification all send through this one function.
 *
 * A transport is created per call rather than cached: each tenant has its own
 * SMTP server and credentials, and reminder runs are infrequent, so a pooled
 * connection would buy nothing and would keep decrypted passwords alive in
 * memory between runs.
 */
export interface MensajeEmail {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export async function enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.puerto,
    // 465 is implicit TLS ("SMTPS"); 587 and 25 start plaintext and upgrade via
    // STARTTLS, which nodemailer negotiates automatically when secure is false.
    secure: config.puerto === 465,
    auth: { user: config.usuario, pass: config.password },
  });

  await transport.sendMail({
    from: `"${config.fromNombre}" <${config.fromEmail}>`,
    to: mensaje.para,
    subject: mensaje.asunto,
    text: mensaje.texto,
    html: mensaje.html,
  });
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/lib/email/enviar-email.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing template test**

Create `src/lib/recordatorios/plantilla.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { construirMensajeRecordatorio, type DatosRecordatorio } from "./plantilla";

const base: DatosRecordatorio = {
  clienteNombre: "Ana Pérez",
  placa: "ABC123",
  marca: "Mazda",
  modelo: "3",
  motivo: "KILOMETRAJE",
  tallerNombre: "Taller Pérez",
};

describe("construirMensajeRecordatorio", () => {
  it("addresses the message to the given recipient", () => {
    expect(construirMensajeRecordatorio("ana@cliente.test", base).para).toBe("ana@cliente.test");
  });

  it("names the vehicle in the subject so the customer knows which car it is about", () => {
    expect(construirMensajeRecordatorio("ana@cliente.test", base).asunto).toBe(
      "Recordatorio de mantenimiento — ABC123",
    );
  });

  it("explains the kilometraje reason in both bodies", () => {
    const mensaje = construirMensajeRecordatorio("ana@cliente.test", base);

    expect(mensaje.texto).toContain("Ana Pérez");
    expect(mensaje.texto).toContain("Mazda 3 (ABC123)");
    expect(mensaje.texto).toContain("5.000 km");
    expect(mensaje.html).toContain("5.000 km");
    expect(mensaje.texto).toContain("Taller Pérez");
  });

  it("explains the tiempo reason instead when that threshold fired", () => {
    const mensaje = construirMensajeRecordatorio("ana@cliente.test", { ...base, motivo: "TIEMPO" });

    expect(mensaje.texto).toContain("6 meses");
    expect(mensaje.texto).not.toContain("5.000 km");
  });

  it("escapes HTML-significant characters in customer data instead of injecting them", () => {
    const mensaje = construirMensajeRecordatorio("ana@cliente.test", {
      ...base,
      clienteNombre: '<script>alert("x")</script>',
    });

    expect(mensaje.html).not.toContain("<script>");
    expect(mensaje.html).toContain("&lt;script&gt;");
  });

  it("produces a plain-text body with no markup at all", () => {
    const mensaje = construirMensajeRecordatorio("ana@cliente.test", base);

    expect(mensaje.texto).not.toContain("<");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/lib/recordatorios/plantilla.test.ts`
Expected: FAIL — `Failed to resolve import "./plantilla"`.

- [ ] **Step 8: Write the template**

Create `src/lib/recordatorios/plantilla.ts`:

```ts
import type { MensajeEmail } from "@/lib/email/enviar-email";
import type { MotivoMantenimiento } from "./mantenimiento";

/**
 * Plain text plus deliberately basic HTML -- no templating engine in v1, per
 * the scope decision recorded in the progress ledger. Customer-supplied strings
 * (names, plates) are escaped before they touch the HTML body: this text is
 * mailed to a third party, so an unescaped name is a stored-XSS payload aimed
 * at whatever mail client renders it.
 */
export interface DatosRecordatorio {
  clienteNombre: string;
  placa: string;
  marca: string;
  modelo: string;
  motivo: MotivoMantenimiento;
  tallerNombre: string;
}

function escaparHtml(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function razon(motivo: MotivoMantenimiento): string {
  return motivo === "KILOMETRAJE"
    ? "ha recorrido cerca de 5.000 km desde su último servicio"
    : "han pasado 6 meses desde su último servicio";
}

export function construirMensajeRecordatorio(para: string, datos: DatosRecordatorio): MensajeEmail {
  const vehiculo = `${datos.marca} ${datos.modelo} (${datos.placa})`;
  const motivoTexto = razon(datos.motivo);

  const texto = [
    `Hola ${datos.clienteNombre},`,
    "",
    `Tu vehículo ${vehiculo} ${motivoTexto}, así que es un buen momento para su mantenimiento preventivo.`,
    "",
    `Escríbenos o llámanos para agendar una cita en ${datos.tallerNombre}.`,
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");

  const html = [
    `<p>Hola ${escaparHtml(datos.clienteNombre)},</p>`,
    `<p>Tu vehículo <strong>${escaparHtml(vehiculo)}</strong> ${escaparHtml(motivoTexto)}, ` +
      "así que es un buen momento para su mantenimiento preventivo.</p>",
    `<p>Escríbenos o llámanos para agendar una cita en ${escaparHtml(datos.tallerNombre)}.</p>`,
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>`,
  ].join("");

  return {
    para,
    asunto: `Recordatorio de mantenimiento — ${datos.placa}`,
    texto,
    html,
  };
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run src/lib/recordatorios/plantilla.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 10: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output. (If Task 6 was already committed, its `enviarEmail` import now resolves.)

```bash
git add package.json package-lock.json src/lib/email/enviar-email.ts src/lib/email/enviar-email.test.ts src/lib/recordatorios/plantilla.ts src/lib/recordatorios/plantilla.test.ts
git commit -m "fase7-task 10: add the Nodemailer transport and the reminder message template"
git push origin main
```

---

### Task 11: The reminder orchestrator + its Prisma gateway

**Files:**
- Create: `src/lib/recordatorios/ejecutar-recordatorios.ts`
- Create: `src/lib/recordatorios/ejecutar-recordatorios.test.ts`
- Create: `src/lib/recordatorios/gateway-prisma.ts`

**Interfaces:**
- Consumes: `evaluarMantenimiento`, `LecturaServicio`, `MotivoMantenimiento` (Task 9); `construirMensajeRecordatorio` (Task 10); `MensajeEmail` (Task 10); `ConfiguracionSmtpAlmacenada`, `SmtpConfigDescifrada`, `CONFIGURACION_SMTP_ID` (Task 3); `getTenantDb` (existing).
- Produces:
  - `interface TenantRef { schemaName: string }`
  - `interface VehiculoParaRecordatorio { vehiculoId, placa, marca, modelo, clienteId, clienteNombre, clienteEmail: string | null, servicios: LecturaServicio[], ultimoRecordatorioAt: Date | null }`
  - `interface RegistroRecordatorio { vehiculoId: string; clienteId: string; emailDestino: string; motivo: MotivoMantenimiento; enviadoAt: Date }`
  - `interface RecordatoriosGateway { obtenerConfiguracionSmtp; listarVehiculosParaRecordatorio; registrarRecordatorio }`
  - `interface EjecutarRecordatoriosDeps { listarTenants; gateway; descifrarConfiguracion; enviarEmail; ahora }`
  - `interface ResumenRecordatorios { tenantsProcesados, tenantsSinSmtp, vehiculosEvaluados, enviados, omitidosPorCooldown, omitidosSinEmail, fallidos, errores }`
  - `ejecutarRecordatorios(deps: EjecutarRecordatoriosDeps): Promise<ResumenRecordatorios>`
  - `prismaRecordatoriosGateway: RecordatoriosGateway`

- [ ] **Step 1: Write the failing test**

Create `src/lib/recordatorios/ejecutar-recordatorios.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ejecutarRecordatorios,
  type EjecutarRecordatoriosDeps,
  type RecordatoriosGateway,
  type VehiculoParaRecordatorio,
} from "./ejecutar-recordatorios";
import type { ConfiguracionSmtpAlmacenada, SmtpConfigDescifrada } from "@/lib/email/smtp-config";

const AHORA = new Date("2026-08-21T00:00:00Z");

const CONFIG_ALMACENADA: ConfiguracionSmtpAlmacenada = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  passwordCifrado: "v1:iv:tag:cipher",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
  activo: true,
};

const CONFIG_DESCIFRADA: SmtpConfigDescifrada = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  password: "clave",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
};

/** Two readings 100 days apart, 5000 km apart => due since 2026-08-09. */
function vehiculoVencido(overrides: Partial<VehiculoParaRecordatorio> = {}): VehiculoParaRecordatorio {
  return {
    vehiculoId: "veh-1",
    placa: "ABC123",
    marca: "Mazda",
    modelo: "3",
    clienteId: "cli-1",
    clienteNombre: "Ana Pérez",
    clienteEmail: "ana@cliente.test",
    servicios: [
      { fecha: new Date("2026-05-01T00:00:00Z"), kilometraje: 65000 },
      { fecha: new Date("2026-01-21T00:00:00Z"), kilometraje: 60000 },
    ],
    ultimoRecordatorioAt: null,
    ...overrides,
  };
}

function vehiculoAlDia(): VehiculoParaRecordatorio {
  return vehiculoVencido({
    vehiculoId: "veh-2",
    placa: "XYZ789",
    servicios: [{ fecha: new Date("2026-08-01T00:00:00Z"), kilometraje: 10000 }],
  });
}

let mockObtenerConfig: ReturnType<typeof vi.fn>;
let mockListarVehiculos: ReturnType<typeof vi.fn>;
let mockRegistrar: ReturnType<typeof vi.fn>;
let mockEnviarEmail: ReturnType<typeof vi.fn>;
let mockDescifrar: ReturnType<typeof vi.fn>;

function construirDeps(
  tenants: { schemaName: string }[] = [{ schemaName: "taller_perez" }],
): EjecutarRecordatoriosDeps {
  const gateway: RecordatoriosGateway = {
    obtenerConfiguracionSmtp: (schema: string) => mockObtenerConfig(schema),
    listarVehiculosParaRecordatorio: (schema: string) => mockListarVehiculos(schema),
    registrarRecordatorio: (schema: string, registro) => mockRegistrar(schema, registro),
  };

  return {
    listarTenants: async () => tenants,
    gateway,
    descifrarConfiguracion: (fila) => mockDescifrar(fila),
    enviarEmail: (config, mensaje) => mockEnviarEmail(config, mensaje),
    ahora: AHORA,
  };
}

beforeEach(() => {
  mockObtenerConfig = vi.fn().mockResolvedValue(CONFIG_ALMACENADA);
  mockListarVehiculos = vi.fn().mockResolvedValue([vehiculoVencido()]);
  mockRegistrar = vi.fn().mockResolvedValue(undefined);
  mockEnviarEmail = vi.fn().mockResolvedValue(undefined);
  mockDescifrar = vi.fn().mockReturnValue(CONFIG_DESCIFRADA);
});

describe("ejecutarRecordatorios", () => {
  it("sends one email per due vehicle and logs it for de-duplication", async () => {
    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).toHaveBeenCalledTimes(1);
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      CONFIG_DESCIFRADA,
      expect.objectContaining({ para: "ana@cliente.test", asunto: "Recordatorio de mantenimiento — ABC123" }),
    );
    expect(mockRegistrar).toHaveBeenCalledWith("taller_perez", {
      vehiculoId: "veh-1",
      clienteId: "cli-1",
      emailDestino: "ana@cliente.test",
      motivo: "KILOMETRAJE",
      enviadoAt: AHORA,
    });
    expect(resumen.enviados).toBe(1);
    expect(resumen.fallidos).toBe(0);
    expect(resumen.tenantsProcesados).toBe(1);
  });

  it("does not email a vehicle that is not due", async () => {
    mockListarVehiculos.mockResolvedValue([vehiculoAlDia()]);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(resumen.enviados).toBe(0);
    expect(resumen.vehiculosEvaluados).toBe(1);
  });

  it("does not re-send within the cooldown window, and says so in the summary", async () => {
    mockListarVehiculos.mockResolvedValue([
      vehiculoVencido({ ultimoRecordatorioAt: new Date("2026-07-21T00:00:00Z") }),
    ]);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockRegistrar).not.toHaveBeenCalled();
    expect(resumen.omitidosPorCooldown).toBe(1);
  });

  it("sends again once the cooldown has expired", async () => {
    mockListarVehiculos.mockResolvedValue([
      vehiculoVencido({ ultimoRecordatorioAt: new Date("2026-01-21T00:00:00Z") }),
    ]);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(resumen.enviados).toBe(1);
    expect(resumen.omitidosPorCooldown).toBe(0);
  });

  it("skips a due vehicle whose cliente has no email address", async () => {
    mockListarVehiculos.mockResolvedValue([vehiculoVencido({ clienteEmail: null })]);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(resumen.omitidosSinEmail).toBe(1);
  });

  it("skips a tenant with no SMTP configuration without touching its vehicles", async () => {
    mockObtenerConfig.mockResolvedValue(null);

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockListarVehiculos).not.toHaveBeenCalled();
    expect(resumen.tenantsSinSmtp).toBe(1);
    expect(resumen.tenantsProcesados).toBe(0);
  });

  it("skips a tenant that turned reminders off (activo=false)", async () => {
    mockObtenerConfig.mockResolvedValue({ ...CONFIG_ALMACENADA, activo: false });

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockListarVehiculos).not.toHaveBeenCalled();
    expect(resumen.tenantsSinSmtp).toBe(1);
  });

  it("keeps going to the next tenant when one tenant throws", async () => {
    mockObtenerConfig.mockImplementation(async (schema: string) => {
      if (schema === "taller_roto") throw new Error("schema no existe");
      return CONFIG_ALMACENADA;
    });

    const resumen = await ejecutarRecordatorios(
      construirDeps([{ schemaName: "taller_roto" }, { schemaName: "taller_perez" }]),
    );

    expect(resumen.enviados).toBe(1);
    expect(resumen.fallidos).toBe(1);
    expect(resumen.errores[0]).toContain("taller_roto");
  });

  it("keeps going to the next vehicle when one email fails", async () => {
    mockListarVehiculos.mockResolvedValue([
      vehiculoVencido({ vehiculoId: "veh-a", placa: "AAA111" }),
      vehiculoVencido({ vehiculoId: "veh-b", placa: "BBB222" }),
    ]);
    mockEnviarEmail.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).toHaveBeenCalledTimes(2);
    expect(resumen.enviados).toBe(1);
    expect(resumen.fallidos).toBe(1);
    expect(resumen.errores[0]).toContain("AAA111");
  });

  it("does not log a reminder that failed to send, so the next run retries it", async () => {
    mockEnviarEmail.mockRejectedValue(new Error("ECONNREFUSED"));

    await ejecutarRecordatorios(construirDeps());

    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it("counts a tenant whose SMTP password cannot be decrypted as failed, not as sent", async () => {
    mockDescifrar.mockImplementation(() => {
      throw new Error("clave maestra rotada");
    });

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(resumen.fallidos).toBe(1);
    expect(resumen.enviados).toBe(0);
  });

  it("never lets an error message carry the decrypted SMTP password", async () => {
    mockEnviarEmail.mockRejectedValue(new Error(`fallo con la clave ${CONFIG_DESCIFRADA.password}`));

    const resumen = await ejecutarRecordatorios(construirDeps());

    expect(resumen.errores.join(" ")).not.toContain(CONFIG_DESCIFRADA.password);
  });

  it("returns zeroes and does not throw when there are no tenants at all", async () => {
    const resumen = await ejecutarRecordatorios(construirDeps([]));

    expect(resumen).toEqual({
      tenantsProcesados: 0,
      tenantsSinSmtp: 0,
      vehiculosEvaluados: 0,
      enviados: 0,
      omitidosPorCooldown: 0,
      omitidosSinEmail: 0,
      fallidos: 0,
      errores: [],
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/recordatorios/ejecutar-recordatorios.test.ts`
Expected: FAIL — `Failed to resolve import "./ejecutar-recordatorios"`.

- [ ] **Step 3: Write the orchestrator**

Create `src/lib/recordatorios/ejecutar-recordatorios.ts`:

```ts
import type { ConfiguracionSmtpAlmacenada, SmtpConfigDescifrada } from "@/lib/email/smtp-config";
import type { MensajeEmail } from "@/lib/email/enviar-email";
import { evaluarMantenimiento, type LecturaServicio, type MotivoMantenimiento } from "./mantenimiento";
import { construirMensajeRecordatorio } from "./plantilla";

/**
 * The reminder sweep, expressed without a single Prisma import.
 *
 * Everything the job touches arrives through `deps`, so the whole control flow
 * -- tenant enumeration, the due rule, de-duplication, partial-failure handling
 * -- is unit-testable with plain mocks and no database. gateway-prisma.ts
 * supplies the real implementation; the route only wires the two together.
 *
 * Failure policy: one bad tenant must never abort the sweep, and one bad email
 * must never abort a tenant. Every unit of work runs in its own try/catch, the
 * failure is counted and described, and the loop continues. A send that failed
 * is deliberately NOT logged to RecordatorioEnviado, so the next run retries it
 * instead of the customer silently never hearing from the shop.
 */
export interface TenantRef {
  schemaName: string;
}

export interface VehiculoParaRecordatorio {
  vehiculoId: string;
  placa: string;
  marca: string;
  modelo: string;
  clienteId: string;
  clienteNombre: string;
  clienteEmail: string | null;
  /** Delivered services, MOST RECENT FIRST, at most two. */
  servicios: LecturaServicio[];
  ultimoRecordatorioAt: Date | null;
}

export interface RegistroRecordatorio {
  vehiculoId: string;
  clienteId: string;
  emailDestino: string;
  motivo: MotivoMantenimiento;
  enviadoAt: Date;
}

export interface RecordatoriosGateway {
  obtenerConfiguracionSmtp(schemaName: string): Promise<ConfiguracionSmtpAlmacenada | null>;
  listarVehiculosParaRecordatorio(schemaName: string): Promise<VehiculoParaRecordatorio[]>;
  registrarRecordatorio(schemaName: string, registro: RegistroRecordatorio): Promise<void>;
}

export interface EjecutarRecordatoriosDeps {
  listarTenants(): Promise<TenantRef[]>;
  gateway: RecordatoriosGateway;
  descifrarConfiguracion(fila: ConfiguracionSmtpAlmacenada): SmtpConfigDescifrada;
  enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void>;
  ahora: Date;
}

export interface ResumenRecordatorios {
  tenantsProcesados: number;
  tenantsSinSmtp: number;
  vehiculosEvaluados: number;
  enviados: number;
  omitidosPorCooldown: number;
  omitidosSinEmail: number;
  fallidos: number;
  errores: string[];
}

/** Caps the response size: a broken shared dependency could otherwise produce
 *  one error line per vehicle across every tenant. */
const MAX_ERRORES_REPORTADOS = 50;

/**
 * Only the error's class name is reported, never its message. SMTP and crypto
 * errors routinely embed hosts, usernames and -- in a badly built error string
 * -- the credential itself; this summary is returned over HTTP.
 */
function describirError(err: unknown): string {
  return err instanceof Error ? err.constructor.name : "Error desconocido";
}

export async function ejecutarRecordatorios(
  deps: EjecutarRecordatoriosDeps,
): Promise<ResumenRecordatorios> {
  const resumen: ResumenRecordatorios = {
    tenantsProcesados: 0,
    tenantsSinSmtp: 0,
    vehiculosEvaluados: 0,
    enviados: 0,
    omitidosPorCooldown: 0,
    omitidosSinEmail: 0,
    fallidos: 0,
    errores: [],
  };

  function anotarError(descripcion: string): void {
    resumen.fallidos += 1;
    if (resumen.errores.length < MAX_ERRORES_REPORTADOS) {
      resumen.errores.push(descripcion);
    }
  }

  const tenants = await deps.listarTenants();

  for (const tenant of tenants) {
    try {
      const fila = await deps.gateway.obtenerConfiguracionSmtp(tenant.schemaName);
      if (!fila || !fila.activo) {
        resumen.tenantsSinSmtp += 1;
        continue;
      }

      const smtp = deps.descifrarConfiguracion(fila);
      const vehiculos = await deps.gateway.listarVehiculosParaRecordatorio(tenant.schemaName);
      resumen.tenantsProcesados += 1;

      for (const vehiculo of vehiculos) {
        resumen.vehiculosEvaluados += 1;

        const evaluacion = evaluarMantenimiento(
          vehiculo.servicios,
          vehiculo.ultimoRecordatorioAt,
          deps.ahora,
        );
        if (!evaluacion.vencido || evaluacion.motivo === null) continue;
        if (evaluacion.bloqueadoPorCooldown) {
          resumen.omitidosPorCooldown += 1;
          continue;
        }
        if (!vehiculo.clienteEmail) {
          resumen.omitidosSinEmail += 1;
          continue;
        }

        try {
          const mensaje = construirMensajeRecordatorio(vehiculo.clienteEmail, {
            clienteNombre: vehiculo.clienteNombre,
            placa: vehiculo.placa,
            marca: vehiculo.marca,
            modelo: vehiculo.modelo,
            motivo: evaluacion.motivo,
            tallerNombre: smtp.fromNombre,
          });

          await deps.enviarEmail(smtp, mensaje);
          // Logged only after a successful send: a failed send must stay
          // retryable on the next run.
          await deps.gateway.registrarRecordatorio(tenant.schemaName, {
            vehiculoId: vehiculo.vehiculoId,
            clienteId: vehiculo.clienteId,
            emailDestino: vehiculo.clienteEmail,
            motivo: evaluacion.motivo,
            enviadoAt: deps.ahora,
          });
          resumen.enviados += 1;
        } catch (err) {
          anotarError(`[${tenant.schemaName}] ${vehiculo.placa}: ${describirError(err)}`);
        }
      }
    } catch (err) {
      anotarError(`[${tenant.schemaName}] ${describirError(err)}`);
    }
  }

  return resumen;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/recordatorios/ejecutar-recordatorios.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write the Prisma gateway**

Create `src/lib/recordatorios/gateway-prisma.ts`:

```ts
import { getTenantDb } from "@/lib/db/tenant-client";
import { CONFIGURACION_SMTP_ID, type ConfiguracionSmtpAlmacenada } from "@/lib/email/smtp-config";
import type {
  RecordatoriosGateway,
  RegistroRecordatorio,
  VehiculoParaRecordatorio,
} from "./ejecutar-recordatorios";

/**
 * The only Prisma-aware piece of the reminder feature.
 *
 * These reads are deliberately NOT sede-scoped and carry no session: this is a
 * platform-level job triggered by an external scheduler, and Clientes and
 * Vehículos are tenant-wide by design (design doc §5, módulo 12). Scoping to a
 * sede here would be meaningless -- there is no "sede activa" without a user.
 */
export const prismaRecordatoriosGateway: RecordatoriosGateway = {
  async obtenerConfiguracionSmtp(schemaName: string): Promise<ConfiguracionSmtpAlmacenada | null> {
    const tenantDb = getTenantDb(schemaName);
    const fila = await tenantDb.configuracionSmtp.findUnique({
      where: { id: CONFIGURACION_SMTP_ID },
    });
    if (!fila) return null;

    return {
      host: fila.host,
      puerto: fila.puerto,
      usuario: fila.usuario,
      passwordCifrado: fila.passwordCifrado,
      fromEmail: fila.fromEmail,
      fromNombre: fila.fromNombre,
      activo: fila.activo,
    };
  },

  async listarVehiculosParaRecordatorio(schemaName: string): Promise<VehiculoParaRecordatorio[]> {
    const tenantDb = getTenantDb(schemaName);

    const vehiculos = await tenantDb.vehiculo.findMany({
      select: {
        id: true,
        placa: true,
        marca: true,
        modelo: true,
        cliente: { select: { id: true, nombre: true, email: true } },
        // The two newest delivered órdenes: one gives the last service date and
        // odometer, the pair gives the km/day rate the projection needs.
        ordenes: {
          where: { estado: "ENTREGADA", entregadaAt: { not: null } },
          orderBy: { entregadaAt: "desc" },
          take: 2,
          select: { entregadaAt: true, kilometrajeIngreso: true },
        },
        recordatorios: {
          orderBy: { enviadoAt: "desc" },
          take: 1,
          select: { enviadoAt: true },
        },
      },
    });

    return vehiculos.map((vehiculo) => ({
      vehiculoId: vehiculo.id,
      placa: vehiculo.placa,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      clienteId: vehiculo.cliente.id,
      clienteNombre: vehiculo.cliente.nombre,
      clienteEmail: vehiculo.cliente.email,
      servicios: vehiculo.ordenes.flatMap((orden) =>
        orden.entregadaAt === null
          ? []
          : [{ fecha: orden.entregadaAt, kilometraje: orden.kilometrajeIngreso }],
      ),
      ultimoRecordatorioAt: vehiculo.recordatorios[0]?.enviadoAt ?? null,
    }));
  },

  async registrarRecordatorio(schemaName: string, registro: RegistroRecordatorio): Promise<void> {
    const tenantDb = getTenantDb(schemaName);
    await tenantDb.recordatorioEnviado.create({
      data: {
        vehiculoId: registro.vehiculoId,
        clienteId: registro.clienteId,
        emailDestino: registro.emailDestino,
        // MotivoMantenimiento's values are exactly MotivoRecordatorio's, which
        // is why mantenimiento.ts can stay free of generated Prisma types.
        motivo: registro.motivo,
        enviadoAt: registro.enviadoAt,
      },
    });
  },
};
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/recordatorios`
Expected: `tsc` silent; all reminder tests green.

```bash
git add src/lib/recordatorios/ejecutar-recordatorios.ts src/lib/recordatorios/ejecutar-recordatorios.test.ts src/lib/recordatorios/gateway-prisma.ts
git commit -m "fase7-task 11: add the partial-failure-tolerant reminder orchestrator and its Prisma gateway"
git push origin main
```

---

### Task 12: The cron-triggered reminder endpoint

**Files:**
- Create: `src/app/api/cron/recordatorios/route.ts`
- Create: `src/app/api/cron/recordatorios/route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `ejecutarRecordatorios` (Task 11), `prismaRecordatoriosGateway` (Task 11), `descifrarConfiguracionSmtp` (Task 3), `enviarEmail` (Task 10), `publicDb` (existing).
- Produces: `GET /api/cron/recordatorios` returning `ResumenRecordatorios` as JSON on 200, `{ error: "No autorizado" }` on 401.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/cron/recordatorios/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockEjecutar = vi.fn();
vi.mock("@/lib/recordatorios/ejecutar-recordatorios", () => ({
  ejecutarRecordatorios: (...args: unknown[]) => mockEjecutar(...args),
}));

vi.mock("@/lib/recordatorios/gateway-prisma", () => ({ prismaRecordatoriosGateway: {} }));
vi.mock("@/lib/email/enviar-email", () => ({ enviarEmail: vi.fn() }));
vi.mock("@/lib/email/smtp-config", () => ({ descifrarConfiguracionSmtp: vi.fn() }));

const mockTenantFindMany = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findMany: (...args: unknown[]) => mockTenantFindMany(...args) } },
}));

import { GET } from "./route";

const SECRETO = "s3cr3t0-de-cron";
const secretoOriginal = process.env.CRON_SECRET;

const RESUMEN = {
  tenantsProcesados: 2,
  tenantsSinSmtp: 1,
  vehiculosEvaluados: 9,
  enviados: 3,
  omitidosPorCooldown: 1,
  omitidosSinEmail: 2,
  fallidos: 0,
  errores: [],
};

function pedido(authorization?: string): NextRequest {
  return {
    headers: { get: (nombre: string) => (nombre.toLowerCase() === "authorization" ? authorization ?? null : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRETO;
  mockEjecutar.mockReset().mockResolvedValue(RESUMEN);
  mockTenantFindMany.mockReset().mockResolvedValue([{ schemaName: "taller_perez" }]);
});

afterEach(() => {
  if (secretoOriginal === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = secretoOriginal;
  }
});

describe("GET /api/cron/recordatorios", () => {
  it("runs the sweep and returns its summary for a correct secret", async () => {
    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RESUMEN);
    expect(mockEjecutar).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing Authorization header without running anything", async () => {
    const response = await GET(pedido(undefined));

    expect(response.status).toBe(401);
    expect(mockEjecutar).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const response = await GET(pedido("Bearer equivocado"));

    expect(response.status).toBe(401);
    expect(mockEjecutar).not.toHaveBeenCalled();
  });

  it("rejects a secret sent without the Bearer scheme", async () => {
    const response = await GET(pedido(SECRETO));

    expect(response.status).toBe(401);
    expect(mockEjecutar).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is not configured at all", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(pedido("Bearer cualquier-cosa"));

    expect(response.status).toBe(401);
    expect(mockEjecutar).not.toHaveBeenCalled();
  });

  it("also refuses an empty Bearer value when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(pedido("Bearer "));

    expect(response.status).toBe(401);
  });

  it("enumerates tenants from the public schema and injects a real clock", async () => {
    await GET(pedido(`Bearer ${SECRETO}`));

    const deps = mockEjecutar.mock.calls[0][0];
    await deps.listarTenants();

    expect(mockTenantFindMany).toHaveBeenCalledWith({ select: { schemaName: true } });
    expect(deps.ahora).toBeInstanceOf(Date);
  });

  it("returns 500 with a generic message when the sweep itself throws, leaking no internals", async () => {
    mockEjecutar.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.7:5432"));

    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.status).toBe(500);
    const cuerpo = await response.json();
    expect(cuerpo).toEqual({ error: "Error al ejecutar los recordatorios" });
    expect(JSON.stringify(cuerpo)).not.toContain("10.0.0.7");
  });

  it("marks the response uncacheable", async () => {
    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/api/cron/recordatorios/route.test.ts"`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the route**

Create `src/app/api/cron/recordatorios/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { publicDb } from "@/lib/db/public-client";
import { enviarEmail } from "@/lib/email/enviar-email";
import { descifrarConfiguracionSmtp } from "@/lib/email/smtp-config";
import { ejecutarRecordatorios } from "@/lib/recordatorios/ejecutar-recordatorios";
import { prismaRecordatoriosGateway } from "@/lib/recordatorios/gateway-prisma";

/**
 * The preventive-maintenance reminder sweep, triggered by an EXTERNAL scheduler
 * (Vercel Cron, a system crontab, any HTTP caller with the secret) rather than
 * by a signed-in user. That is why it does not call requireSession(): there is
 * no session, no tenant subdomain and no sede activa here. It is also why the
 * gateway's reads are tenant-wide and unscoped -- see gateway-prisma.ts.
 *
 * Authentication is a shared secret in "Authorization: Bearer <secret>", which
 * is exactly what Vercel Cron sends. An unset CRON_SECRET fails closed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIJO_BEARER = "Bearer ";

function autorizado(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    // Fail closed: an unconfigured secret must never mean "open to everyone".
    return false;
  }

  const encabezado = request.headers.get("authorization") ?? "";
  if (!encabezado.startsWith(PREFIJO_BEARER)) {
    return false;
  }
  const recibido = encabezado.slice(PREFIJO_BEARER.length);

  // Hash both sides first so the buffers are always 32 bytes: timingSafeEqual
  // throws on a length mismatch, and that throw would itself reveal the secret's
  // length to a probing caller.
  const digestRecibido = createHash("sha256").update(recibido).digest();
  const digestEsperado = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(digestRecibido, digestEsperado);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resumen = await ejecutarRecordatorios({
      listarTenants: () => publicDb.tenant.findMany({ select: { schemaName: true } }),
      gateway: prismaRecordatoriosGateway,
      descifrarConfiguracion: descifrarConfiguracionSmtp,
      enviarEmail,
      ahora: new Date(),
    });

    return NextResponse.json(resumen, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // ejecutarRecordatorios already absorbs per-tenant and per-vehicle failures,
    // so reaching here means the sweep could not start at all (e.g. the public
    // database is unreachable). The raw error can carry hosts and credentials.
    return NextResponse.json(
      { error: "Error al ejecutar los recordatorios" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/api/cron/recordatorios/route.test.ts"`
Expected: PASS, 9 tests.

- [ ] **Step 5: Document the two new environment variables**

In `.env.example`, append at the end of the file:

```bash
# 32-byte master key (64 hex characters) used to encrypt each tenant's SMTP
# password at rest with AES-256-GCM (src/lib/crypto/secret-box.ts). It lives
# here and never in the database: that is what stops a database dump alone from
# yielding working SMTP credentials. Generate with:
#   openssl rand -hex 32
# Rotating it makes every stored SMTP password undecryptable -- each tenant must
# then re-enter its password from /configuracion-smtp.
SMTP_ENCRYPTION_KEY="replace-with-openssl-rand-hex-32"

# Shared secret for the preventive-maintenance reminder endpoint
# (GET /api/cron/recordatorios), sent as "Authorization: Bearer <value>".
# This is NOT a user session: the endpoint is meant to be called by an external
# scheduler (Vercel Cron, a system crontab). If this variable is unset the
# endpoint answers 401 to everyone -- it fails closed, never open. Generate with:
#   openssl rand -hex 32
# Example manual invocation:
#   curl -H "Authorization: Bearer $CRON_SECRET" https://taller.zdevs.uk/api/cron/recordatorios
CRON_SECRET="replace-with-openssl-rand-hex-32"
```

- [ ] **Step 6: Set both variables in the local `.env` so the suite can run**

Run:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the value into `.env` as `SMTP_ENCRYPTION_KEY="<value>"`, then run the command again and add the second value as `CRON_SECRET="<value>"`. `.env` is gitignored — do **not** commit it.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS; `tsc` silent.

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/cron/recordatorios" .env.example
git commit -m "fase7-task 12: add the secret-gated cron endpoint for maintenance reminders"
git push origin main
```

---

### Task 13: e2e coverage — booking as RECEPCION and the cita sede boundary

**Files:**
- Modify: `e2e/global-setup.ts`
- Modify: `e2e/tenant-flow.spec.ts`

**Interfaces:**
- Consumes: routes `/citas`, `/citas/[id]` (Task 7); the Fase 6 sede-switching flow already in the spec.
- Produces: `E2E_RECEPCION_EMAIL`, `E2E_RECEPCION_PASSWORD`, `E2E_RECEPCION_NOMBRE` exported from `e2e/global-setup.ts`.

Reminder email delivery is **not** exercised here — no SMTP server exists in CI and RULES.md §2 forbids waiting on external processes. The reminder logic is covered by the unit tests in Tasks 9 and 11, which mock the transport; this task covers only what a browser can prove.

- [ ] **Step 1: Seed a RECEPCION user**

In `e2e/global-setup.ts`, add these exports next to the existing `E2E_TECNICO_*` constants:

```ts
export const E2E_RECEPCION_EMAIL = "recepcion@e2e-smoke.test";
export const E2E_RECEPCION_PASSWORD = "SmokeTest123!";
export const E2E_RECEPCION_NOMBRE = "Recep E2E";
```

And add this call at the end of `globalSetup()`, after the existing técnico `seedTenantUser` call:

```ts
  // seedTenantUser grants the tenant's oldest sede ("Sede principal"), which is
  // exactly what the cita isolation assertions below need: this user works in
  // Sede principal only.
  await seedTenantUser({
    schemaName: E2E_SCHEMA,
    email: E2E_RECEPCION_EMAIL,
    password: E2E_RECEPCION_PASSWORD,
    nombre: E2E_RECEPCION_NOMBRE,
    role: "RECEPCION",
  });
```

- [ ] **Step 2: Import the new constants in the spec**

In `e2e/tenant-flow.spec.ts`, extend the existing import block at the top so it reads:

```ts
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_RECEPCION_EMAIL,
  E2E_RECEPCION_PASSWORD,
  E2E_TECNICO_EMAIL,
  E2E_TECNICO_PASSWORD,
  E2E_TECNICO_NOMBRE,
} from "./global-setup";
```

- [ ] **Step 3: Append the Fase 7 block to the single test**

At the very end of the test body in `e2e/tenant-flow.spec.ts` — after the last existing assertion and **before** the closing `});` — append:

```ts
  // --- Fase 7: agendamiento de citas y aislamiento por sede ---

  // A RECEPCION user books on behalf of a customer who called. This user was
  // seeded into Sede principal only, which is where vehículo ABC123's orden and
  // factura already live.
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByLabel("Correo").fill(E2E_RECEPCION_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_RECEPCION_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);

  await page.getByRole("link", { name: "Citas" }).click();
  await expect(page.getByRole("heading", { name: "Citas", level: 1 })).toBeVisible();
  await expect(page.getByText("No hay citas agendadas en esta sede.")).toBeVisible();

  await page.getByLabel("Vehículo").selectOption({ label: /^ABC123 / });
  await page.getByLabel("Fecha y hora").fill("2026-09-01T10:30");
  await page.getByLabel("Motivo").fill("Mantenimiento preventivo");
  await page.getByLabel("Notas").fill("El cliente llamó para agendar");
  await page.getByRole("button", { name: "Agendar cita" }).click();
  await expect(page.getByRole("status")).toHaveText("Cita agendada");

  const enlaceCita = page.getByRole("link", { name: /ABC123 — Mantenimiento preventivo/ });
  await expect(enlaceCita).toBeVisible();
  await enlaceCita.click();
  await expect(page.getByRole("heading", { name: "Cita ABC123", level: 1 })).toBeVisible();
  await expect(page.getByText("Estado actual: PROGRAMADA")).toBeVisible();

  // Capture the detail URL while it legitimately resolves -- this exact URL is
  // the IDOR probe below.
  const citaUrl = page.url();
  expect(citaUrl).toMatch(/\/citas\/[a-z0-9]+$/);

  // RECEPCION may confirm the appointment.
  await page.getByLabel("Estado").selectOption("CONFIRMADA");
  await page.getByRole("button", { name: "Actualizar estado" }).click();
  await expect(page.getByRole("status")).toHaveText("Estado actualizado");
  await expect(page.getByText("Estado actual: CONFIRMADA")).toBeVisible();

  // --- The isolation proof: the same cita is unreachable from the other sede ---

  // ADMIN in Sede norte. ADMIN bypasses the UsuarioSede assignment check, but
  // NOT the sede scoping -- which is exactly what makes this a real boundary
  // test rather than a permissions test.
  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede norte" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);
  await expect(page.getByText("Sede: Sede norte")).toBeVisible();

  await page.goto("/citas");
  await expect(page.getByText("No hay citas agendadas en esta sede.")).toBeVisible();
  await expect(page.getByText(/Mantenimiento preventivo/)).toHaveCount(0);

  // Not just hidden from the list: pasting Sede principal's own cita URL while
  // logged into Sede norte must 404. That is getCita's findFirst + scopeCita,
  // and nothing else on this route can produce a 404.
  const citaDirectaResponse = await page.goto(citaUrl);
  expect(citaDirectaResponse?.status()).toBe(404);

  // Back in Sede principal the same ADMIN sees it again -- proof the row was
  // filtered by sede, not deleted or hidden by some other accident.
  await page.getByRole("button", { name: "Cambiar de sede" }).click();
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.goto("/citas");
  await expect(page.getByRole("link", { name: /ABC123 — Mantenimiento preventivo/ })).toBeVisible();

  // --- The SMTP settings page is ADMIN-only ---

  await page.getByRole("link", { name: "SMTP" }).click();
  await expect(page.getByRole("heading", { name: "Configuración SMTP", level: 1 })).toBeVisible();
  // Nothing stored yet, so the password is required and the test button is absent.
  await expect(page.getByLabel("Contraseña")).toHaveAttribute("required", "");
  await expect(page.getByRole("button", { name: "Enviar correo de prueba" })).toHaveCount(0);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByLabel("Correo").fill(E2E_RECEPCION_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_RECEPCION_PASSWORD);
  await page.getByLabel("Sede").selectOption({ label: "Sede principal" });
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);

  // The nav link is not even rendered for a non-ADMIN...
  await expect(page.getByRole("link", { name: "SMTP" })).toHaveCount(0);
  // ...and the URL itself is refused, not merely hidden.
  await page.goto("/configuracion-smtp");
  await expect(page).toHaveURL(/\/login\?error=forbidden$/);
```

- [ ] **Step 4: Run the e2e suite**

Requires a reachable Postgres (`TENANT_DATABASE_BASE_URL` in `.env`). Playwright starts the dev server itself via `webServer`.

Run: `npx playwright test`
Expected: 2 passed (`landing.spec.ts` and `tenant-flow.spec.ts`).

If it fails, report the failure and stop — do not retry more than once (RULES.md §1). If it cannot run at all because Postgres is unreachable, say so explicitly in the task report rather than claiming the e2e passed.

- [ ] **Step 5: Run the unit suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS; `tsc` silent.

- [ ] **Step 6: Commit**

```bash
git add e2e/global-setup.ts e2e/tenant-flow.spec.ts
git commit -m "fase7-task 13: extend the e2e smoke test through citas booking and sede isolation"
git push origin main
```

---

### Task 14: Record Fase 7 in the progress ledger

**Files:**
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: the commit hashes and test counts produced by Tasks 1–13.
- Produces: the append-only record the next phase reads instead of re-deriving conventions.

- [ ] **Step 1: Collect the facts**

Run:

```bash
git log --oneline -20
npm test 2>&1 | tail -5
```

Note the final test count and every `fase7-task N` commit hash.

- [ ] **Step 2: Append the Fase 7 section**

Add a new section to `.superpowers/sdd/progress.md`, immediately **before** the existing `# Decisiones de diseño diferidas (para fases futuras)` heading (so that section stays last), following the exact shape of the Fase 6 section:

```markdown
======================================================================

# TorqueFlow Fase 7 (Agendamiento de citas + recordatorios de mantenimiento) -- Progress Ledger

Plan: docs/superpowers/plans/2026-08-21-torqueflow-phase7-citas-recordatorios.md

Task 1: <estado> (commit <hash>). Cita/EstadoCita, ConfiguracionSmtp (singleton con CHECK id='singleton'), RecordatorioEnviado/MotivoRecordatorio + migración 20260821210000. <N>/<N> tests.

... one line per task, same style: what shipped, the commit hash, the test count,
and any correction the implementer had to make to the plan's literal code ...

## FASE 7 SUMMARY
- 14 tasks completed (final task commit <hash>)
- <N>/<N> unit tests passing, 2/2 e2e, tsc clean
- Decisiones de arquitectura tomadas en esta fase (vinculantes para Fase 8):
  - ConfiguracionSmtp es una fila singleton por schema de tenant (id literal 'singleton' + CHECK en la migración), no una tabla de filas.
  - La contraseña SMTP se guarda cifrada con AES-256-GCM (src/lib/crypto/secret-box.ts, sobre "v1:iv:tag:cipher") bajo SMTP_ENCRYPTION_KEY en .env. Rotar esa clave invalida todas las contraseñas guardadas.
  - La de-duplicación de recordatorios es la tabla RecordatorioEnviado con un cooldown fijo de 90 días, no un campo en Vehiculo.
  - El endpoint de cron (GET /api/cron/recordatorios) se autentica con CRON_SECRET en "Authorization: Bearer", comparado con timingSafeEqual sobre digests SHA-256; sin CRON_SECRET responde 401 a todos (fail closed).
  - El reloj de 6 meses lee OrdenTrabajo ENTREGADA/entregadaAt, NO HistorialVehiculo (texto libre, sin tipo de servicio, fecha por defecto now()).
  - El umbral de 5.000 km es una proyección km/día derivada de las dos lecturas de kilometrajeIngreso más recientes; con menos de dos lecturas solo aplica el umbral de tiempo.
  - Los nuevos action files llaman al guard ANTES de validar el FormData (mejora deliberada sobre la convención de Fases 2-4, que valida primero).
- Fase 8 hereda la infraestructura SMTP completa (config por tenant, cifrado, transporte Nodemailer, plantillas texto+HTML básico) y solo debe añadir las notificaciones de estado de orden (módulo 6 §5).
- Explícitamente fuera de alcance en esta fase: página pública de reservas, WhatsApp/SMS, proveedores externos de email, motores de plantillas, Plan/maxSedes (Fase 9).
- Deuda técnica documentada: <hallazgos Minor de la revisión final> + todo el backlog acumulado de Fases 1-6.
- Status: Fase 7 complete, ready for Fase 8
```

- [ ] **Step 3: Update the deferred-decisions note**

In the existing `## Fase 8 (Notificaciones automáticas al cliente, módulo 6 §5) ...` subsection, append one line at the end of its `**ACTUALIZACIÓN (2026-08-21, al planificar Fase 7)**` paragraph:

```markdown
**CONFIRMADO (al cerrar Fase 7):** la infraestructura SMTP descrita arriba ya existe y está en producción — ver la sección "TorqueFlow Fase 7" de este mismo ledger para las decisiones vinculantes (singleton ConfiguracionSmtp, sobre AES-256-GCM, cooldown de 90 días, endpoint de cron con CRON_SECRET). Fase 8 debe reutilizarla, no reconstruirla.
```

- [ ] **Step 4: Commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: record Fase 7 completion in progress ledger"
git push origin main
```

---

## Post-implementation

Once Task 14 is committed, Fase 7 is complete. The next step is a final whole-branch adversarial review, matching what Fases 2–6 each did — dispatch it separately, and record its findings in the ledger section this plan's Task 14 created.

**Highest-risk areas for that review, in order:**
1. **Secret handling.** Does any code path put a decrypted SMTP password into a log, an error message, a server-action return value, or a page prop? (`enviar-email.ts`, `smtp-actions.ts`, `ejecutar-recordatorios.ts`'s `describirError`.)
2. **The cron endpoint's auth.** Is `CRON_SECRET` genuinely fail-closed? Does `middleware.ts` (matcher `/((?!_next/static|_next/image|favicon.ico).*)`) interfere with `/api/cron/*`? It only sets a header, but confirm it.
3. **Cita sede scoping.** Is every read a `findFirst` and every write an `updateMany`/`deleteMany` carrying `scopeCita`? Is `createCitaAction`'s `sedeId` taken from the session and never from the form?
4. **The projection rule's edge cases.** Divide-by-zero, negative rates, single readings, clock skew, DST (the code uses UTC arithmetic throughout).
5. **Partial-failure tolerance.** Does a thrown `registrarRecordatorio` after a successful send cause a duplicate on the next run? (It does — one duplicate at most, bounded by the 90-day cooldown; confirm the reviewer agrees that is acceptable or files it as a Minor.)

---

## Plan self-review

**1. Spec coverage** — every required item maps to a task:

| Brief requirement | Task |
|---|---|
| Prisma migration: `Cita` + enum, `ConfiguracionSmtp`, de-dup table | 1 |
| `scopeCita` in `src/lib/sede/scope.ts` | 2 |
| SMTP encrypt/decrypt helper + unit tests | 3 |
| Zod schemas for Cita CRUD and SMTP config | 4 |
| Cita server actions (sede-scoped, IDOR-safe, role-gated; stricter delete) | 5 |
| SMTP config server actions (ADMIN-only) | 6 |
| Citas UI (list + create + edit-estate + detail) | 7 |
| SMTP config UI under an admin surface | 8 |
| Maintenance-due rule (pure, testable, 5000 km / 6 months, whichever first) | 9 |
| Nodemailer send module using a decrypted tenant config | 10 |
| Tenant enumeration, de-dup, partial-failure tolerance | 11 |
| Cron-triggered route with shared-secret auth | 12 |
| e2e: booking as RECEPCION, sede isolation; reminder logic unit-tested with a mocked transport | 13 (+9, 11) |
| Ledger record | 14 |

Design-doc coverage: módulo 7 (agendamiento) → Tasks 1, 5, 7, 13; módulo 8 (recordatorios) → Tasks 9, 10, 11, 12; §5 módulo 12's "`Cita` lleva `sede_id`" → Tasks 1, 2. §9 plan tiers deliberately untouched (deferred to Fase 9). §11 roadmap Fase 7 fully covered.

**2. Placeholder scan** — no "TBD", "TODO", "implement later", "similar to Task N", or "add appropriate error handling" appears in any step. Every code step carries the complete file or the exact insertion with its surrounding context. The only intentionally templated content is Task 14's ledger entry, whose blanks (`<hash>`, `<N>`) are facts that can only exist after execution, and Step 1 of that task states exactly how to obtain them.

**3. Type consistency** — verified across tasks:
- `scopeCita(sedeActivaId: string): { sedeId: string }` — defined Task 2, used Task 5 only.
- `CitaFormState` / `VehiculoOption` / `CitaConDetalle` — defined Task 5, consumed by Task 7's components with identical names.
- `SmtpFormState` / `ConfiguracionSmtpVista` — defined Task 6, consumed by Task 8 with identical names.
- `CONFIGURACION_SMTP_ID`, `ConfiguracionSmtpAlmacenada`, `SmtpConfigDescifrada`, `descifrarConfiguracionSmtp` — defined Task 3, used by Tasks 6, 11, 12.
- `MensajeEmail` / `enviarEmail` — defined Task 10, used by Tasks 6, 11, 12.
- `MotivoMantenimiento`, `LecturaServicio`, `evaluarMantenimiento`, `sumarMeses`, `COOLDOWN_RECORDATORIO_DIAS` — defined Task 9, used by Tasks 10, 11.
- `RecordatoriosGateway`, `VehiculoParaRecordatorio`, `RegistroRecordatorio`, `EjecutarRecordatoriosDeps`, `ResumenRecordatorios`, `ejecutarRecordatorios` — defined Task 11, implemented by `gateway-prisma.ts` in the same task, wired by Task 12.
- `MotivoMantenimiento` (`"KILOMETRAJE" | "TIEMPO"`) is value-identical to the `MotivoRecordatorio` Prisma enum from Task 1, which is what lets `gateway-prisma.ts` assign it without a cast — flagged in-code so a reviewer does not "fix" it.
- One forward reference exists and is called out explicitly: Task 6 imports `enviarEmail` from Task 10. Task 6 Step 0 gives both valid execution orders and forbids stubbing.
