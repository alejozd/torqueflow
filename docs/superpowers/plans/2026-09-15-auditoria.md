# Módulo de auditoría (AuditLog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated audit trail (who did what, when) covering order cancellation, user permission changes, bodega deletion, and tenant lifecycle events — visible from the taller's own panel (ADMIN only) and from the super-admin panel.

**Architecture:** Two new Prisma models — `AuditLog` in the tenant schema, `AuditLogPlataforma` in the public schema — populated by two small helper functions (`registrarEventoAuditoria`, `registrarEventoAuditoriaPlataforma`) called explicitly, inside the same `$transaction` as the mutation they're auditing, from a curated list of existing server actions. No automatic instrumentation of every mutation (YAGNI, see spec).

**Tech Stack:** Next.js server actions, Prisma 6.19.3 (two schemas: `prisma/schema.prisma` public, `prisma/tenant/schema.prisma` per-tenant), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-15-auditoria-design.md`

## Global Constraints

- Catálogo de eventos es un enum de Prisma cerrado (`TipoEventoAuditoria`, `TipoEventoAuditoriaPlataforma`) — nunca un `String` libre. Agregar un evento nuevo requiere una migración.
- Ninguna action ni componente expone `update`/`delete` sobre `AuditLog`/`AuditLogPlataforma` — solo `create` (dentro de una transacción cuando la mutación que audita también lo está) y lecturas.
- El registro de auditoría va **dentro** de la misma transacción que la mutación que audita (o, cuando la mutación no puede envolverse en una transacción de Prisma porque involucra DDL externo como `crearTenantAction`, con un rollback compensatorio equivalente). Nunca "best-effort": una escritura de auditoría fallida revierte la operación completa.
- Panel del taller: la pantalla de auditoría es visible solo para `ADMIN` (`requireRole(["ADMIN"])`).
- Sigue los patrones ya establecidos del repo: Vitest con `tenantDb`/`publicDb` mockeados vía `vi.mock(...)`, `DataTable` + paginación client-side para listados (ningún listado del dashboard usa paginación server-side hoy), commits atómicos por tarea con `git commit` + `git push` a `main` (RULES.md).
- `tsc --noEmit` y la suite de tests corren al final de cada tarea, no durante el desarrollo (RULES.md).
- Formato de commit para este plan: `fase-auditoria-task N: descripción breve`.

---

## Task 1: Migración tenant — modelo `AuditLog`

**Files:**
- Modify: `prisma/tenant/schema.prisma` (enum tras `Role`, modelo tras `HistorialVehiculo`)
- Create: `prisma/tenant/migrations/<timestamp>_add_audit_log/migration.sql` (generado por Prisma, no escrito a mano)

**Interfaces:**
- Produces: modelo Prisma `AuditLog` (campos `id`, `tipo: TipoEventoAuditoria`, `actorId: String?`, `actor: Usuario?`, `entidadTipo: String`, `entidadId: String`, `detalle: Json?`, `createdAt: DateTime`) y enum `TipoEventoAuditoria` con los 4 valores del catálogo v1, disponibles en `@/generated/prisma-tenant` tras `prisma generate`.

- [ ] **Step 1: Editar el schema del tenant**

En `prisma/tenant/schema.prisma`, inmediatamente después del enum `Role` (línea 15, antes de la línea en blanco que sigue), agregar:

```prisma
enum TipoEventoAuditoria {
  ORDEN_ANULAR
  USUARIO_ACTUALIZAR_PERMISOS
  USUARIO_ELIMINAR
  BODEGA_ELIMINAR
}
```

Y, inmediatamente después del modelo `HistorialVehiculo` (tras la línea `}` que cierra ese modelo, línea 173), agregar:

```prisma
model AuditLog {
  id          String              @id @default(cuid())
  tipo        TipoEventoAuditoria
  actorId     String?             @map("actor_id")
  actor       Usuario?            @relation(fields: [actorId], references: [id], onDelete: SetNull)
  entidadTipo String              @map("entidad_tipo")
  entidadId   String              @map("entidad_id")
  detalle     Json?
  createdAt   DateTime            @default(now()) @map("created_at")

  @@index([tipo, createdAt])
  @@index([entidadTipo, entidadId])
  @@map("audit_log")
}
```

También agregar la relación inversa en `model Usuario` (junto a `historialEntries HistorialVehiculo[]`, línea 63):

```prisma
  auditLogEntries  AuditLog[]
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name add_audit_log --schema=prisma/tenant/schema.prisma`
Expected: crea `prisma/tenant/migrations/<timestamp>_add_audit_log/migration.sql` (un `CREATE TYPE "TipoEventoAuditoria"` + `CREATE TABLE "audit_log"` + índices + FK), lo aplica contra `TENANT_DATABASE_URL`, imprime `Your database is now in sync with your schema.` y `Generated Prisma Client`.

- [ ] **Step 3: Verificar el tipo generado**

Run: `npx tsc --noEmit`
Expected: sin errores — confirma que `src/generated/prisma-tenant` quedó regenerado con `AuditLog` y `TipoEventoAuditoria` exportados y que nada más en el árbol depende de un shape viejo del cliente.

- [ ] **Step 4: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations
git commit -m "fase-auditoria-task 1: agregar modelo AuditLog al schema tenant"
git push origin main
```

---

## Task 2: Migración public — modelo `AuditLogPlataforma`

**Files:**
- Modify: `prisma/schema.prisma` (enum tras `EstadoTenant`, modelo al final del archivo)
- Create: `prisma/migrations/<timestamp>_add_audit_log_plataforma/migration.sql` (generado por Prisma)

**Interfaces:**
- Produces: modelo Prisma `AuditLogPlataforma` (campos `id`, `tipo: TipoEventoAuditoriaPlataforma`, `superAdminId: String?`, `superAdmin: SuperAdmin?`, `tenantId: String?`, `tenant: Tenant?`, `detalle: Json?`, `createdAt: DateTime`) y enum `TipoEventoAuditoriaPlataforma` con 3 valores, disponibles en `@/generated/prisma-public` tras `prisma generate`.

- [ ] **Step 1: Editar el schema público**

En `prisma/schema.prisma`, inmediatamente después del enum `EstadoTenant` (línea 14, antes de la línea en blanco que sigue), agregar:

```prisma
enum TipoEventoAuditoriaPlataforma {
  TENANT_CREAR
  TENANT_CAMBIAR_PLAN
  TENANT_CAMBIAR_ESTADO
}
```

Y, al final del archivo (tras el modelo `SuperAdmin`, línea 68), agregar:

```prisma
model AuditLogPlataforma {
  id           String                         @id @default(cuid())
  tipo         TipoEventoAuditoriaPlataforma
  superAdminId String?                        @map("super_admin_id")
  superAdmin   SuperAdmin?                    @relation(fields: [superAdminId], references: [id], onDelete: SetNull)
  tenantId     String?                        @map("tenant_id")
  tenant       Tenant?                        @relation(fields: [tenantId], references: [id], onDelete: SetNull)
  detalle      Json?
  createdAt    DateTime                       @default(now()) @map("created_at")

  @@index([tipo, createdAt])
  @@map("audit_log_plataforma")
}
```

También agregar las relaciones inversas: en `model Tenant` (junto a `userEmails TenantUserEmail[]`, línea 37), agregar `auditLogEntries AuditLogPlataforma[]`; en `model SuperAdmin` (junto a los demás campos, antes de `createdAt`), agregar `auditLogEntries AuditLogPlataforma[]`.

- [ ] **Step 2: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name add_audit_log_plataforma --schema=prisma/schema.prisma`
Expected: crea `prisma/migrations/<timestamp>_add_audit_log_plataforma/migration.sql`, lo aplica contra `DATABASE_URL`, imprime `Your database is now in sync with your schema.` y `Generated Prisma Client`.

- [ ] **Step 3: Verificar el tipo generado**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "fase-auditoria-task 2: agregar modelo AuditLogPlataforma al schema public"
git push origin main
```

---

## Task 3: Módulos de captura

**Files:**
- Create: `src/lib/auditoria/registrarEvento.ts`
- Create: `src/lib/auditoria/registrarEvento.test.ts`
- Create: `src/lib/auditoria/registrarEventoPlataforma.ts`
- Create: `src/lib/auditoria/registrarEventoPlataforma.test.ts`

**Interfaces:**
- Consumes: `Prisma.TransactionClient` de `@/generated/prisma-tenant` y `@/generated/prisma-public` respectivamente; enums `TipoEventoAuditoria` / `TipoEventoAuditoriaPlataforma` de Task 1/2.
- Produces:
  - `registrarEventoAuditoria(tx: Prisma.TransactionClient, evento: { tipo: TipoEventoAuditoria; actorId: string | null; entidadTipo: string; entidadId: string; detalle?: Prisma.InputJsonValue }): Promise<void>` — Tasks 4-6 lo consumen.
  - `registrarEventoAuditoriaPlataforma(db: Prisma.TransactionClient, evento: { tipo: TipoEventoAuditoriaPlataforma; superAdminId: string | null; tenantId: string | null; detalle?: Prisma.InputJsonValue }): Promise<void>` — Task 7 lo consume. `db` acepta tanto un `tx` de `$transaction` como el `PrismaClient` completo (`publicDb`) para el caso de `crearTenantAction`, que no puede envolver la creación de un tenant completo en una única transacción de Prisma (ver Task 7).

- [ ] **Step 1: Escribir el test que falla, para `registrarEventoAuditoria`**

Crear `src/lib/auditoria/registrarEvento.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma-tenant";
import { registrarEventoAuditoria } from "./registrarEvento";

function buildTx(create = vi.fn()): Prisma.TransactionClient {
  return { auditLog: { create } } as unknown as Prisma.TransactionClient;
}

describe("registrarEventoAuditoria", () => {
  it("creates an AuditLog row with every field, including detalle", async () => {
    const create = vi.fn();
    const tx = buildTx(create);

    await registrarEventoAuditoria(tx, {
      tipo: "ORDEN_ANULAR",
      actorId: "u1",
      entidadTipo: "OrdenTrabajo",
      entidadId: "o1",
      detalle: { estadoAnterior: "EN_PROCESO" },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tipo: "ORDEN_ANULAR",
        actorId: "u1",
        entidadTipo: "OrdenTrabajo",
        entidadId: "o1",
        detalle: { estadoAnterior: "EN_PROCESO" },
      },
    });
  });

  it("creates a row with actorId null and no detalle", async () => {
    const create = vi.fn();
    const tx = buildTx(create);

    await registrarEventoAuditoria(tx, {
      tipo: "BODEGA_ELIMINAR",
      actorId: null,
      entidadTipo: "Bodega",
      entidadId: "b1",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tipo: "BODEGA_ELIMINAR",
        actorId: null,
        entidadTipo: "Bodega",
        entidadId: "b1",
        detalle: undefined,
      },
    });
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/auditoria/registrarEvento.test.ts`
Expected: FAIL — `Cannot find module './registrarEvento'` (el archivo todavía no existe).

- [ ] **Step 3: Implementar `registrarEvento.ts`**

Crear `src/lib/auditoria/registrarEvento.ts`:

```ts
import type { Prisma, TipoEventoAuditoria } from "@/generated/prisma-tenant";

/**
 * Recibe siempre un tx ya abierto por la action que la llama -- nunca abre
 * el suyo. Así la escritura de auditoría queda atómica con la mutación que
 * audita: si una falla, la otra se revierte con ella (ver Global Constraints
 * del plan). Ninguna action llama a auditLog.update ni .delete -- solo
 * .create (aquí) y lecturas (src/app/actions/auditoria-actions.ts).
 */
export async function registrarEventoAuditoria(
  tx: Prisma.TransactionClient,
  evento: {
    tipo: TipoEventoAuditoria;
    actorId: string | null;
    entidadTipo: string;
    entidadId: string;
    detalle?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditLog.create({ data: evento });
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/auditoria/registrarEvento.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Escribir el test que falla, para `registrarEventoAuditoriaPlataforma`**

Crear `src/lib/auditoria/registrarEventoPlataforma.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma-public";
import { registrarEventoAuditoriaPlataforma } from "./registrarEventoPlataforma";

function buildDb(create = vi.fn()): Prisma.TransactionClient {
  return { auditLogPlataforma: { create } } as unknown as Prisma.TransactionClient;
}

describe("registrarEventoAuditoriaPlataforma", () => {
  it("creates an AuditLogPlataforma row with every field", async () => {
    const create = vi.fn();
    const db = buildDb(create);

    await registrarEventoAuditoriaPlataforma(db, {
      tipo: "TENANT_CAMBIAR_ESTADO",
      superAdminId: "sa1",
      tenantId: "t1",
      detalle: { estadoNuevo: "SUSPENDIDO" },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tipo: "TENANT_CAMBIAR_ESTADO",
        superAdminId: "sa1",
        tenantId: "t1",
        detalle: { estadoNuevo: "SUSPENDIDO" },
      },
    });
  });

  it("creates a row with no detalle", async () => {
    const create = vi.fn();
    const db = buildDb(create);

    await registrarEventoAuditoriaPlataforma(db, {
      tipo: "TENANT_CREAR",
      superAdminId: "sa1",
      tenantId: "t1",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        tipo: "TENANT_CREAR",
        superAdminId: "sa1",
        tenantId: "t1",
        detalle: undefined,
      },
    });
  });
});
```

- [ ] **Step 6: Correr el test y confirmar que falla**

Run: `npx vitest run src/lib/auditoria/registrarEventoPlataforma.test.ts`
Expected: FAIL — `Cannot find module './registrarEventoPlataforma'`.

- [ ] **Step 7: Implementar `registrarEventoPlataforma.ts`**

Crear `src/lib/auditoria/registrarEventoPlataforma.ts`:

```ts
import type { Prisma, TipoEventoAuditoriaPlataforma } from "@/generated/prisma-public";

/**
 * Mismo contrato que registrarEventoAuditoria (src/lib/auditoria/registrarEvento.ts),
 * pero contra el schema public. `db` acepta un Prisma.TransactionClient real
 * (desde publicDb.$transaction) o el propio `publicDb` sin envolver: crearTenantAction
 * no puede abrir una única transacción de Prisma para todo el proceso porque
 * provisionTenant crea el schema del tenant vía DDL fuera del control de
 * Prisma -- ver Task 7.
 */
export async function registrarEventoAuditoriaPlataforma(
  db: Prisma.TransactionClient,
  evento: {
    tipo: TipoEventoAuditoriaPlataforma;
    superAdminId: string | null;
    tenantId: string | null;
    detalle?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.auditLogPlataforma.create({ data: evento });
}
```

- [ ] **Step 8: Correr el test y confirmar que pasa**

Run: `npx vitest run src/lib/auditoria/registrarEventoPlataforma.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/lib/auditoria
git commit -m "fase-auditoria-task 3: agregar módulo de captura de eventos de auditoría"
git push origin main
```

---

## Task 4: Instrumentar `updateEstadoOrdenAction` (orden.anular)

**Files:**
- Modify: `src/app/actions/orden-actions.ts:303-358`
- Modify: `src/app/actions/orden-actions.test.ts`

**Interfaces:**
- Consumes: `registrarEventoAuditoria` de `src/lib/auditoria/registrarEvento.ts` (Task 3).

- [ ] **Step 1: Modificar el mock de `tenant-client` en el test para exponer `$transaction` y `auditLog.create`**

En `src/app/actions/orden-actions.test.ts`, agregar junto a los demás `mock*` (línea 19, tras `mockVehiculoFindUnique`):

```ts
const mockAuditLogCreate = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    ordenTrabajo: { update: mockUpdate },
    auditLog: { create: mockAuditLogCreate },
  }),
);
```

Y agregar `$transaction: mockTransaction,` dentro del objeto que retorna `getTenantDb` (línea 21-33), junto a `ordenTrabajo: {...}`.

En el `beforeEach` de `describe("updateEstadoOrdenAction", ...)` (línea 329), agregar tras `mockUpdate.mockReset();`:

```ts
    mockAuditLogCreate.mockReset();
    mockTransaction.mockClear();
```

- [ ] **Step 2: Escribir los tests que fallan**

Agregar, dentro de `describe("updateEstadoOrdenAction", ...)`, tras el test `"does not fail the action when the audit write itself throws"` (tras la línea ~510 donde termina ese `it`):

```ts
  it("registers an ORDEN_ANULAR audit event, inside the same transaction as the estado update, when transitioning to ANULADA", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "BORRADOR" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "ANULADA" });
    const formData = new FormData();
    formData.set("estado", "ANULADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBeNull();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { estado: "ANULADA", entregadaAt: undefined, anuladaAt: expect.any(Date) },
    });
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        tipo: "ORDEN_ANULAR",
        actorId: "u1",
        entidadTipo: "OrdenTrabajo",
        entidadId: "o1",
        detalle: { estadoAnterior: "BORRADOR" },
      },
    });
  });

  it("does not register an audit event for transitions other than ANULADA", async () => {
    mockOrdenFindFirst.mockResolvedValue({ ...ORDEN_BASE, estado: "TERMINADA" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("estado", "ENTREGADA");

    await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/actions/orden-actions.test.ts -t "audit event"`
Expected: FAIL — `mockTransaction` fue llamado 0 veces (la action todavía llama `tenantDb.ordenTrabajo.update` directo, no `tenantDb.$transaction`).

- [ ] **Step 4: Instrumentar `updateEstadoOrdenAction`**

En `src/app/actions/orden-actions.ts`, reemplazar el bloque (líneas 328-339):

```ts
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
```

por:

```ts
  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.ordenTrabajo.update({
        where: { id },
        data: {
          estado: parsedEstado.data,
          entregadaAt: parsedEstado.data === "ENTREGADA" ? new Date() : undefined,
          anuladaAt: parsedEstado.data === "ANULADA" ? new Date() : undefined,
        },
      });
      if (parsedEstado.data === "ANULADA") {
        await registrarEventoAuditoria(tx, {
          tipo: "ORDEN_ANULAR",
          actorId: session.user.id,
          entidadTipo: "OrdenTrabajo",
          entidadId: id,
          detalle: { estadoAnterior: orden.estado },
        });
      }
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el estado") };
  }
```

Y agregar el import, junto a los demás en la cabecera del archivo (línea 22, tras el import de `enviar-notificacion-estado`):

```ts
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
```

- [ ] **Step 5: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: PASS — toda la suite del archivo, incluyendo los tests existentes de `updateEstadoOrdenAction` (que siguen viendo `mockUpdate` invocado igual, ahora vía `tx.ordenTrabajo.update`) y los dos nuevos.

- [ ] **Step 6: `tsc` y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipo; toda la suite pasa.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/orden-actions.ts src/app/actions/orden-actions.test.ts
git commit -m "fase-auditoria-task 4: auditar anulación de órdenes (ORDEN_ANULAR)"
git push origin main
```

---

## Task 5: Instrumentar `updateUsuarioAction` y `deleteUsuarioAction`

**Files:**
- Modify: `src/app/actions/usuario-actions.ts:220-359`
- Modify: `src/app/actions/usuario-actions.test.ts`

**Interfaces:**
- Consumes: `registrarEventoAuditoria` (Task 3).
- Produces: función local `construirDetalleCambiosPermisos` (no exportada, solo usada dentro de `usuario-actions.ts`).

- [ ] **Step 1: Modificar el mock de `tenant-client` en el test**

En `src/app/actions/usuario-actions.test.ts`, agregar junto a los demás `mock*` (línea 16, tras `mockOrdenGroupBy`):

```ts
const mockAuditLogCreate = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    usuario: { update: mockUsuarioUpdate, delete: mockUsuarioDelete },
    auditLog: { create: mockAuditLogCreate },
  }),
);
```

Y agregar `$transaction: mockTransaction,` dentro del objeto que retorna `getTenantDb` (línea 18-29), junto a `usuario: {...}`.

En el `beforeEach` global del archivo, agregar tras `mockUsuarioUpdate.mockReset();` (o el reset correspondiente ya existente):

```ts
    mockAuditLogCreate.mockReset();
    mockTransaction.mockClear();
```

- [ ] **Step 2: Escribir los tests que fallan, para `updateUsuarioAction`**

Localizar el `describe("updateUsuarioAction", ...)` existente y, dentro de él, agregar (ajustando el mock de `mockUsuarioFindUnique` que ya usan los tests existentes para incluir `activo` y `sedes` — ver Step 4):

```ts
  it("registers a USUARIO_ACTUALIZAR_PERMISOS audit event with only the fields that actually changed", async () => {
    mockUsuarioFindUnique.mockResolvedValue({
      role: "TECNICO",
      email: "tecnico@taller.test",
      activo: true,
      sedes: [{ sedeId: "sede-1" }],
    });
    mockSedeFindMany.mockResolvedValue([{ id: "sede-2" }]);
    mockUsuarioUpdate.mockResolvedValue({});
    const formData = new FormData();
    formData.set("nombre", "Técnico Uno");
    formData.set("email", "tecnico@taller.test");
    formData.set("role", "TECNICO");
    formData.set("activo", "on");
    formData.set("sedeIds", "sede-2");

    const result = await updateUsuarioAction("u2", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        tipo: "USUARIO_ACTUALIZAR_PERMISOS",
        actorId: "u1",
        entidadTipo: "Usuario",
        entidadId: "u2",
        detalle: { sedeIds: { antes: ["sede-1"], despues: ["sede-2"] } },
      },
    });
  });

  it("does not register an audit event when nothing about role/activo/sedeIds changed", async () => {
    mockUsuarioFindUnique.mockResolvedValue({
      role: "TECNICO",
      email: "tecnico@taller.test",
      activo: true,
      sedes: [{ sedeId: "sede-1" }],
    });
    mockSedeFindMany.mockResolvedValue([{ id: "sede-1" }]);
    mockUsuarioUpdate.mockResolvedValue({});
    const formData = new FormData();
    formData.set("nombre", "Técnico Uno (nombre editado)");
    formData.set("email", "tecnico@taller.test");
    formData.set("role", "TECNICO");
    formData.set("activo", "on");
    formData.set("sedeIds", "sede-1");

    await updateUsuarioAction("u2", initialState, formData);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Escribir el test que falla, para `deleteUsuarioAction`**

Localizar el `describe("deleteUsuarioAction", ...)` existente y agregar:

```ts
  it("registers a USUARIO_ELIMINAR audit event in the same transaction as the delete", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "TECNICO", email: "tecnico@taller.test", nombre: "Técnico Uno" });
    mockUsuarioDelete.mockResolvedValue({});

    await deleteUsuarioAction("u2");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: {
        tipo: "USUARIO_ELIMINAR",
        actorId: "u1",
        entidadTipo: "Usuario",
        entidadId: "u2",
        detalle: { nombre: "Técnico Uno", email: "tecnico@taller.test", role: "TECNICO" },
      },
    });
  });
```

- [ ] **Step 4: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/actions/usuario-actions.test.ts -t "audit"`
Expected: FAIL — tanto por `mockTransaction` no invocado como porque `mockUsuarioFindUnique`'s `select` real todavía no trae `activo`/`sedes`/`nombre`, así que ninguna implementación actual construye el `detalle` esperado.

- [ ] **Step 5: Instrumentar `updateUsuarioAction`**

En `src/app/actions/usuario-actions.ts`, ampliar el `select` de la consulta inicial (líneas 233-236):

```ts
  const usuarioActual = await tenantDb.usuario.findUnique({
    where: { id: usuarioId },
    select: { role: true, email: true, activo: true, sedes: { select: { sedeId: true } } },
  });
```

Agregar, antes de la definición de `updateUsuarioAction` (tras el bloque de constantes al inicio del archivo, junto a `EMAIL_EN_OTRO_TALLER`/`SEDE_INEXISTENTE`, línea 17-18), la función de diff:

```ts
function mismoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

/** Solo incluye en el detalle lo que realmente cambió -- una action de
 * "actualizar usuario" es un único update de formulario que puede tocar
 * varios campos a la vez, pero el evento de auditoría no debe insinuar un
 * cambio que no ocurrió. */
function construirDetalleCambiosPermisos(
  actual: { role: string; activo: boolean; sedeIds: string[] },
  nuevo: { role: string; activo: boolean; sedeIds: string[] },
): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  if (actual.role !== nuevo.role) {
    cambios.role = { antes: actual.role, despues: nuevo.role };
  }
  if (actual.activo !== nuevo.activo) {
    cambios.activo = { antes: actual.activo, despues: nuevo.activo };
  }
  if (!mismoConjunto(actual.sedeIds, nuevo.sedeIds)) {
    cambios.sedeIds = { antes: actual.sedeIds, despues: nuevo.sedeIds };
  }
  return cambios;
}
```

Reemplazar el bloque final de la función (líneas 310-314):

```ts
  try {
    await tenantDb.usuario.update({ where: { id: usuarioId }, data: datos });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el usuario"), success: false };
  }
```

por:

```ts
  const cambios = construirDetalleCambiosPermisos(
    { role: usuarioActual.role, activo: usuarioActual.activo, sedeIds: usuarioActual.sedes.map((s) => s.sedeId) },
    { role: parsed.data.role, activo: parsed.data.activo, sedeIds },
  );

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: usuarioId }, data: datos });
      if (Object.keys(cambios).length > 0) {
        await registrarEventoAuditoria(tx, {
          tipo: "USUARIO_ACTUALIZAR_PERMISOS",
          actorId: session.user.id,
          entidadTipo: "Usuario",
          entidadId: usuarioId,
          detalle: cambios,
        });
      }
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el usuario"), success: false };
  }
```

- [ ] **Step 6: Instrumentar `deleteUsuarioAction`**

En `src/app/actions/usuario-actions.ts`, ampliar el `select` de esa función (líneas 335-338):

```ts
  const usuario = await tenantDb.usuario.findUnique({
    where: { id: usuarioId },
    select: { role: true, email: true, nombre: true },
  });
```

Y reemplazar (líneas 350-354):

```ts
  try {
    await tenantDb.usuario.delete({ where: { id: usuarioId } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el usuario"));
  }
```

por:

```ts
  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.usuario.delete({ where: { id: usuarioId } });
      await registrarEventoAuditoria(tx, {
        tipo: "USUARIO_ELIMINAR",
        actorId: session.user.id,
        entidadTipo: "Usuario",
        entidadId: usuarioId,
        detalle: { nombre: usuario.nombre, email: usuario.email, role: usuario.role },
      });
    });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el usuario"));
  }
```

Agregar el import, junto a los demás en la cabecera del archivo:

```ts
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
```

- [ ] **Step 7: Actualizar los mocks de `mockUsuarioFindUnique` en los tests existentes**

Los tests preexistentes de `updateUsuarioAction`/`deleteUsuarioAction` que llaman `mockUsuarioFindUnique.mockResolvedValue({ role: ..., email: ... })` (búscalos con `grep -n "mockUsuarioFindUnique.mockResolvedValue" src/app/actions/usuario-actions.test.ts`) deben ampliarse para incluir `activo: true, sedes: []` (o el valor que corresponda a ese caso) en `updateUsuarioAction`, y `nombre: "..."` en `deleteUsuarioAction` — de lo contrario `usuarioActual.sedes.map(...)` o `usuario.nombre` fallan con `Cannot read properties of undefined`.

- [ ] **Step 8: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/actions/usuario-actions.test.ts`
Expected: PASS — toda la suite, incluyendo los tests existentes ajustados en el Step 7.

- [ ] **Step 9: `tsc` y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; toda la suite pasa.

- [ ] **Step 10: Commit**

```bash
git add src/app/actions/usuario-actions.ts src/app/actions/usuario-actions.test.ts
git commit -m "fase-auditoria-task 5: auditar cambios de permisos y eliminación de usuarios"
git push origin main
```

---

## Task 6: Instrumentar `deleteBodegaAction` (bodega.eliminar)

**Files:**
- Modify: `src/app/actions/bodega-actions.ts:118-133`
- Modify: `src/app/actions/bodega-actions.test.ts`

**Interfaces:**
- Consumes: `registrarEventoAuditoria` (Task 3).

- [ ] **Step 1: Modificar el mock de `tenant-client` en el test**

En `src/app/actions/bodega-actions.test.ts`, agregar junto a los demás `mock*` (línea 15, tras `mockSedeFindFirst`):

```ts
const mockAuditLogCreate = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    bodega: { deleteMany: mockDeleteMany },
    auditLog: { create: mockAuditLogCreate },
  }),
);
```

Y agregar `$transaction: mockTransaction,` dentro del objeto que retorna `getTenantDb` (línea 17-26), junto a `bodega: {...}`.

En el `beforeEach` del archivo, agregar el reset correspondiente para `mockAuditLogCreate` y `mockTransaction.mockClear()`.

- [ ] **Step 2: Escribir los tests que fallan**

Dentro de `describe("deleteBodegaAction", ...)` (o el bloque equivalente), agregar:

```ts
  it("registers a BODEGA_ELIMINAR audit event when the delete actually removes a row", async () => {
    mockRequireRole.mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteBodegaAction("b1");

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: { tipo: "BODEGA_ELIMINAR", actorId: undefined, entidadTipo: "Bodega", entidadId: "b1" },
    });
  });

  it("does not register an audit event when nothing matched the scoped delete", async () => {
    mockRequireRole.mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteBodegaAction("b1")).rejects.toThrow();

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
```

Nota: revisa el `SESSION_ADMIN` ya definido en este archivo (línea 43) — si no trae `user.id`, agrégalo (`{ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } }`) y cambia el `actorId` esperado arriba de `undefined` a `"u1"`.

- [ ] **Step 3: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/actions/bodega-actions.test.ts -t "audit"`
Expected: FAIL — `mockTransaction` no invocado (la action todavía llama `tenantDb.bodega.deleteMany` directo).

- [ ] **Step 4: Instrumentar `deleteBodegaAction`**

En `src/app/actions/bodega-actions.ts`, reemplazar (líneas 118-133):

```ts
export async function deleteBodegaAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  let count: number;
  try {
    ({ count } = await tenantDb.bodega.deleteMany({
      where: { id, ...scopeBodega(session.user.sedeActivaId) },
    }));
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la bodega"));
  }
  if (count === 0) {
    throw new Error(NO_ENCONTRADA);
  }
  revalidatePath("/bodegas");
}
```

por:

```ts
export async function deleteBodegaAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  let count: number;
  try {
    await tenantDb.$transaction(async (tx) => {
      ({ count } = await tx.bodega.deleteMany({
        where: { id, ...scopeBodega(session.user.sedeActivaId) },
      }));
      if (count > 0) {
        await registrarEventoAuditoria(tx, {
          tipo: "BODEGA_ELIMINAR",
          actorId: session.user.id,
          entidadTipo: "Bodega",
          entidadId: id,
        });
      }
    });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la bodega"));
  }
  if (count === 0) {
    throw new Error(NO_ENCONTRADA);
  }
  revalidatePath("/bodegas");
}
```

Agregar el import, junto a los demás en la cabecera del archivo:

```ts
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
```

- [ ] **Step 5: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/actions/bodega-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: `tsc` y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; toda la suite pasa.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/bodega-actions.ts src/app/actions/bodega-actions.test.ts
git commit -m "fase-auditoria-task 6: auditar eliminación de bodegas"
git push origin main
```

---

## Task 7: Instrumentar `super-admin-actions.ts` (eventos de plataforma)

**Files:**
- Modify: `src/app/actions/super-admin-actions.ts`
- Modify: `src/app/actions/super-admin-actions.test.ts`

**Interfaces:**
- Consumes: `registrarEventoAuditoriaPlataforma` (Task 3).

- [ ] **Step 1: Modificar el mock de `public-client` en el test**

En `src/app/actions/super-admin-actions.test.ts`, agregar junto a los demás `mock*` (línea 12, tras `mockExecuteRawUnsafe`):

```ts
const mockAuditLogPlataformaCreate = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    tenant: { update: (...args: unknown[]) => mockTenantUpdate(...args) },
    auditLogPlataforma: { create: (...args: unknown[]) => mockAuditLogPlataformaCreate(...args) },
  }),
);
```

Y en el mock de `publicDb` (líneas 13-23), agregar `auditLogPlataforma: { create: (...args: unknown[]) => mockAuditLogPlataformaCreate(...args) }` y `$transaction: (cb: (tx: unknown) => unknown) => mockTransaction(cb)` junto a `tenant`/`plan`/`$executeRawUnsafe`.

En el `beforeEach` (línea 76-87), agregar:

```ts
  mockAuditLogPlataformaCreate.mockReset();
  mockTransaction.mockClear();
```

- [ ] **Step 2: Escribir los tests que fallan, para `cambiarEstadoTenantAction` y `cambiarPlanTenantAction`**

Dentro de `describe("cambiarEstadoTenantAction", ...)`, agregar:

```ts
  it("registers a TENANT_CAMBIAR_ESTADO audit event in the same transaction as the update", async () => {
    mockTenantUpdate.mockResolvedValue({ id: "t1", estado: "SUSPENDIDO" });
    const formData = new FormData();
    formData.set("estado", "SUSPENDIDO");

    await cambiarEstadoTenantAction("t1", initialState, formData);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditLogPlataformaCreate).toHaveBeenCalledWith({
      data: {
        tipo: "TENANT_CAMBIAR_ESTADO",
        superAdminId: "sa1",
        tenantId: "t1",
        detalle: { estadoNuevo: "SUSPENDIDO" },
      },
    });
  });
```

Dentro de `describe("cambiarPlanTenantAction", ...)`, agregar:

```ts
  it("registers a TENANT_CAMBIAR_PLAN audit event in the same transaction as the update", async () => {
    mockTenantUpdate.mockResolvedValue({ id: "t1", planId: "plan_estandar" });
    const formData = new FormData();
    formData.set("planId", "plan_estandar");

    await cambiarPlanTenantAction("t1", initialState, formData);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockAuditLogPlataformaCreate).toHaveBeenCalledWith({
      data: {
        tipo: "TENANT_CAMBIAR_PLAN",
        superAdminId: "sa1",
        tenantId: "t1",
        detalle: { planIdNuevo: "plan_estandar" },
      },
    });
  });
```

- [ ] **Step 3: Escribir los tests que fallan, para `crearTenantAction`**

Extender el test existente `"provisions the tenant and its admin user..."` (línea 187-209) agregando, al final del `it`:

```ts
    expect(mockAuditLogPlataformaCreate).toHaveBeenCalledWith({
      data: {
        tipo: "TENANT_CREAR",
        superAdminId: "sa1",
        tenantId: "t1",
        detalle: { slug: "taller-familiar", nombre: "Taller Familiar Gómez", planId: "plan_basico", adminEmail: "admin@tallerfamiliar.test" },
      },
    });
```

Y agregar un test nuevo dentro de `describe("crearTenantAction", ...)`:

```ts
  it("rolls back the tenant and drops its schema when the audit write itself fails", async () => {
    mockProvisionTenant.mockResolvedValue({ id: "t1" });
    mockSeedTenantUser.mockResolvedValue({ id: "u1" });
    mockAuditLogPlataformaCreate.mockRejectedValue(new Error("connection lost"));

    const result = await crearTenantAction(initialCrearTenantState, buildCrearTenantFormData());

    expect(result.error).toBe("No se pudo registrar la auditoría del tenant, contactá soporte");
    expect(result.credenciales).toBeNull();
    expect(mockTenantDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith('DROP SCHEMA IF EXISTS "taller_familiar" CASCADE');
  });
```

- [ ] **Step 4: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/actions/super-admin-actions.test.ts -t "audit"`
Expected: FAIL — ninguna de las tres actions llama todavía a `registrarEventoAuditoriaPlataforma`/`$transaction`/`auditLogPlataforma.create`.

- [ ] **Step 5: Instrumentar `cambiarEstadoTenantAction` y `cambiarPlanTenantAction`**

En `src/app/actions/super-admin-actions.ts`, reemplazar (líneas 31-47):

```ts
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
```

por:

```ts
export async function cambiarEstadoTenantAction(
  tenantId: string,
  prevState: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const estado = formData.get("estado");
  if (estado !== "ACTIVO" && estado !== "SUSPENDIDO") {
    return { error: "Estado inválido", success: false };
  }

  const superAdmin = await requireSuperAdmin();

  await publicDb.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { estado } });
    await registrarEventoAuditoriaPlataforma(tx, {
      tipo: "TENANT_CAMBIAR_ESTADO",
      superAdminId: superAdmin.id,
      tenantId,
      detalle: { estadoNuevo: estado },
    });
  });

  revalidatePath("/superadmin");
  return { error: null, success: true };
}
```

Y (líneas 49-65):

```ts
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

por:

```ts
export async function cambiarPlanTenantAction(
  tenantId: string,
  prevState: SuperAdminFormState,
  formData: FormData,
): Promise<SuperAdminFormState> {
  const planId = String(formData.get("planId") ?? "");
  if (!planId) {
    return { error: "Selecciona un plan", success: false };
  }

  const superAdmin = await requireSuperAdmin();

  await publicDb.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenantId }, data: { planId } });
    await registrarEventoAuditoriaPlataforma(tx, {
      tipo: "TENANT_CAMBIAR_PLAN",
      superAdminId: superAdmin.id,
      tenantId,
      detalle: { planIdNuevo: planId },
    });
  });

  revalidatePath("/superadmin");
  return { error: null, success: true };
}
```

- [ ] **Step 6: Instrumentar `crearTenantAction`**

En `src/app/actions/super-admin-actions.ts`, dentro de `crearTenantAction`, cambiar la línea `await requireSuperAdmin();` (línea 90) por `const superAdmin = await requireSuperAdmin();`.

Reemplazar el final de la función (líneas 110-127):

```ts
  try {
    await seedTenantUser({ schemaName, email: adminEmail, password, nombre: adminNombre });
  } catch (err) {
    // seedTenantUser failed AFTER provisionTenant succeeded: the tenant would
    // otherwise be orphaned (schema + row, but no admin able to log in).
    await publicDb.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => {});

    if (err instanceof TenantUserEmailConflictError) {
      return { error: "Este correo ya está registrado en otro taller.", credenciales: null };
    }
    console.error(err);
    return { error: "No se pudo crear el usuario administrador, contactá soporte", credenciales: null };
  }

  revalidatePath("/superadmin");
  return { error: null, credenciales: { email: adminEmail, password } };
}
```

por:

```ts
  try {
    await seedTenantUser({ schemaName, email: adminEmail, password, nombre: adminNombre });
  } catch (err) {
    // seedTenantUser failed AFTER provisionTenant succeeded: the tenant would
    // otherwise be orphaned (schema + row, but no admin able to log in).
    await publicDb.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => {});

    if (err instanceof TenantUserEmailConflictError) {
      return { error: "Este correo ya está registrado en otro taller.", credenciales: null };
    }
    console.error(err);
    return { error: "No se pudo crear el usuario administrador, contactá soporte", credenciales: null };
  }

  try {
    // provisionTenant/seedTenantUser no están envueltos en una única
    // transacción de Prisma -- crear el schema del tenant es DDL fuera del
    // control de Prisma. Si el registro de auditoría falla aquí, se aplica
    // el mismo rollback compensatorio que la rama de arriba: un tenant que
    // existe pero nunca quedó auditado es peor que uno que nunca se creó.
    await registrarEventoAuditoriaPlataforma(publicDb, {
      tipo: "TENANT_CREAR",
      superAdminId: superAdmin.id,
      tenantId: tenant.id,
      detalle: { slug, nombre, planId, adminEmail },
    });
  } catch (err) {
    await publicDb.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => {});
    console.error(err);
    return { error: "No se pudo registrar la auditoría del tenant, contactá soporte", credenciales: null };
  }

  revalidatePath("/superadmin");
  return { error: null, credenciales: { email: adminEmail, password } };
}
```

Agregar el import, junto a los demás en la cabecera del archivo:

```ts
import { registrarEventoAuditoriaPlataforma } from "@/lib/auditoria/registrarEventoPlataforma";
```

- [ ] **Step 7: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/actions/super-admin-actions.test.ts`
Expected: PASS — toda la suite, incluyendo el test happy-path de `crearTenantAction` extendido y el nuevo de rollback.

- [ ] **Step 8: `tsc` y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; toda la suite pasa.

- [ ] **Step 9: Commit**

```bash
git add src/app/actions/super-admin-actions.ts src/app/actions/super-admin-actions.test.ts
git commit -m "fase-auditoria-task 7: auditar eventos de plataforma (crear/cambiar plan/cambiar estado de tenant)"
git push origin main
```

---

## Task 8: UI panel del taller — `/auditoria`

**Files:**
- Create: `src/app/actions/auditoria-actions.ts`
- Create: `src/app/actions/auditoria-actions.test.ts`
- Create: `src/app/(dashboard)/auditoria/page.tsx`
- Create: `src/app/(dashboard)/auditoria/loading.tsx`
- Create: `src/app/(dashboard)/auditoria/loading.test.tsx`
- Modify: `src/app/(dashboard)/dashboard-sidebar.tsx`

**Interfaces:**
- Produces: `listAuditLog(filtros?: { tipo?: TipoEventoAuditoria }): Promise<AuditLogConActor[]>`, con `AuditLogConActor = { id: string; tipo: TipoEventoAuditoria; actorNombre: string | null; entidadTipo: string; entidadId: string; detalle: unknown; createdAt: Date }`.

- [ ] **Step 1: Escribir el test que falla, para `listAuditLog`**

Crear `src/app/actions/auditoria-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAuditLogFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    auditLog: { findMany: mockAuditLogFindMany },
  }),
}));

import { listAuditLog } from "./auditoria-actions";

const SESSION_ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

beforeEach(() => {
  mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
  mockAuditLogFindMany.mockReset();
});

describe("listAuditLog", () => {
  it("requires an ADMIN session and returns events with the actor's nombre resolved", async () => {
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: "al1",
        tipo: "ORDEN_ANULAR",
        actor: { nombre: "Ana Pérez" },
        entidadTipo: "OrdenTrabajo",
        entidadId: "o1",
        detalle: { estadoAnterior: "EN_PROCESO" },
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);

    const eventos = await listAuditLog();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(eventos).toEqual([
      {
        id: "al1",
        tipo: "ORDEN_ANULAR",
        actorNombre: "Ana Pérez",
        entidadTipo: "OrdenTrabajo",
        entidadId: "o1",
        detalle: { estadoAnterior: "EN_PROCESO" },
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);
  });

  it("resolves actorNombre to null when the actor was deleted", async () => {
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: "al2",
        tipo: "USUARIO_ELIMINAR",
        actor: null,
        entidadTipo: "Usuario",
        entidadId: "u9",
        detalle: null,
        createdAt: new Date("2026-09-02T10:00:00Z"),
      },
    ]);

    const eventos = await listAuditLog();

    expect(eventos[0].actorNombre).toBeNull();
  });

  it("filters by tipo when provided", async () => {
    mockAuditLogFindMany.mockResolvedValue([]);

    await listAuditLog({ tipo: "BODEGA_ELIMINAR" });

    expect(mockAuditLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipo: "BODEGA_ELIMINAR" } }),
    );
  });
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx vitest run src/app/actions/auditoria-actions.test.ts`
Expected: FAIL — `Cannot find module './auditoria-actions'`.

- [ ] **Step 3: Implementar `auditoria-actions.ts`**

Crear `src/app/actions/auditoria-actions.ts`:

```ts
"use server";

import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import type { TipoEventoAuditoria } from "@/generated/prisma-tenant";

export interface AuditLogConActor {
  id: string;
  tipo: TipoEventoAuditoria;
  actorNombre: string | null;
  entidadTipo: string;
  entidadId: string;
  detalle: unknown;
  createdAt: Date;
}

export interface ListarAuditLogFiltros {
  tipo?: TipoEventoAuditoria;
}

/** Tope de 200 eventos más recientes -- catálogo curado (4 tipos), volumen
 * bajo por diseño (ver spec §"Alcance v1"). Mismo patrón que /usuarios y
 * /bodegas: trae la lista completa (acotada) y deja que DataTable pagine en
 * cliente, sin infraestructura de paginación server-side nueva. */
export async function listAuditLog(filtros: ListarAuditLogFiltros = {}): Promise<AuditLogConActor[]> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const eventos = await tenantDb.auditLog.findMany({
    where: { tipo: filtros.tipo },
    include: { actor: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return eventos.map((evento) => ({
    id: evento.id,
    tipo: evento.tipo,
    actorNombre: evento.actor?.nombre ?? null,
    entidadTipo: evento.entidadTipo,
    entidadId: evento.entidadId,
    detalle: evento.detalle,
    createdAt: evento.createdAt,
  }));
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `npx vitest run src/app/actions/auditoria-actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implementar la página `/auditoria`**

Crear `src/app/(dashboard)/auditoria/page.tsx`:

```tsx
import Link from "next/link";
import { listAuditLog, type AuditLogConActor } from "@/app/actions/auditoria-actions";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TipoEventoAuditoria } from "@/generated/prisma-tenant";

const TIPOS: TipoEventoAuditoria[] = [
  "ORDEN_ANULAR",
  "USUARIO_ACTUALIZAR_PERMISOS",
  "USUARIO_ELIMINAR",
  "BODEGA_ELIMINAR",
];

const TIPO_LABELS: Record<TipoEventoAuditoria, string> = {
  ORDEN_ANULAR: "Orden anulada",
  USUARIO_ACTUALIZAR_PERMISOS: "Permisos actualizados",
  USUARIO_ELIMINAR: "Usuario eliminado",
  BODEGA_ELIMINAR: "Bodega eliminada",
};

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

// Solo ORDEN_ANULAR tiene una página de detalle real hoy (/ordenes/[id]) --
// usuarios y bodegas eliminados no tienen una a la que enlazar.
function hrefEntidad(evento: AuditLogConActor): string | null {
  if (evento.entidadTipo === "OrdenTrabajo") return `/ordenes/${evento.entidadId}`;
  return null;
}

const COLUMNS: DataTableColumn<AuditLogConActor>[] = [
  { header: "Fecha", cell: (evento) => formatoFecha.format(evento.createdAt) },
  {
    header: "Evento",
    cell: (evento) => <Badge variant="outline">{TIPO_LABELS[evento.tipo]}</Badge>,
    searchValue: (evento) => TIPO_LABELS[evento.tipo],
  },
  {
    header: "Actor",
    cell: (evento) => evento.actorNombre ?? <span className="text-muted-foreground">(usuario eliminado)</span>,
    searchValue: (evento) => evento.actorNombre ?? "",
  },
  {
    header: "Entidad",
    cell: (evento) => {
      const href = hrefEntidad(evento);
      return href ? (
        <Link href={href} className="text-primary underline-offset-4 hover:underline">
          {evento.entidadTipo} · {evento.entidadId}
        </Link>
      ) : (
        <span>
          {evento.entidadTipo} · {evento.entidadId}
        </span>
      );
    },
  },
  {
    header: "Detalle",
    cell: (evento) =>
      evento.detalle ? (
        <code className="text-xs text-muted-foreground">{JSON.stringify(evento.detalle)}</code>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const tipoFiltro = TIPOS.includes(tipo as TipoEventoAuditoria) ? (tipo as TipoEventoAuditoria) : undefined;

  const eventos = await listAuditLog({ tipo: tipoFiltro });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Últimos {eventos.length} evento(s) sensible(s) registrados en este taller.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Filtrar por tipo de evento" className="flex flex-wrap gap-2">
            <Link
              href="/auditoria"
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                tipoFiltro === undefined
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
              )}
            >
              Todos
            </Link>
            {TIPOS.map((tipoOpcion) => (
              <Link
                key={tipoOpcion}
                href={`/auditoria?tipo=${tipoOpcion}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  tipoFiltro === tipoOpcion
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {TIPO_LABELS[tipoOpcion]}
              </Link>
            ))}
          </nav>

          <DataTable
            columns={COLUMNS}
            rows={eventos}
            getRowKey={(evento) => evento.id}
            emptyMessage="No hay eventos de auditoría registrados."
            searchable
            searchPlaceholder="Buscar por evento o actor..."
            pageSize={20}
          />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 6: Implementar el skeleton de carga**

Crear `src/app/(dashboard)/auditoria/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/data-table-skeleton";

export default function AuditoriaLoading() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <Skeleton className="h-4 w-64" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableSkeleton columns={5} />
        </CardContent>
      </Card>
    </main>
  );
}
```

Crear `src/app/(dashboard)/auditoria/loading.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AuditoriaLoading from "./loading";

describe("AuditoriaLoading", () => {
  it("renders without throwing", () => {
    expect(() => render(<AuditoriaLoading />)).not.toThrow();
  });

  it("shows the page title", () => {
    render(<AuditoriaLoading />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Auditoría");
  });

  it("shows the Eventos card", () => {
    render(<AuditoriaLoading />);
    expect(screen.getByText("Eventos")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Agregar el link al sidebar**

En `src/app/(dashboard)/dashboard-sidebar.tsx`, agregar `History` al import de `lucide-react` (línea 6, orden alfabético entre `FileText` y `Home`) y agregar la entrada al grupo `ADMINISTRACION` (línea 75-83), tras `Usuarios`:

```ts
    { href: "/auditoria", label: "Auditoría", icon: History },
```

- [ ] **Step 8: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/actions/auditoria-actions.test.ts "src/app/(dashboard)/auditoria/loading.test.tsx"`
Expected: PASS.

- [ ] **Step 9: `tsc` y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; toda la suite pasa.

- [ ] **Step 10: Probar manualmente**

Run: `npm run dev`
Abrir `/auditoria` logueado como ADMIN de un tenant con al menos un evento (por ejemplo, tras anular una orden en `/ordenes`). Confirmar que la tabla, el filtro por tipo y el link a la orden funcionan. Confirmar que un usuario TECNICO/RECEPCION es redirigido (`requireRole(["ADMIN"])`). Detener el servidor dev.

- [ ] **Step 11: Commit**

```bash
git add src/app/actions/auditoria-actions.ts src/app/actions/auditoria-actions.test.ts "src/app/(dashboard)/auditoria" src/app/(dashboard)/dashboard-sidebar.tsx
git commit -m "fase-auditoria-task 8: agregar pantalla de auditoría del taller"
git push origin main
```

---

## Task 9: UI super-admin — auditoría de plataforma y por tenant

**Files:**
- Modify: `src/app/actions/super-admin-actions.ts` (agregar `listAuditLogPlataforma`, `listAuditLogTenant`)
- Modify: `src/app/actions/super-admin-actions.test.ts`
- Create: `src/app/superadmin/auditoria/page.tsx`
- Create: `src/app/superadmin/auditoria/loading.tsx`
- Create: `src/app/superadmin/tenants/[tenantId]/auditoria/page.tsx`
- Modify: `src/app/superadmin/tenant-row-actions.tsx` (botón "Ver auditoría")
- Modify: `src/app/superadmin/page.tsx` (usar el botón nuevo en la columna Acciones)

**Interfaces:**
- Consumes: `listAuditLog`'s shape pattern (Task 8) adapted for `AuditLogPlataforma` and for cross-schema tenant reads.
- Produces: `listAuditLogPlataforma(): Promise<AuditLogPlataformaConSuperAdmin[]>`, `listAuditLogTenant(tenantId: string): Promise<{ tenant: { slug: string; nombre: string | null }; eventos: AuditLogConActor[] } | null>`.

- [ ] **Step 1: Escribir los tests que fallan, para las dos nuevas actions**

En `src/app/actions/super-admin-actions.test.ts`, agregar al mock de `publicDb` (Task 7 ya agregó `auditLogPlataforma.create` y `$transaction`) el método `findMany`:

```ts
const mockAuditLogPlataformaFindMany = vi.fn();
```

y, dentro del objeto `auditLogPlataforma` del mock de `publicDb`, agregar `findMany: (...args: unknown[]) => mockAuditLogPlataformaFindMany(...args)`. Agregar también `mockTenantFindUnique = vi.fn()` y, en `tenant`, `findUnique: (...args: unknown[]) => mockTenantFindUnique(...args)`.

Para la lectura cross-schema, `listAuditLogTenant` necesita `getTenantDb` devolviendo un `auditLog.findMany` mockeable: agregar `mockAuditLogFindMany = vi.fn()` y, en `mockGetTenantDb`, `auditLog: { findMany: (...args: unknown[]) => mockAuditLogFindMany(...args) }`.

Resetear los tres nuevos mocks en el `beforeEach` existente.

Agregar:

```ts
describe("listAuditLogPlataforma", () => {
  it("requires a super-admin session and returns events with the super-admin's nombre resolved", async () => {
    mockAuditLogPlataformaFindMany.mockResolvedValue([
      {
        id: "alp1",
        tipo: "TENANT_CREAR",
        superAdmin: { nombre: "Alejo" },
        tenant: { slug: "taller-familiar" },
        detalle: { slug: "taller-familiar" },
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);

    const eventos = await listAuditLogPlataforma();

    expect(mockRequireSuperAdmin).toHaveBeenCalled();
    expect(eventos).toEqual([
      {
        id: "alp1",
        tipo: "TENANT_CREAR",
        superAdminNombre: "Alejo",
        tenantSlug: "taller-familiar",
        detalle: { slug: "taller-familiar" },
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);
  });
});

describe("listAuditLogTenant", () => {
  it("resolves the tenant's schema and returns its AuditLog events", async () => {
    mockTenantFindUnique.mockResolvedValue({ slug: "taller-familiar", nombre: "Taller Familiar", schemaName: "taller_familiar" });
    mockAuditLogFindMany.mockResolvedValue([
      {
        id: "al1",
        tipo: "BODEGA_ELIMINAR",
        actor: { nombre: "Ana Pérez" },
        entidadTipo: "Bodega",
        entidadId: "b1",
        detalle: null,
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);

    const resultado = await listAuditLogTenant("t1");

    expect(mockRequireSuperAdmin).toHaveBeenCalled();
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_familiar");
    expect(resultado?.tenant).toEqual({ slug: "taller-familiar", nombre: "Taller Familiar" });
    expect(resultado?.eventos).toEqual([
      {
        id: "al1",
        tipo: "BODEGA_ELIMINAR",
        actorNombre: "Ana Pérez",
        entidadTipo: "Bodega",
        entidadId: "b1",
        detalle: null,
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);
  });

  it("returns null when the tenant does not exist", async () => {
    mockTenantFindUnique.mockResolvedValue(null);

    const resultado = await listAuditLogTenant("missing");

    expect(resultado).toBeNull();
    expect(mockGetTenantDb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npx vitest run src/app/actions/super-admin-actions.test.ts -t "listAuditLog"`
Expected: FAIL — `listAuditLogPlataforma`/`listAuditLogTenant` no existen todavía.

- [ ] **Step 3: Implementar las dos actions**

En `src/app/actions/super-admin-actions.ts`, cambiar el import existente `import type { Plan, Prisma } from "@/generated/prisma-public";` (línea 11) por:

```ts
import type { Plan, Prisma, TipoEventoAuditoriaPlataforma } from "@/generated/prisma-public";
```

Luego agregar al final del archivo:

```ts
export interface AuditLogPlataformaConSuperAdmin {
  id: string;
  tipo: TipoEventoAuditoriaPlataforma;
  superAdminNombre: string | null;
  tenantSlug: string | null;
  detalle: unknown;
  createdAt: Date;
}

export async function listAuditLogPlataforma(): Promise<AuditLogPlataformaConSuperAdmin[]> {
  await requireSuperAdmin();

  const eventos = await publicDb.auditLogPlataforma.findMany({
    include: { superAdmin: { select: { nombre: true } }, tenant: { select: { slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return eventos.map((evento) => ({
    id: evento.id,
    tipo: evento.tipo,
    superAdminNombre: evento.superAdmin?.nombre ?? null,
    tenantSlug: evento.tenant?.slug ?? null,
    detalle: evento.detalle,
    createdAt: evento.createdAt,
  }));
}

export interface AuditLogTenantEvento {
  id: string;
  tipo: string;
  actorNombre: string | null;
  entidadTipo: string;
  entidadId: string;
  detalle: unknown;
  createdAt: Date;
}

export interface AuditLogTenantResultado {
  tenant: { slug: string; nombre: string | null };
  eventos: AuditLogTenantEvento[];
}

/** El super-admin "itera tenants" para ver su auditoría (spec §1, modelo de
 * datos): AuditLog vive en el schema de cada tenant, no en public, así que
 * esta lectura resuelve el schema primero y abre ese Prisma client. */
export async function listAuditLogTenant(tenantId: string): Promise<AuditLogTenantResultado | null> {
  await requireSuperAdmin();

  const tenant = await publicDb.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, nombre: true, schemaName: true },
  });
  if (!tenant) return null;

  const tenantDb = getTenantDb(tenant.schemaName);
  const eventos = await tenantDb.auditLog.findMany({
    include: { actor: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return {
    tenant: { slug: tenant.slug, nombre: tenant.nombre },
    eventos: eventos.map((evento) => ({
      id: evento.id,
      tipo: evento.tipo,
      actorNombre: evento.actor?.nombre ?? null,
      entidadTipo: evento.entidadTipo,
      entidadId: evento.entidadId,
      detalle: evento.detalle,
      createdAt: evento.createdAt,
    })),
  };
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npx vitest run src/app/actions/super-admin-actions.test.ts`
Expected: PASS — toda la suite del archivo.

- [ ] **Step 5: Implementar la página `/superadmin/auditoria`**

Crear `src/app/superadmin/auditoria/page.tsx`:

```tsx
import Link from "next/link";
import { listAuditLogPlataforma } from "@/app/actions/super-admin-actions";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditLogPlataformaConSuperAdmin } from "@/app/actions/super-admin-actions";

const TIPO_LABELS: Record<string, string> = {
  TENANT_CREAR: "Tenant creado",
  TENANT_CAMBIAR_PLAN: "Plan cambiado",
  TENANT_CAMBIAR_ESTADO: "Estado cambiado",
};

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

const COLUMNS: DataTableColumn<AuditLogPlataformaConSuperAdmin>[] = [
  { header: "Fecha", cell: (evento) => formatoFecha.format(evento.createdAt) },
  {
    header: "Evento",
    cell: (evento) => <Badge variant="outline">{TIPO_LABELS[evento.tipo] ?? evento.tipo}</Badge>,
  },
  {
    header: "Super-admin",
    cell: (evento) => evento.superAdminNombre ?? <span className="text-muted-foreground">—</span>,
  },
  { header: "Tenant", cell: (evento) => evento.tenantSlug ?? <span className="text-muted-foreground">—</span> },
  {
    header: "Detalle",
    cell: (evento) =>
      evento.detalle ? (
        <code className="text-xs text-muted-foreground">{JSON.stringify(evento.detalle)}</code>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default async function SuperAdminAuditoriaPage() {
  await requireSuperAdmin();
  const eventos = await listAuditLogPlataforma();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Auditoría de plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Últimos {eventos.length} evento(s) de creación de tenants, cambios de plan y cambios de estado.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/superadmin" />}>
          Volver a talleres
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={eventos}
            getRowKey={(evento) => evento.id}
            emptyMessage="No hay eventos de auditoría de plataforma registrados."
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

Crear `src/app/superadmin/auditoria/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/data-table-skeleton";

export default function SuperAdminAuditoriaLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Auditoría de plataforma</h1>
        <Skeleton className="h-4 w-64" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableSkeleton columns={5} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Implementar la página de drill-down por tenant**

Crear `src/app/superadmin/tenants/[tenantId]/auditoria/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { listAuditLogTenant } from "@/app/actions/super-admin-actions";
import { requireSuperAdmin } from "@/lib/super-admin/guards";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuditLogTenantEvento } from "@/app/actions/super-admin-actions";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

const COLUMNS: DataTableColumn<AuditLogTenantEvento>[] = [
  { header: "Fecha", cell: (evento) => formatoFecha.format(evento.createdAt) },
  { header: "Evento", cell: (evento) => <Badge variant="outline">{evento.tipo}</Badge> },
  {
    header: "Actor",
    cell: (evento) => evento.actorNombre ?? <span className="text-muted-foreground">(usuario eliminado)</span>,
  },
  { header: "Entidad", cell: (evento) => `${evento.entidadTipo} · ${evento.entidadId}` },
  {
    header: "Detalle",
    cell: (evento) =>
      evento.detalle ? (
        <code className="text-xs text-muted-foreground">{JSON.stringify(evento.detalle)}</code>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export default async function SuperAdminTenantAuditoriaPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  await requireSuperAdmin();
  const { tenantId } = await params;
  const resultado = await listAuditLogTenant(tenantId);
  if (!resultado) notFound();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Auditoría de {resultado.tenant.nombre ?? resultado.tenant.slug}</h1>
          <p className="text-sm text-muted-foreground">
            {resultado.eventos.length} evento(s) registrados en este taller.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/superadmin" />}>
          Volver a talleres
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={COLUMNS}
            rows={resultado.eventos}
            getRowKey={(evento) => evento.id}
            emptyMessage="No hay eventos de auditoría registrados en este taller."
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Agregar el botón "Ver auditoría" en `tenant-row-actions.tsx`**

En `src/app/superadmin/tenant-row-actions.tsx`, agregar `Link` a los imports (línea 1-2, tras `"use client"`) y `Button` ya está importado. Agregar, al final del archivo, tras `PlanTenantSelector`:

```tsx
/** Enlaza al drill-down de auditoría de este tenant (spec §"UI y acceso"). */
export function VerAuditoriaButton({ tenantId }: { tenantId: string }) {
  return (
    <Button variant="outline" size="sm" render={<Link href={`/superadmin/tenants/${tenantId}/auditoria`} />}>
      Ver auditoría
    </Button>
  );
}
```

- [ ] **Step 8: Usar el botón nuevo en la columna Acciones de `/superadmin`**

En `src/app/superadmin/page.tsx`, agregar `VerAuditoriaButton` al import de `./tenant-row-actions` (línea 9) y modificar la columna "Acciones" (líneas 128-131):

```tsx
    {
      header: "Acciones",
      cell: (tenant) => (
        <div className="flex flex-col gap-1.5">
          <EstadoTenantButton tenantId={tenant.id} estadoActual={tenant.estado} />
          <VerAuditoriaButton tenantId={tenant.id} />
        </div>
      ),
    },
```

Y agregar un link a `/superadmin/auditoria` junto al título de la página (línea 158-172), dentro del `div` de header, tras `<CrearTenantForm planes={planes} />`:

```tsx
        <Button variant="outline" render={<Link href="/superadmin/auditoria" />}>
          Auditoría de plataforma
        </Button>
```

(agregar `Button` y `Link` a los imports de `src/app/superadmin/page.tsx` si no están ya — `Link` no está importado hoy en ese archivo, `Button` tampoco).

- [ ] **Step 9: `tsc` y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores; toda la suite pasa.

- [ ] **Step 10: Probar manualmente**

Run: `npm run dev`
Loguearse en `/superadmin/login`, confirmar que "Auditoría de plataforma" lista los eventos de creación/cambio de plan/cambio de estado ya generados durante las pruebas manuales de Tasks 4-7, y que "Ver auditoría" por tenant abre `/superadmin/tenants/[id]/auditoria` con los eventos de ese schema. Detener el servidor dev.

- [ ] **Step 11: Commit**

```bash
git add src/app/actions/super-admin-actions.ts src/app/actions/super-admin-actions.test.ts src/app/superadmin
git commit -m "fase-auditoria-task 9: agregar auditoría de plataforma y drill-down por tenant en super-admin"
git push origin main
```
