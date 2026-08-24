# Fase 8 — Notificaciones Automáticas al Cliente sobre Estado de Orden — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically email the customer when their `OrdenTrabajo` moves to `EN_PROCESO`, `TERMINADA` or `ANULADA`, reusing Fase 7's SMTP infrastructure end-to-end (no new provider, no new config screen, no new secret).

**Architecture:** The notification is triggered synchronously inside `updateEstadoOrdenAction` — the same server action that already changes `estado` — right after the DB update commits. There is no cron sweep for this feature (unlike Fase 7's reminders): the estado-changing request *is* the send attempt. A pure, DB-free orchestrator (`enviarNotificacionEstadoOrden`, dependency-injected exactly like Fase 7's `ejecutarRecordatorios`) decides the outcome; all Prisma access — reading `ConfiguracionSmtp`, writing the new `NotificacionOrdenEnviada` audit row — stays in `orden-actions.ts`, the only Prisma-aware file this phase touches. A notification failure never fails or rolls back the estado change; it is surfaced to the user as a non-blocking `advertencia`, distinct from `error`.

**Tech Stack:** Next.js 16.3.0 (App Router, Server Actions), React 19.2.8, Prisma 6.19.3 (PostgreSQL, one schema per tenant), Zod 4.4.3, Nodemailer (already installed, Fase 7), Vitest 4 (jsdom), Playwright 1.62. No new dependency.

## Global Constraints

- **Binding decisions (do not re-derive, do not ask the user again):** notifications are email-only via each tenant's own SMTP (`ConfiguracionSmtp` singleton, `descifrarConfiguracionSmtp`/AES-256-GCM under `SMTP_ENCRYPTION_KEY`, `enviarEmail`, plain-text + basic-HTML body, no templating engine). NO WhatsApp/SMS (deferred to Fase 10+ — this intentionally does not implement design doc §5 módulo 6's "vía WhatsApp/SMS" wording). NO SendGrid/SES/Resend or any external email provider. NO HTML templating engine.
- **Guard chokepoint:** `updateEstadoOrdenAction` already calls `requireRole(["ADMIN","RECEPCION","TECNICO"])` before touching the database. Do not change that order; the notification step is appended strictly after the estado `update` succeeds.
- **Sede isolation:** unaffected. `orden-actions.ts` already scopes every read with `scopeOrden(session.user.sedeActivaId)` via `findFirst`. This phase does not touch that boundary.
- **Prisma naming:** camelCase fields, snake_case columns via `@map`, `@@map("tabla_en_plural")`, `cuid()` ids, hand-written migration SQL (this project has no local Postgres — migrations are written by hand and applied with `prisma migrate deploy` against the remote dev schema, same as Fase 7 Task 1).
- **User-facing copy is Spanish.**
- **Notifiable estados are exactly `EN_PROCESO`, `TERMINADA`, `ANULADA`** (see Design decision 1). `BORRADOR` is never a transition target and `ENTREGADA` is deliberately excluded.
- **Trigger point:** synchronous, inside `updateEstadoOrdenAction`, after the Prisma `update` succeeds — never a queue, never a cron endpoint.
- **Failure policy:** a notification failure (SMTP not configured, client has no email, or the send itself throws) must never fail or roll back the estado change. It is reported via a new `advertencia` field, never via `error`.
- **Commits:** one commit per task, message format `fase8-task N: descripción breve`, pushed to `main` immediately (RULES.md §3). No branch, no PR.
- **Verification cadence (RULES.md §4):** run `npx tsc --noEmit` and `npx vitest run` only at the end of a task.
- **No automatic retries (RULES.md §1):** if a command or test fails twice, stop and report.
- **Out of scope, do not build:** WhatsApp/SMS, external email providers, an HTML templating engine, a retry/queue mechanism for failed sends (there is no cron sweep for this feature, so there is nothing to retry on), a notifications history/settings UI page.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `prisma/tenant/migrations/20260824190000_add_notificacion_orden_enviada/migration.sql` | The new `ResultadoNotificacionOrden` enum + `notificaciones_orden_enviadas` table |
| `src/lib/notificaciones/plantilla.ts` (+ `.test.ts`) | Pure per-estado message builder + the `EstadoNotificable` guard |
| `src/lib/notificaciones/enviar-notificacion-estado.ts` (+ `.test.ts`) | DB-free orchestrator over injected `{ smtp, enviarEmail }` |

**Modified:** `prisma/tenant/schema.prisma`, `scripts/provision-tenant.test.ts`, `src/app/actions/orden-actions.ts` (+ `.test.ts`), `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx` (+ `.test.tsx`), `e2e/tenant-flow.spec.ts`.

---

## Design decisions locked in

1. **Notifiable estados are exactly `EN_PROCESO`, `TERMINADA`, `ANULADA`**, implemented as a type guard `esEstadoNotificable(estado: EstadoOrden): estado is EstadoNotificable` in `plantilla.ts`. `BORRADOR` has no incoming transition (`ESTADO_ORDEN_TRANSITIONS` never targets it) and `ENTREGADA` is deliberately excluded: whoever marks an orden `ENTREGADA` is doing so with the customer standing at the counter picking up the vehicle, so emailing them at that moment is redundant, not helpful.
2. **The send is synchronous with the estado change, never queued.** There is no cron sweep for this feature (unlike Fase 7's reminders), so there is no "next run" to retry a failed send on. Failure is surfaced immediately, once, to the staff member who changed the estado, via a new `advertencia` field on `EstadoFormState` — distinct from `error`, which still means "the estado change itself failed."
3. **Only two outcomes get persisted to `NotificacionOrdenEnviada`: `ENVIADA` and `FALLO_ENVIO`.** `SIN_SMTP_ACTIVO` and `SIN_EMAIL_CLIENTE` are configuration-state facts, not events — surfaced live via `advertencia`, never written — so the audit table stays a log of genuine send attempts, not a running commentary on the tenant's SMTP setup or its clients' data completeness.
4. **The audit write is best-effort**, same pattern as Fase 7's `RIESGO_DUPLICADO` handling: it runs after `enviarNotificacionEstadoOrden` resolves, in its own `try/catch`, and a failure to write it never surfaces as an action error — the email either went out or it didn't, and the estado change already committed either way.
5. **`enviarNotificacionEstadoOrden` is DB-free and dependency-injected** (`{ smtp: SmtpConfigDescifrada | null, enviarEmail }`), exactly like Fase 7's `ejecutarRecordatorios`. All Prisma access (`configuracionSmtp.findUnique`, `notificacionOrdenEnviada.create`) stays in `orden-actions.ts` — this phase adds no gateway file, because unlike the reminder cron sweep there is no multi-tenant enumeration to abstract away: the tenant is already resolved from the session.
6. **`NotificacionOrdenEnviada.resultado` reuses a 2-value Prisma enum** (`ENVIADA`, `FALLO_ENVIO`) that structurally matches the persisted subset of the TS `ResultadoNotificacion` union — same pattern as Fase 7 decision 6 (`MotivoMantenimiento` / `MotivoRecordatorio`).
7. **The estado-transition `findFirst` in `updateEstadoOrdenAction` now includes `cliente` and `vehiculo`.** It already runs once per call to validate the transition; extending its `include` costs nothing extra (no additional query) and supplies every field the notification needs (`clienteNombre`, `clienteEmail`, `placa`, `marca`, `modelo`) without a second round-trip.
8. **Roles are unchanged.** Changing estado — including to a notifiable one — stays `requireRole(["ADMIN", "RECEPCION", "TECNICO"])`, exactly as Fase 2 established. Sending a notification is a side effect of that same authorized action, not a new capability requiring its own role check.

---

### Task 1: Prisma schema + migration for `NotificacionOrdenEnviada`

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/20260824190000_add_notificacion_orden_enviada/migration.sql`
- Test: `scripts/provision-tenant.test.ts` (append one test)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: generated Prisma types `NotificacionOrdenEnviada`, `ResultadoNotificacionOrden` (`"ENVIADA" | "FALLO_ENVIO"`) from `@/generated/prisma-tenant`; table `notificaciones_orden_enviadas`.

- [ ] **Step 1: Add the enum to `prisma/tenant/schema.prisma`**

Insert immediately after the existing `enum MotivoRecordatorio { ... }` block (which ends at line 35, right before `model Usuario`):

```prisma
enum ResultadoNotificacionOrden {
  ENVIADA
  FALLO_ENVIO
}
```

- [ ] **Step 2: Add the back-relations on `OrdenTrabajo` and `Cliente`**

In `model OrdenTrabajo`, add this line directly below `factura            Factura?`:

```prisma
  notificaciones     NotificacionOrdenEnviada[]
```

In `model Cliente`, add this line directly below `recordatorios RecordatorioEnviado[]`:

```prisma
  notificacionesOrden NotificacionOrdenEnviada[]
```

- [ ] **Step 3: Append the new model at the end of `prisma/tenant/schema.prisma`**

```prisma

/// One row per order-status notification actually attempted and resolved
/// (sent or failed). Unlike RecordatorioEnviado there is no next cron sweep
/// to retry a failed send on -- the estado transition that triggers a
/// notification is a one-time event -- so the outcome must be recorded here
/// to be visible at all. Outcomes where nothing was attempted (no SMTP
/// configured, no client email on file) are surfaced immediately to the
/// staff member who changed the estado and are never written here -- see
/// the Fase 8 plan, Design decision 3.
model NotificacionOrdenEnviada {
  id           String                     @id @default(cuid())
  ordenId      String                     @map("orden_id")
  orden        OrdenTrabajo               @relation(fields: [ordenId], references: [id], onDelete: Cascade)
  clienteId    String                     @map("cliente_id")
  cliente      Cliente                    @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  estado       EstadoOrden
  emailDestino String                     @map("email_destino")
  resultado    ResultadoNotificacionOrden
  enviadoAt    DateTime                   @default(now()) @map("enviado_at")

  @@map("notificaciones_orden_enviadas")
  @@index([ordenId, enviadoAt])
  @@index([clienteId])
}
```

- [ ] **Step 4: Write the migration SQL**

Create `prisma/tenant/migrations/20260824190000_add_notificacion_orden_enviada/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "ResultadoNotificacionOrden" AS ENUM ('ENVIADA', 'FALLO_ENVIO');

-- CreateTable
CREATE TABLE "notificaciones_orden_enviadas" (
    "id" TEXT NOT NULL,
    "orden_id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "estado" "EstadoOrden" NOT NULL,
    "email_destino" TEXT NOT NULL,
    "resultado" "ResultadoNotificacionOrden" NOT NULL,
    "enviado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_orden_enviadas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_orden_enviadas_orden_id_enviado_at_idx" ON "notificaciones_orden_enviadas"("orden_id", "enviado_at");

-- CreateIndex
CREATE INDEX "notificaciones_orden_enviadas_cliente_id_idx" ON "notificaciones_orden_enviadas"("cliente_id");

-- AddForeignKey
ALTER TABLE "notificaciones_orden_enviadas" ADD CONSTRAINT "notificaciones_orden_enviadas_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones_orden_enviadas" ADD CONSTRAINT "notificaciones_orden_enviadas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Write the failing test**

Append to `scripts/provision-tenant.test.ts`, inside the existing `describe("provisionTenant", () => { ... })` block, directly after the `it("exposes the citas, configuracion_smtp and recordatorios_enviados tables on a freshly provisioned tenant", ...)` test:

```ts
  it("exposes the notificaciones_orden_enviadas table on a freshly provisioned tenant", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);

    expect(await tenantDb.notificacionOrdenEnviada.count()).toBe(0);
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run scripts/provision-tenant.test.ts -t "notificaciones_orden_enviadas"`
Expected: FAIL — `tenantDb.notificacionOrdenEnviada` is `undefined` (the Prisma client has not been regenerated yet).

- [ ] **Step 7: Regenerate the Prisma client and apply the migration to the reference schema**

Run:

```bash
npx prisma generate --schema=prisma/tenant/schema.prisma
npx prisma migrate deploy --schema=prisma/tenant/schema.prisma
```

Expected: `generate` prints "Generated Prisma Client ... to ./src/generated/prisma-tenant"; `migrate deploy` prints "1 migration found" and "Applying migration `20260824190000_add_notificacion_orden_enviada`".

If `migrate deploy` reports drift instead, STOP and report — do not run `migrate reset` (RULES.md §1).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations/20260824190000_add_notificacion_orden_enviada/migration.sql scripts/provision-tenant.test.ts src/generated/prisma-tenant
git commit -m "fase8-task 1: add NotificacionOrdenEnviada to the tenant schema"
git push origin main
```

If `src/generated/prisma-tenant` is gitignored, `git add` will say nothing was added for it — that is expected; commit the rest.

---

### Task 2: `src/lib/notificaciones/plantilla.ts` — per-estado message builder

**Files:**
- Create: `src/lib/notificaciones/plantilla.ts`
- Test: `src/lib/notificaciones/plantilla.test.ts`

**Interfaces:**
- Consumes: `MensajeEmail` from `@/lib/email/enviar-email` (Fase 7); `EstadoOrden` from `@/generated/prisma-tenant`.
- Produces: `EstadoNotificable` type, `esEstadoNotificable(estado: EstadoOrden): estado is EstadoNotificable`, `DatosMensajeEstadoOrden` interface, `construirMensajeEstadoOrden(para: string, datos: DatosMensajeEstadoOrden): MensajeEmail` — all consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/lib/notificaciones/plantilla.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  construirMensajeEstadoOrden,
  esEstadoNotificable,
  type DatosMensajeEstadoOrden,
} from "./plantilla";

const base: DatosMensajeEstadoOrden = {
  clienteNombre: "Ana Pérez",
  placa: "ABC123",
  marca: "Mazda",
  modelo: "3",
  estado: "EN_PROCESO",
  tallerNombre: "Taller Pérez",
};

describe("esEstadoNotificable", () => {
  it("accepts EN_PROCESO, TERMINADA and ANULADA", () => {
    expect(esEstadoNotificable("EN_PROCESO")).toBe(true);
    expect(esEstadoNotificable("TERMINADA")).toBe(true);
    expect(esEstadoNotificable("ANULADA")).toBe(true);
  });

  it("rejects BORRADOR and ENTREGADA", () => {
    expect(esEstadoNotificable("BORRADOR")).toBe(false);
    expect(esEstadoNotificable("ENTREGADA")).toBe(false);
  });
});

describe("construirMensajeEstadoOrden", () => {
  it("addresses the message to the given recipient", () => {
    expect(construirMensajeEstadoOrden("ana@cliente.test", base).para).toBe("ana@cliente.test");
  });

  it("names the vehicle and the estado in the subject", () => {
    expect(construirMensajeEstadoOrden("ana@cliente.test", base).asunto).toBe(
      "Tu vehículo está en reparación — ABC123",
    );
  });

  it("uses a distinct subject and body per notifiable estado", () => {
    const terminada = construirMensajeEstadoOrden("ana@cliente.test", { ...base, estado: "TERMINADA" });
    const anulada = construirMensajeEstadoOrden("ana@cliente.test", { ...base, estado: "ANULADA" });

    expect(terminada.asunto).toBe("Tu vehículo está listo para recoger — ABC123");
    expect(terminada.texto).toContain("listo para que lo recojas");
    expect(anulada.asunto).toBe("Tu orden de trabajo fue anulada — ABC123");
    expect(anulada.texto).toContain("anulada");
  });

  it("includes the customer name, the vehicle and the taller name in both bodies", () => {
    const mensaje = construirMensajeEstadoOrden("ana@cliente.test", base);

    expect(mensaje.texto).toContain("Ana Pérez");
    expect(mensaje.texto).toContain("Mazda 3 (ABC123)");
    expect(mensaje.texto).toContain("Taller Pérez");
    expect(mensaje.html).toContain("Mazda 3 (ABC123)");
  });

  it("escapes HTML-significant characters in customer data instead of injecting them", () => {
    const mensaje = construirMensajeEstadoOrden("ana@cliente.test", {
      ...base,
      clienteNombre: '<script>alert("x")</script>',
    });

    expect(mensaje.html).not.toContain("<script>");
    expect(mensaje.html).toContain("&lt;script&gt;");
  });

  it("produces a plain-text body with no markup at all", () => {
    const mensaje = construirMensajeEstadoOrden("ana@cliente.test", base);

    expect(mensaje.texto).not.toContain("<");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/notificaciones/plantilla.test.ts`
Expected: FAIL — `Cannot find module './plantilla'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/notificaciones/plantilla.ts`:

```ts
import type { MensajeEmail } from "@/lib/email/enviar-email";
import type { EstadoOrden } from "@/generated/prisma-tenant";

/**
 * The three estado transitions worth emailing a customer about. BORRADOR is
 * never a transition target (ESTADO_ORDEN_TRANSITIONS has no edge into it)
 * and ENTREGADA is deliberately excluded: whoever marks an orden ENTREGADA
 * is doing so with the customer standing at the counter, so a notification
 * at that moment is redundant, not helpful.
 */
const ESTADOS_NOTIFICABLES = ["EN_PROCESO", "TERMINADA", "ANULADA"] as const;

export type EstadoNotificable = (typeof ESTADOS_NOTIFICABLES)[number];

export function esEstadoNotificable(estado: EstadoOrden): estado is EstadoNotificable {
  return (ESTADOS_NOTIFICABLES as readonly string[]).includes(estado);
}

export interface DatosMensajeEstadoOrden {
  clienteNombre: string;
  placa: string;
  marca: string;
  modelo: string;
  estado: EstadoNotificable;
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

function asunto(estado: EstadoNotificable, placa: string): string {
  const titulos: Record<EstadoNotificable, string> = {
    EN_PROCESO: "Tu vehículo está en reparación",
    TERMINADA: "Tu vehículo está listo para recoger",
    ANULADA: "Tu orden de trabajo fue anulada",
  };
  return `${titulos[estado]} — ${placa}`;
}

function descripcion(estado: EstadoNotificable): string {
  const descripciones: Record<EstadoNotificable, string> = {
    EN_PROCESO: "entró a reparación y nuestro equipo ya está trabajando en él",
    TERMINADA: "terminó su servicio y está listo para que lo recojas",
    ANULADA: "tuvo su orden de trabajo anulada",
  };
  return descripciones[estado];
}

export function construirMensajeEstadoOrden(para: string, datos: DatosMensajeEstadoOrden): MensajeEmail {
  const vehiculo = `${datos.marca} ${datos.modelo} (${datos.placa})`;
  const descripcionTexto = descripcion(datos.estado);

  const texto = [
    `Hola ${datos.clienteNombre},`,
    "",
    `Tu vehículo ${vehiculo} ${descripcionTexto}.`,
    "",
    `— ${datos.tallerNombre}`,
  ].join("\n");

  const html = [
    `<p>Hola ${escaparHtml(datos.clienteNombre)},</p>`,
    `<p>Tu vehículo <strong>${escaparHtml(vehiculo)}</strong> ${escaparHtml(descripcionTexto)}.</p>`,
    `<p>— ${escaparHtml(datos.tallerNombre)}</p>`,
  ].join("");

  return {
    para,
    asunto: asunto(datos.estado, datos.placa),
    texto,
    html,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/notificaciones/plantilla.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/notificaciones/plantilla.ts src/lib/notificaciones/plantilla.test.ts
git commit -m "fase8-task 2: add per-estado order notification message builder"
git push origin main
```

---

### Task 3: `src/lib/notificaciones/enviar-notificacion-estado.ts` — DB-free orchestrator

**Files:**
- Create: `src/lib/notificaciones/enviar-notificacion-estado.ts`
- Test: `src/lib/notificaciones/enviar-notificacion-estado.test.ts`

**Interfaces:**
- Consumes: `esEstadoNotificable`, `construirMensajeEstadoOrden` from `./plantilla` (Task 2); `SmtpConfigDescifrada` from `@/lib/email/smtp-config` (Fase 7); `MensajeEmail` from `@/lib/email/enviar-email` (Fase 7); `EstadoOrden` from `@/generated/prisma-tenant`.
- Produces: `ResultadoNotificacion` type, `DatosNotificacionOrden` interface, `EnviarNotificacionEstadoDeps` interface, `enviarNotificacionEstadoOrden(deps: EnviarNotificacionEstadoDeps, datos: DatosNotificacionOrden): Promise<ResultadoNotificacion>` — all consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/lib/notificaciones/enviar-notificacion-estado.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { enviarNotificacionEstadoOrden, type DatosNotificacionOrden } from "./enviar-notificacion-estado";
import type { SmtpConfigDescifrada } from "@/lib/email/smtp-config";

const SMTP: SmtpConfigDescifrada = {
  host: "smtp.taller.test",
  puerto: 587,
  usuario: "avisos@taller.test",
  password: "secreto",
  fromEmail: "avisos@taller.test",
  fromNombre: "Taller Pérez",
};

const DATOS: DatosNotificacionOrden = {
  clienteNombre: "Ana Pérez",
  clienteEmail: "ana@cliente.test",
  placa: "ABC123",
  marca: "Mazda",
  modelo: "3",
  estado: "EN_PROCESO",
};

describe("enviarNotificacionEstadoOrden", () => {
  it("sends the email and returns ENVIADA when SMTP is active and the client has an email", async () => {
    const enviarEmail = vi.fn().mockResolvedValue(undefined);

    const resultado = await enviarNotificacionEstadoOrden({ smtp: SMTP, enviarEmail }, DATOS);

    expect(resultado).toBe("ENVIADA");
    expect(enviarEmail).toHaveBeenCalledWith(SMTP, expect.objectContaining({ para: "ana@cliente.test" }));
  });

  it("returns ESTADO_NO_NOTIFICABLE without touching enviarEmail for BORRADOR/ENTREGADA", async () => {
    const enviarEmail = vi.fn();

    const resultado = await enviarNotificacionEstadoOrden(
      { smtp: SMTP, enviarEmail },
      { ...DATOS, estado: "ENTREGADA" },
    );

    expect(resultado).toBe("ESTADO_NO_NOTIFICABLE");
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it("returns SIN_SMTP_ACTIVO without touching enviarEmail when smtp is null", async () => {
    const enviarEmail = vi.fn();

    const resultado = await enviarNotificacionEstadoOrden({ smtp: null, enviarEmail }, DATOS);

    expect(resultado).toBe("SIN_SMTP_ACTIVO");
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it("returns SIN_EMAIL_CLIENTE without touching enviarEmail when the client has no email", async () => {
    const enviarEmail = vi.fn();

    const resultado = await enviarNotificacionEstadoOrden(
      { smtp: SMTP, enviarEmail },
      { ...DATOS, clienteEmail: null },
    );

    expect(resultado).toBe("SIN_EMAIL_CLIENTE");
    expect(enviarEmail).not.toHaveBeenCalled();
  });

  it("returns FALLO_ENVIO when enviarEmail throws", async () => {
    const enviarEmail = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5"));

    const resultado = await enviarNotificacionEstadoOrden({ smtp: SMTP, enviarEmail }, DATOS);

    expect(resultado).toBe("FALLO_ENVIO");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/notificaciones/enviar-notificacion-estado.test.ts`
Expected: FAIL — `Cannot find module './enviar-notificacion-estado'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/notificaciones/enviar-notificacion-estado.ts`:

```ts
import type { SmtpConfigDescifrada } from "@/lib/email/smtp-config";
import type { MensajeEmail } from "@/lib/email/enviar-email";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { construirMensajeEstadoOrden, esEstadoNotificable } from "./plantilla";

/**
 * DB-free, exactly like Fase 7's ejecutarRecordatorios: every Prisma call
 * (reading ConfiguracionSmtp, writing NotificacionOrdenEnviada) stays in
 * orden-actions.ts, the only Prisma-aware module this phase touches. Unit
 * testable with plain mocks and no database.
 */
export type ResultadoNotificacion =
  | "ENVIADA"
  | "SIN_SMTP_ACTIVO"
  | "SIN_EMAIL_CLIENTE"
  | "FALLO_ENVIO"
  | "ESTADO_NO_NOTIFICABLE";

export interface DatosNotificacionOrden {
  clienteNombre: string;
  clienteEmail: string | null;
  placa: string;
  marca: string;
  modelo: string;
  estado: EstadoOrden;
}

export interface EnviarNotificacionEstadoDeps {
  /** Already decrypted; null means "not configured or not activo". */
  smtp: SmtpConfigDescifrada | null;
  enviarEmail(config: SmtpConfigDescifrada, mensaje: MensajeEmail): Promise<void>;
}

export async function enviarNotificacionEstadoOrden(
  deps: EnviarNotificacionEstadoDeps,
  datos: DatosNotificacionOrden,
): Promise<ResultadoNotificacion> {
  if (!esEstadoNotificable(datos.estado)) {
    return "ESTADO_NO_NOTIFICABLE";
  }
  if (!deps.smtp) {
    return "SIN_SMTP_ACTIVO";
  }
  if (!datos.clienteEmail) {
    return "SIN_EMAIL_CLIENTE";
  }

  const mensaje = construirMensajeEstadoOrden(datos.clienteEmail, {
    clienteNombre: datos.clienteNombre,
    placa: datos.placa,
    marca: datos.marca,
    modelo: datos.modelo,
    estado: datos.estado,
    tallerNombre: deps.smtp.fromNombre,
  });

  try {
    await deps.enviarEmail(deps.smtp, mensaje);
  } catch {
    return "FALLO_ENVIO";
  }

  return "ENVIADA";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/notificaciones/enviar-notificacion-estado.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output.

```bash
git add src/lib/notificaciones/enviar-notificacion-estado.ts src/lib/notificaciones/enviar-notificacion-estado.test.ts
git commit -m "fase8-task 3: add DB-free order-status notification orchestrator"
git push origin main
```

---

### Task 4: Wire the notification into `updateEstadoOrdenAction`, surface `advertencia` in the UI

**Files:**
- Modify: `src/app/actions/orden-actions.ts`
- Modify: `src/app/actions/orden-actions.test.ts`
- Modify: `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx`
- Modify: `e2e/tenant-flow.spec.ts`

**Interfaces:**
- Consumes: `enviarNotificacionEstadoOrden`, `EnviarNotificacionEstadoDeps`, `ResultadoNotificacion` (Task 3); `esEstadoNotificable`, `EstadoNotificable` (Task 2); `CONFIGURACION_SMTP_ID`, `descifrarConfiguracionSmtp`, `ConfiguracionSmtpAlmacenada` (Fase 7); `enviarEmail` (Fase 7); `tenantDb.configuracionSmtp.findUnique`, `tenantDb.notificacionOrdenEnviada.create` (Task 1).
- Produces: extended `EstadoFormState { error: string | null; advertencia?: string | null }` — consumed by `cambiar-estado-form.tsx` and by any future caller of `updateEstadoOrdenAction`.

- [ ] **Step 1: Update `src/app/actions/orden-actions.test.ts` — add mocks and write the failing tests**

Replace the top of the file (lines 1–29) with:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockOrdenFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockSedeFindFirst = vi.fn();
const mockUsuarioFindMany = vi.fn();
const mockConfiguracionSmtpFindUnique = vi.fn();
const mockNotificacionCreate = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: {
      create: mockCreate,
      findMany: mockFindMany,
      findFirst: mockOrdenFindFirst,
      update: mockUpdate,
    },
    sede: { findFirst: mockSedeFindFirst },
    usuario: { findMany: mockUsuarioFindMany },
    configuracionSmtp: { findUnique: mockConfiguracionSmtpFindUnique },
    notificacionOrdenEnviada: { create: mockNotificacionCreate },
  }),
}));

const mockEnviarEmail = vi.fn();
vi.mock("@/lib/email/enviar-email", () => ({
  enviarEmail: (...args: unknown[]) => mockEnviarEmail(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cifrarSecreto } from "@/lib/crypto/secret-box";
import {
  createOrdenAction,
  listOrdenes,
  listOrdenesByVehiculo,
  getOrden,
  listTecnicos,
  updateEstadoOrdenAction,
  type OrdenFormState,
  type EstadoFormState,
} from "./orden-actions";
```

Replace the entire `describe("updateEstadoOrdenAction", () => { ... })` block (originally lines 186–253) with:

```ts
describe("updateEstadoOrdenAction", () => {
  const initialEstadoState: EstadoFormState = { error: null };
  const CLAVE_VALIDA = "0".repeat(63) + "1";
  const claveOriginal = process.env.SMTP_ENCRYPTION_KEY;

  const CONFIG_SMTP_ACTIVA = {
    id: "singleton",
    host: "smtp.taller.test",
    puerto: 587,
    usuario: "avisos@taller.test",
    passwordCifrado: cifrarSecreto("secreto"),
    fromEmail: "avisos@taller.test",
    fromNombre: "Taller Pérez",
    activo: true,
  };

  const ORDEN_BASE = {
    id: "o1",
    estado: "BORRADOR" as const,
    clienteId: "c1",
    cliente: { id: "c1", nombre: "Ana Pérez", email: "ana@cliente.test" },
    vehiculo: { placa: "ABC123", marca: "Mazda", modelo: "3" },
  };

  beforeEach(() => {
    process.env.SMTP_ENCRYPTION_KEY = CLAVE_VALIDA;
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockOrdenFindFirst.mockReset();
    mockUpdate.mockReset();
    mockConfiguracionSmtpFindUnique.mockReset().mockResolvedValue(null);
    mockNotificacionCreate.mockReset().mockResolvedValue({});
    mockEnviarEmail.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (claveOriginal === undefined) {
      delete process.env.SMTP_ENCRYPTION_KEY;
    } else {
      process.env.SMTP_ENCRYPTION_KEY = claveOriginal;
    }
  });

  it("rejects an invalid estado value", async () => {
    const formData = new FormData();
    formData.set("estado", "NOT_A_REAL_ESTADO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("Estado inválido");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a transition that skips states (BORRADOR straight to TERMINADA)", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    const formData = new FormData();
    formData.set("estado", "TERMINADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("No se puede cambiar de BORRADOR a TERMINADA");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("applies a valid transition and stamps entregadaAt when moving to ENTREGADA, without attempting a notification", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "TERMINADA" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("estado", "ENTREGADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result).toEqual({ error: null, advertencia: null });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { estado: "ENTREGADA", entregadaAt: expect.any(Date), anuladaAt: undefined },
    });
    expect(mockConfiguracionSmtpFindUnique).not.toHaveBeenCalled();
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("returns 'Orden no encontrada' when the order does not exist", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("missing", initialEstadoState, formData);

    expect(result.error).toBe("Orden no encontrada");
  });

  it("refuses to change the estado of an orden from another sede", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("orden-de-otra-sede", initialEstadoState, formData);

    expect(result).toEqual({ error: "Orden no encontrada" });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      include: { cliente: true, vehiculo: true },
    });
  });

  it("sends a notification email and returns no advertencia when SMTP is configured and active", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(CONFIG_SMTP_ACTIVA);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result).toEqual({ error: null, advertencia: null });
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.taller.test" }),
      expect.objectContaining({ para: "ana@cliente.test" }),
    );
    expect(mockNotificacionCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        clienteId: "c1",
        estado: "EN_PROCESO",
        emailDestino: "ana@cliente.test",
        resultado: "ENVIADA",
      },
    });
  });

  it("returns an advertencia and does not fail the estado change when SMTP is not configured", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBeNull();
    expect(result.advertencia).toBe(
      "Estado actualizado. El correo del taller no está configurado, no se notificó al cliente.",
    );
    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockNotificacionCreate).not.toHaveBeenCalled();
  });

  it("returns an advertencia and does not fail the estado change when the client has no email", async () => {
    mockOrdenFindFirst.mockResolvedValue({
      ...ORDEN_BASE,
      estado: "BORRADOR",
      cliente: { id: "c1", nombre: "Ana Pérez", email: null },
    });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(CONFIG_SMTP_ACTIVA);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.advertencia).toBe(
      "Estado actualizado. El cliente no tiene un correo registrado, no se le notificó.",
    );
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("returns an advertencia, still succeeds, and records FALLO_ENVIO when the send throws", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(CONFIG_SMTP_ACTIVA);
    mockEnviarEmail.mockRejectedValue(new Error("ECONNREFUSED"));
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBeNull();
    expect(result.advertencia).toBe(
      "Estado actualizado, pero no se pudo enviar la notificación por correo al cliente.",
    );
    expect(mockNotificacionCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        clienteId: "c1",
        estado: "EN_PROCESO",
        emailDestino: "ana@cliente.test",
        resultado: "FALLO_ENVIO",
      },
    });
  });

  it("does not fail the action when the audit write itself throws", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "EN_PROCESO" });
    mockConfiguracionSmtpFindUnique.mockResolvedValue(CONFIG_SMTP_ACTIVA);
    mockNotificacionCreate.mockRejectedValue(new Error("FK violation"));
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result).toEqual({ error: null, advertencia: null });
  });
});
```

Leave every other `describe` block in the file (`createOrdenAction`, `listOrdenes`, `listOrdenesByVehiculo`, `getOrden`, `listTecnicos`) untouched.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: FAIL — the "refuses to change the estado..." test fails because `findFirst` is not called with `include`; the new notification tests fail because `result.advertencia` is `undefined` and `mockEnviarEmail`/`mockNotificacionCreate` are never called.

- [ ] **Step 3: Update `src/app/actions/orden-actions.ts`**

Add these imports directly below the existing `import { scopeOrden } from "@/lib/sede/scope";` line:

```ts
import {
  CONFIGURACION_SMTP_ID,
  descifrarConfiguracionSmtp,
  type ConfiguracionSmtpAlmacenada,
} from "@/lib/email/smtp-config";
import { enviarEmail } from "@/lib/email/enviar-email";
import { esEstadoNotificable, type EstadoNotificable } from "@/lib/notificaciones/plantilla";
import {
  enviarNotificacionEstadoOrden,
  type ResultadoNotificacion,
} from "@/lib/notificaciones/enviar-notificacion-estado";
```

Change the existing import line:

```ts
import { getTenantDb } from "@/lib/db/tenant-client";
```

to:

```ts
import { getTenantDb, type TenantPrismaClient } from "@/lib/db/tenant-client";
```

Replace the entire tail of the file, from `export interface EstadoFormState {` through the closing `}` of `updateEstadoOrdenAction`, with:

```ts
export interface EstadoFormState {
  error: string | null;
  advertencia?: string | null;
}

const ADVERTENCIA_POR_RESULTADO: Partial<Record<ResultadoNotificacion, string>> = {
  SIN_SMTP_ACTIVO:
    "Estado actualizado. El correo del taller no está configurado, no se notificó al cliente.",
  SIN_EMAIL_CLIENTE:
    "Estado actualizado. El cliente no tiene un correo registrado, no se le notificó.",
  FALLO_ENVIO:
    "Estado actualizado, pero no se pudo enviar la notificación por correo al cliente.",
};

async function notificarCambioEstadoOrden(
  tenantDb: TenantPrismaClient,
  params: {
    ordenId: string;
    clienteId: string;
    clienteNombre: string;
    clienteEmail: string | null;
    placa: string;
    marca: string;
    modelo: string;
    estado: EstadoNotificable;
  },
): Promise<string | null> {
  const filaSmtp = await tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
  const smtp =
    filaSmtp && filaSmtp.activo
      ? descifrarConfiguracionSmtp(filaSmtp as ConfiguracionSmtpAlmacenada)
      : null;

  const resultado = await enviarNotificacionEstadoOrden(
    { smtp, enviarEmail },
    {
      clienteNombre: params.clienteNombre,
      clienteEmail: params.clienteEmail,
      placa: params.placa,
      marca: params.marca,
      modelo: params.modelo,
      estado: params.estado,
    },
  );

  if (resultado === "ENVIADA" || resultado === "FALLO_ENVIO") {
    try {
      await tenantDb.notificacionOrdenEnviada.create({
        data: {
          ordenId: params.ordenId,
          clienteId: params.clienteId,
          estado: params.estado,
          emailDestino: params.clienteEmail as string,
          resultado,
        },
      });
    } catch {
      // Best-effort audit row: the email either went out or didn't, and the
      // estado change already committed either way. A failed log write must
      // not surface as an action error.
    }
  }

  return ADVERTENCIA_POR_RESULTADO[resultado] ?? null;
}

export async function updateEstadoOrdenAction(
  id: string,
  prevState: EstadoFormState,
  formData: FormData,
): Promise<EstadoFormState> {
  const parsedEstado = estadoOrdenSchema.safeParse(formData.get("estado"));
  if (!parsedEstado.success) {
    return { error: "Estado inválido" };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id, ...scopeOrden(session.user.sedeActivaId) },
    include: { cliente: true, vehiculo: true },
  });
  if (!orden) {
    return { error: "Orden no encontrada" };
  }

  if (!isValidEstadoTransition(orden.estado, parsedEstado.data)) {
    return { error: `No se puede cambiar de ${orden.estado} a ${parsedEstado.data}` };
  }

  try {
    await tenantDb.ordenTrabajo.update({
      where: { id },
      data: {
        estado: parsedEstado.data,
        entregadaAt: parsedEstado.data === "ENTREGADA" ? new Date() : undefined,
        anuladaAt: parsedEstado.data === "ANULADA" ? new Date() : undefined,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el estado") };
  }

  revalidatePath(`/ordenes/${id}`);

  const nuevoEstado = parsedEstado.data;
  const advertencia = esEstadoNotificable(nuevoEstado)
    ? await notificarCambioEstadoOrden(tenantDb, {
        ordenId: id,
        clienteId: orden.clienteId,
        clienteNombre: orden.cliente.nombre,
        clienteEmail: orden.cliente.email,
        placa: orden.vehiculo.placa,
        marca: orden.vehiculo.marca,
        modelo: orden.vehiculo.modelo,
        estado: nuevoEstado,
      })
    : null;

  return { error: null, advertencia };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Update `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx`**

Change:

```tsx
const initialState: EstadoFormState = { error: null };
```

to:

```tsx
const initialState: EstadoFormState = { error: null, advertencia: null };
```

Change:

```tsx
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
```

to:

```tsx
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.advertencia ? <p role="status">{state.advertencia}</p> : null}
    </form>
```

- [ ] **Step 6: Write the failing test for the new UI branch**

Append to `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx`, inside the existing `describe("CambiarEstadoForm", () => { ... })` block, after the last `it(...)`:

```tsx
  it("shows the advertencia message when the action succeeds but flags a notification issue", async () => {
    mockUpdateEstadoOrdenAction.mockResolvedValue({
      error: null,
      advertencia: "Estado actualizado. El correo del taller no está configurado, no se notificó al cliente.",
    });
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "El correo del taller no está configurado, no se notificó al cliente.",
    );
  });
```

- [ ] **Step 7: Run the component tests to verify they pass**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx"`
Expected: PASS, all tests in the file green.

- [ ] **Step 8: Extend the e2e smoke test**

In `e2e/tenant-flow.spec.ts`, directly after this existing line:

```ts
  await expect(page.getByRole("heading", { name: "Estado: EN_PROCESO" })).toBeVisible();
```

add:

```ts
  // SMTP is not configured yet at this point in the flow, so the estado
  // change must still succeed and surface a non-blocking advertencia.
  await expect(
    page.getByRole("status").filter({ hasText: "no se notificó al cliente" }),
  ).toBeVisible();
```

- [ ] **Step 9: Run the full unit/component suite and typecheck**

Run: `npx vitest run`
Expected: PASS, no regressions in any file.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add src/app/actions/orden-actions.ts src/app/actions/orden-actions.test.ts src/app/\(dashboard\)/ordenes/\[id\]/cambiar-estado-form.tsx src/app/\(dashboard\)/ordenes/\[id\]/cambiar-estado-form.test.tsx e2e/tenant-flow.spec.ts
git commit -m "fase8-task 4: send order-status notification email on estado change"
git push origin main
```

(The e2e suite itself is not run in this task per RULES.md §2 — it requires a live server and takes longer than 30s; run it manually when convenient, e.g. `npx playwright test`.)

---

## Self-review notes

- **Spec coverage:** the binding scope (email-only via Fase 7 SMTP infra, no WhatsApp/SMS, no external provider, no templating engine) is enforced by Task 3/4 never importing anything outside `@/lib/email/*` and `@/lib/notificaciones/*`. The three notifiable estados, the non-blocking failure policy, and the audit trail are each covered by a task (2, 4, 1 respectively).
- **Type consistency checked:** `EstadoNotificable` (Task 2) flows unchanged into `DatosMensajeEstadoOrden.estado` (Task 2), `DatosNotificacionOrden.estado: EstadoOrden` narrowed by `esEstadoNotificable` (Task 3), and `notificarCambioEstadoOrden`'s `params.estado: EstadoNotificable` (Task 4) — no renamed field or mismatched signature across tasks. `ResultadoNotificacion`'s 5 values (Task 3) map to exactly 2 persisted Prisma enum values (Task 1) and 3 advertencia strings (Task 4); `ESTADO_NO_NOTIFICABLE` is never persisted and never reaches `ADVERTENCIA_POR_RESULTADO` because Task 4 only calls `notificarCambioEstadoOrden` when `esEstadoNotificable` already returned true.
- **No placeholders:** every step has complete, runnable code; no "TBD" or "add error handling" prose steps.
