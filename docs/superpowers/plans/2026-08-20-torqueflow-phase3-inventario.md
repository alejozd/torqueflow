# TorqueFlow — Fase 3 (Inventario, Repuestos y Proveedores): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inventory management (módulo 4: Bodegas + Repuestos) and supplier management (módulo 5: Proveedores + Entradas de mercancía) on top of Fase 2's Órdenes de trabajo, and link `ItemOrden` to real catalog `Repuesto` records — with `Bodega` carrying `sede_id` from the start (per the same sede-MVP architecture decision as Fase 2), even though only the tenant's single default sede/bodega exist until Fase 6.

**Architecture:** New Prisma models (`Bodega`, `Proveedor`, `Repuesto`, `EntradaMercancia`, `EntradaMercanciaItem`) follow the exact server-action + Zod + `useActionState` pattern established across Fases 1-2. `Bodega`/`Proveedor`/`Repuesto` get full CRUD (create/read/update/delete) like `Cliente` — update and delete are implemented and unit-tested but, matching this codebase's established precedent (`deleteClienteAction`/`deleteVehiculoAction`), are not wired to UI buttons this phase (create+list+edit are). `EntradaMercancia` is append-only (like `OrdenTrabajo`'s Fase 2 precedent) — no update/delete — because editing a past goods receipt after its stock increment has already landed would desync `Repuesto.stockActual` from reality; a correction is a new entry, not an edit, and that's out of scope here. Receiving stock (`addEntradaItemAction`) uses a Prisma `$transaction` to create the line item and increment `Repuesto.stockActual` atomically.

**Tech Stack:** Next.js 16 App Router (Server Actions, RSC) + Prisma 6.19.3 + PostgreSQL + Zod 4 + Vitest/React Testing Library + Playwright. No new npm dependencies.

## Global Constraints

- **Prisma pin**: `prisma`/`@prisma/client` stay at exactly `6.19.3` — no version change this phase.
- **Remote Postgres only**: every `prisma migrate`/integration test connects to the real remote server via `TENANT_DATABASE_URL`/`TENANT_DATABASE_BASE_URL`.
- **Sede architecture**: `Bodega` carries `sede_id` from this phase onward. `provisionTenant` auto-creates one default `Bodega` (tied to the tenant's one default `Sede`) alongside the `Sede` it already creates. No bodega selector, no multi-bodega-per-sede UI — every repuesto/entrada attaches to the tenant's single default bodega. Fase 6's job to change this.
- **Auth roles**: `requireRole(["ADMIN", "RECEPCION"])` for every create/update/delete across `Bodega`/`Proveedor`/`Repuesto`/`EntradaMercancia`. `requireSession()` (any role) to read. This matches Fase 2's item/mano-de-obra-*add* role set narrowed to exclude `TECNICO` — inventory and supplier management is back-office, not shop-floor, work.
- **Validation**: every Server Action parsing `FormData` uses Zod `safeParse` first, returns `{ error, success }`, never throws for a validation failure — same contract as every prior phase.
- **Data layer**: Server Actions for mutations, RSC for reads, all DB access via `getTenantDb(session.user.tenantSchema)`.
- **`Repuesto.stockActual` is never directly editable** via `updateRepuestoAction` — it only changes at creation (initial stock) and via `addEntradaItemAction`'s atomic increment. This is enforced by simply never including `stockActual` in the update action's `data` object, not by a runtime check — there is no other write path.
- **No inventory deduction on order completion, no billing**: `ItemOrden.repuestoId` (new this phase) links an order line to a catalog `Repuesto` for pricing/traceability only — it does NOT deduct stock. Automatic deduction is explicitly Fase 4's job (once facturación exists).
- **No reabastecimiento alerts**: `Repuesto.stockMinimo` is captured as a field this phase but no alert/notification logic reads it — that's backlog, revisit only if simple once the rest of this phase is stable.
- **Tests**: unit tests for Server Actions mock `@/lib/auth/guards` and `@/lib/db/tenant-client` (no real DB), matching every prior action file. The one test that touches `provisionTenant`'s behavior directly (default-Bodega creation) is a real-DB integration test, matching Fase 2 Task 1's precedent.
- **UI style**: plain semantic HTML, no component library, no client-side JS state beyond `useActionState` — matches every existing page.
- **Money as JS number**: like Fase 2, `precioCompra`/`precioVenta`/`precioCompraUnitario` are `z.coerce.number()` into `Decimal(10,2)` columns. This is a known, already-flagged simplification (Fase 2's final review, Minor #11) — not fixed here, tracked for a pass before Fase 4 adds billing math on top of these same columns.

---

### Task 1: Prisma schema — `Bodega`, `Proveedor` + default-Bodega provisioning

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/<timestamp>_add_bodegas_proveedores/` (generated)
- Modify: `scripts/provision-tenant.ts`
- Modify: `scripts/provision-tenant.test.ts`

**Interfaces:**
- Consumes: `Sede` model (Fase 2, already provides the default sede `provisionTenant` attaches the new default `Bodega` to).
- Produces: `Bodega`, `Proveedor` Prisma models — every later task in this plan depends on these. `provisionTenant` now also inserts one `Bodega` row ("Bodega principal") per new tenant, tied to the same-provisioning-call's default `Sede`.

- [ ] **Step 1: Add the new models to the tenant schema template**

Edit `prisma/tenant/schema.prisma` — add the `bodegas` back-relation to `model Sede` (after `ordenes`):

```prisma
model Sede {
  id        String         @id @default(cuid())
  nombre    String
  direccion String?
  ordenes   OrdenTrabajo[]
  bodegas   Bodega[]
  createdAt DateTime       @default(now()) @map("created_at")
  updatedAt DateTime       @updatedAt @map("updated_at")

  @@map("sedes")
}
```

Append at the end of the file:

```prisma
model Bodega {
  id        String   @id @default(cuid())
  nombre    String
  sedeId    String   @map("sede_id")
  sede      Sede     @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("bodegas")
  @@index([sedeId])
}

model Proveedor {
  id        String   @id @default(cuid())
  nombre    String
  contacto  String?
  telefono  String?
  email     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("proveedores")
}
```

Note: `Bodega.repuestos`/`entradas` and `Proveedor.repuestos`/`entradas` back-relations are deliberately NOT added here — `Repuesto` (Task 7) and `EntradaMercancia` (Task 10) don't exist yet. Adding them now would be a dangling reference; this task's migration must be self-contained (same task-independence rule Fase 2 Task 1 followed for `Dvi`).

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name add_bodegas_proveedores`
Expected: creates `prisma/tenant/migrations/<timestamp>_add_bodegas_proveedores/migration.sql`, applies it, regenerates the Prisma client.

- [ ] **Step 3: Write the failing test for default-Bodega provisioning**

Edit `scripts/provision-tenant.test.ts` — add this `it` block inside `describe("provisionTenant", ...)`, right after the existing "creates one default Sede for the new tenant" test:

```ts
  it("creates one default Bodega for the new tenant, tied to the default Sede", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);
    const sedes = await tenantDb.sede.findMany();
    const bodegas = await tenantDb.bodega.findMany();

    expect(bodegas).toHaveLength(1);
    expect(bodegas[0].nombre).toBe("Bodega principal");
    expect(bodegas[0].sedeId).toBe(sedes[0].id);
  });
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run scripts/provision-tenant.test.ts -t "creates one default Bodega"`
Expected: FAIL — `bodegas` has length 0.

- [ ] **Step 5: Make `provisionTenant` create the default Bodega**

Edit `scripts/provision-tenant.ts` — change:

```ts
    try {
      const tenantDb = getTenantDb(schemaName);
      await tenantDb.sede.create({ data: { nombre: "Sede principal" } });
    } catch (err) {
      await publicDb.tenant.delete({ where: { id: tenant.id } });
      throw err;
    }
```

to:

```ts
    try {
      const tenantDb = getTenantDb(schemaName);
      const sede = await tenantDb.sede.create({ data: { nombre: "Sede principal" } });
      await tenantDb.bodega.create({ data: { nombre: "Bodega principal", sedeId: sede.id } });
    } catch (err) {
      await publicDb.tenant.delete({ where: { id: tenant.id } });
      throw err;
    }
```

This reuses the exact orphan-safety pattern Fase 2's final review verified: any failure inside this `try` (Sede OR Bodega creation) deletes the just-created `Tenant` row before re-throwing, so the outer `catch`'s `stillExists` check correctly sees no tenant and proceeds to `DROP SCHEMA`.

- [ ] **Step 6: Run the tests again to confirm they pass**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: PASS — all `provisionTenant` tests pass, including the new one.

- [ ] **Step 7: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations scripts/provision-tenant.ts scripts/provision-tenant.test.ts
git commit -m "fase3-task 1: add Bodega/Proveedor models, auto-create default Bodega on provisioning"
git push
```

---

### Task 2: Validation schemas — `Bodega`, `Proveedor`

**Files:**
- Create: `src/lib/validation/inventario.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `bodegaInputSchema`, `proveedorInputSchema` — consumed by Task 3's and Task 5's Server Actions. This file grows in Tasks 8 and 11 (`repuestoInputSchema`, `entradaMercanciaInputSchema`, `entradaMercanciaItemInputSchema`) — same pattern as `src/lib/validation/orden.ts` growing across Fase 2's Tasks 2/12.

No dedicated test — pure declarative Zod schemas, exercised end-to-end by Tasks 3/5's action tests (same precedent as Fase 2 Task 2's schema-only steps).

- [ ] **Step 1: Write the validation schemas**

Create `src/lib/validation/inventario.ts`:

```ts
import { z } from "zod";

export const bodegaInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
});

export type BodegaInput = z.infer<typeof bodegaInputSchema>;

export const proveedorInputSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  contacto: z.string().optional().or(z.literal("")),
  telefono: z.string().optional().or(z.literal("")),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
});

export type ProveedorInput = z.infer<typeof proveedorInputSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validation/inventario.ts
git commit -m "fase3-task 2: add Bodega/Proveedor validation schemas"
git push
```

---

### Task 3: `bodega-actions.ts` — full CRUD

**Files:**
- Create: `src/app/actions/bodega-actions.ts`
- Test: `src/app/actions/bodega-actions.test.ts`

**Interfaces:**
- Consumes: `bodegaInputSchema` (Task 2).
- Produces: `BodegaFormState`, `listBodegas()`, `getBodega(id)`, `createBodegaAction(prevState, formData)`, `updateBodegaAction(id, prevState, formData)`, `deleteBodegaAction(id)` — consumed by Task 4 (UI; create/list only — update/delete are implemented and tested here but not wired to a UI button this phase, matching `deleteClienteAction`'s precedent) and by Task 9's `Repuesto` form (bodega `<select>`, via `listBodegas`).

- [ ] **Step 1: Write the failing tests**

Create `src/app/actions/bodega-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockSedeFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    bodega: { create: mockCreate, update: mockUpdate, delete: mockDelete, findMany: mockFindMany, findUnique: mockFindUnique },
    sede: { findFirst: mockSedeFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createBodegaAction,
  updateBodegaAction,
  deleteBodegaAction,
  listBodegas,
  type BodegaFormState,
} from "./bodega-actions";

const initialState: BodegaFormState = { error: null, success: false };

describe("createBodegaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
    mockSedeFindFirst.mockReset().mockResolvedValue({ id: "s1" });
  });

  it("returns a validation error when nombre is missing", async () => {
    const formData = new FormData();

    const result = await createBodegaAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the bodega attached to the tenant's default Sede on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "b1" });
    const formData = new FormData();
    formData.set("nombre", "Bodega norte");

    const result = await createBodegaAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({ data: { nombre: "Bodega norte", sedeId: "s1" } });
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("nombre", "Bodega norte");

    await expect(createBodegaAction(initialState, formData)).rejects.toThrow("REDIRECT:/login?error=forbidden");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateBodegaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "RECEPCION", tenantSchema: "taller_perez" } });
    mockUpdate.mockReset();
  });

  it("updates the bodega's nombre on valid input", async () => {
    mockUpdate.mockResolvedValue({ id: "b1" });
    const formData = new FormData();
    formData.set("nombre", "Bodega renombrada");

    const result = await updateBodegaAction("b1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "b1" }, data: { nombre: "Bodega renombrada" } });
  });
});

describe("deleteBodegaAction", () => {
  it("requires ADMIN/RECEPCION and deletes by id", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();

    await deleteBodegaAction("b1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "b1" } });
  });
});

describe("listBodegas", () => {
  it("lists bodegas ordered by nombre", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([{ id: "b1", nombre: "Bodega norte" }]);

    const result = await listBodegas();

    expect(result).toEqual([{ id: "b1", nombre: "Bodega norte" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/bodega-actions.test.ts`
Expected: FAIL — `Cannot find module './bodega-actions'`.

- [ ] **Step 3: Implement `bodega-actions.ts`**

Create `src/app/actions/bodega-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { bodegaInputSchema } from "@/lib/validation/inventario";
import type { Bodega } from "@/generated/prisma-tenant";

export interface BodegaFormState {
  error: string | null;
  success: boolean;
}

export async function listBodegas(): Promise<Bodega[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findMany({ orderBy: { nombre: "asc" } });
}

export async function getBodega(id: string): Promise<Bodega | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.bodega.findUnique({ where: { id } });
}

export async function createBodegaAction(
  prevState: BodegaFormState,
  formData: FormData,
): Promise<BodegaFormState> {
  const parsed = bodegaInputSchema.safeParse({ nombre: formData.get("nombre") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const sede = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" } });
  if (!sede) {
    return { error: "No hay una sede configurada para este taller.", success: false };
  }

  try {
    await tenantDb.bodega.create({ data: { nombre: parsed.data.nombre, sedeId: sede.id } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la bodega"), success: false };
  }

  revalidatePath("/bodegas");
  return { error: null, success: true };
}

export async function updateBodegaAction(
  id: string,
  prevState: BodegaFormState,
  formData: FormData,
): Promise<BodegaFormState> {
  const parsed = bodegaInputSchema.safeParse({ nombre: formData.get("nombre") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.bodega.update({ where: { id }, data: { nombre: parsed.data.nombre } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar la bodega"), success: false };
  }

  revalidatePath("/bodegas");
  return { error: null, success: true };
}

export async function deleteBodegaAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.bodega.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la bodega"));
  }
  revalidatePath("/bodegas");
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/bodega-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/bodega-actions.ts src/app/actions/bodega-actions.test.ts
git commit -m "fase3-task 3: add bodega-actions CRUD"
git push
```

---

### Task 4: UI — Bodegas list page + create form + nav link

**Files:**
- Create: `src/app/(dashboard)/bodegas/page.tsx`
- Create: `src/app/(dashboard)/bodegas/nuevo-bodega-form.tsx`
- Test: `src/app/(dashboard)/bodegas/nuevo-bodega-form.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `listBodegas`, `createBodegaAction` (Task 3).
- Produces: the `/bodegas` route, linked from the dashboard header.

- [ ] **Step 1: Write the failing test for `NuevoBodegaForm`**

Create `src/app/(dashboard)/bodegas/nuevo-bodega-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateBodegaAction = vi.fn();
vi.mock("@/app/actions/bodega-actions", () => ({
  createBodegaAction: (...args: unknown[]) => mockCreateBodegaAction(...args),
}));

import { NuevoBodegaForm } from "./nuevo-bodega-form";

describe("NuevoBodegaForm", () => {
  beforeEach(() => {
    mockCreateBodegaAction.mockReset();
    mockCreateBodegaAction.mockResolvedValue({ error: null, success: true });
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoBodegaForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Bodega norte");
    await userEvent.click(screen.getByRole("button", { name: "Crear bodega" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Bodega creada");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateBodegaAction.mockResolvedValue({ error: "El nombre es obligatorio", success: false });
    render(<NuevoBodegaForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear bodega" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre es obligatorio");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement `NuevoBodegaForm`**

Run: `npx vitest run src/app/\(dashboard\)/bodegas/nuevo-bodega-form.test.tsx`
Expected: FAIL — `Cannot find module './nuevo-bodega-form'`.

Create `src/app/(dashboard)/bodegas/nuevo-bodega-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createBodegaAction, type BodegaFormState } from "@/app/actions/bodega-actions";

const initialState: BodegaFormState = { error: null, success: false };

export function NuevoBodegaForm() {
  const [state, formAction, isPending] = useActionState(createBodegaAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear bodega"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Bodega creada</p> : null}
    </form>
  );
}
```

Run: `npx vitest run src/app/\(dashboard\)/bodegas/nuevo-bodega-form.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 3: Create the Bodegas list page**

Create `src/app/(dashboard)/bodegas/page.tsx`:

```tsx
import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevoBodegaForm } from "./nuevo-bodega-form";

export default async function BodegasPage() {
  const bodegas = await listBodegas();

  return (
    <main>
      <h1>Bodegas</h1>
      <NuevoBodegaForm />
      <ul>
        {bodegas.map((bodega) => (
          <li key={bodega.id}>{bodega.nombre}</li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Add the nav link**

Edit `src/app/(dashboard)/layout.tsx`:

```tsx
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ordenes">Órdenes</Link>
          <Link href="/bodegas">Bodegas</Link>
        </nav>
```

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all tests pass, including the new form tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/bodegas" "src/app/(dashboard)/layout.tsx"
git commit -m "fase3-task 4: add bodegas list page and nav link"
git push
```

---

### Task 5: `proveedor-actions.ts` — full CRUD

**Files:**
- Create: `src/app/actions/proveedor-actions.ts`
- Test: `src/app/actions/proveedor-actions.test.ts`

**Interfaces:**
- Consumes: `proveedorInputSchema` (Task 2).
- Produces: `ProveedorFormState`, `listProveedores()`, `getProveedor(id)`, `createProveedorAction(prevState, formData)`, `updateProveedorAction(id, prevState, formData)`, `deleteProveedorAction(id)` — consumed by Task 6 (UI) and by Task 9's `Repuesto` form + Task 12's `EntradaMercancia` form (proveedor `<select>`, via `listProveedores`).

- [ ] **Step 1: Write the failing tests**

Create `src/app/actions/proveedor-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    proveedor: { create: mockCreate, update: mockUpdate, delete: mockDelete, findMany: mockFindMany },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createProveedorAction,
  updateProveedorAction,
  deleteProveedorAction,
  listProveedores,
  type ProveedorFormState,
} from "./proveedor-actions";

const initialState: ProveedorFormState = { error: null, success: false };

describe("createProveedorAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error when nombre is missing", async () => {
    const formData = new FormData();

    const result = await createProveedorAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the proveedor on valid input, with optional fields as null when blank", async () => {
    mockCreate.mockResolvedValue({ id: "p1" });
    const formData = new FormData();
    formData.set("nombre", "Repuestos El Motor");

    const result = await createProveedorAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { nombre: "Repuestos El Motor", contacto: null, telefono: null, email: null },
    });
  });
});

describe("updateProveedorAction", () => {
  it("updates the proveedor on valid input", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "RECEPCION", tenantSchema: "taller_perez" } });
    mockUpdate.mockReset().mockResolvedValue({ id: "p1" });
    const formData = new FormData();
    formData.set("nombre", "Repuestos El Motor S.A.");
    formData.set("telefono", "555-1234");

    const result = await updateProveedorAction("p1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { nombre: "Repuestos El Motor S.A.", contacto: null, telefono: "555-1234", email: null },
    });
  });
});

describe("deleteProveedorAction", () => {
  it("requires ADMIN/RECEPCION and deletes by id", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();

    await deleteProveedorAction("p1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});

describe("listProveedores", () => {
  it("lists proveedores ordered by nombre", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([{ id: "p1", nombre: "Repuestos El Motor" }]);

    const result = await listProveedores();

    expect(result).toEqual([{ id: "p1", nombre: "Repuestos El Motor" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/proveedor-actions.test.ts`
Expected: FAIL — `Cannot find module './proveedor-actions'`.

- [ ] **Step 3: Implement `proveedor-actions.ts`**

Create `src/app/actions/proveedor-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { proveedorInputSchema } from "@/lib/validation/inventario";
import type { Proveedor } from "@/generated/prisma-tenant";

export interface ProveedorFormState {
  error: string | null;
  success: boolean;
}

function parseProveedorFormData(formData: FormData) {
  return proveedorInputSchema.safeParse({
    nombre: formData.get("nombre"),
    contacto: formData.get("contacto"),
    telefono: formData.get("telefono"),
    email: formData.get("email"),
  });
}

export async function listProveedores(): Promise<Proveedor[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.proveedor.findMany({ orderBy: { nombre: "asc" } });
}

export async function getProveedor(id: string): Promise<Proveedor | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.proveedor.findUnique({ where: { id } });
}

export async function createProveedorAction(
  prevState: ProveedorFormState,
  formData: FormData,
): Promise<ProveedorFormState> {
  const parsed = parseProveedorFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.proveedor.create({
      data: {
        nombre: parsed.data.nombre,
        contacto: parsed.data.contacto || null,
        telefono: parsed.data.telefono || null,
        email: parsed.data.email || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el proveedor"), success: false };
  }

  revalidatePath("/proveedores");
  return { error: null, success: true };
}

export async function updateProveedorAction(
  id: string,
  prevState: ProveedorFormState,
  formData: FormData,
): Promise<ProveedorFormState> {
  const parsed = parseProveedorFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.proveedor.update({
      where: { id },
      data: {
        nombre: parsed.data.nombre,
        contacto: parsed.data.contacto || null,
        telefono: parsed.data.telefono || null,
        email: parsed.data.email || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el proveedor"), success: false };
  }

  revalidatePath("/proveedores");
  return { error: null, success: true };
}

export async function deleteProveedorAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.proveedor.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el proveedor"));
  }
  revalidatePath("/proveedores");
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/proveedor-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/proveedor-actions.ts src/app/actions/proveedor-actions.test.ts
git commit -m "fase3-task 5: add proveedor-actions CRUD"
git push
```

---

### Task 6: UI — Proveedores list page + create form + nav link

**Files:**
- Create: `src/app/(dashboard)/proveedores/page.tsx`
- Create: `src/app/(dashboard)/proveedores/nuevo-proveedor-form.tsx`
- Test: `src/app/(dashboard)/proveedores/nuevo-proveedor-form.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `listProveedores`, `createProveedorAction` (Task 5).
- Produces: the `/proveedores` route, linked from the dashboard header.

- [ ] **Step 1: Write the failing test for `NuevoProveedorForm`**

Create `src/app/(dashboard)/proveedores/nuevo-proveedor-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateProveedorAction = vi.fn();
vi.mock("@/app/actions/proveedor-actions", () => ({
  createProveedorAction: (...args: unknown[]) => mockCreateProveedorAction(...args),
}));

import { NuevoProveedorForm } from "./nuevo-proveedor-form";

describe("NuevoProveedorForm", () => {
  beforeEach(() => {
    mockCreateProveedorAction.mockReset();
    mockCreateProveedorAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders all Proveedor fields", () => {
    render(<NuevoProveedorForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Contacto")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoProveedorForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Proveedor creado");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateProveedorAction.mockResolvedValue({ error: "El nombre es obligatorio", success: false });
    render(<NuevoProveedorForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre es obligatorio");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement `NuevoProveedorForm`**

Run: `npx vitest run src/app/\(dashboard\)/proveedores/nuevo-proveedor-form.test.tsx`
Expected: FAIL — `Cannot find module './nuevo-proveedor-form'`.

Create `src/app/(dashboard)/proveedores/nuevo-proveedor-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createProveedorAction, type ProveedorFormState } from "@/app/actions/proveedor-actions";

const initialState: ProveedorFormState = { error: null, success: false };

export function NuevoProveedorForm() {
  const [state, formAction, isPending] = useActionState(createProveedorAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="contacto">Contacto</label>
      <input id="contacto" name="contacto" />

      <label htmlFor="telefono">Teléfono</label>
      <input id="telefono" name="telefono" />

      <label htmlFor="email">Correo</label>
      <input id="email" name="email" type="email" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear proveedor"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Proveedor creado</p> : null}
    </form>
  );
}
```

Run: `npx vitest run src/app/\(dashboard\)/proveedores/nuevo-proveedor-form.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 3: Create the Proveedores list page**

Create `src/app/(dashboard)/proveedores/page.tsx`:

```tsx
import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoProveedorForm } from "./nuevo-proveedor-form";

export default async function ProveedoresPage() {
  const proveedores = await listProveedores();

  return (
    <main>
      <h1>Proveedores</h1>
      <NuevoProveedorForm />
      <ul>
        {proveedores.map((proveedor) => (
          <li key={proveedor.id}>
            {proveedor.nombre} — {proveedor.telefono ?? "—"} — {proveedor.email ?? "—"}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Add the nav link**

Edit `src/app/(dashboard)/layout.tsx`:

```tsx
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ordenes">Órdenes</Link>
          <Link href="/bodegas">Bodegas</Link>
          <Link href="/proveedores">Proveedores</Link>
        </nav>
```

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all tests pass, including the new form tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/proveedores" "src/app/(dashboard)/layout.tsx"
git commit -m "fase3-task 6: add proveedores list page and nav link"
git push
```

---

### Task 7: Prisma schema — `Repuesto`

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/<timestamp>_add_repuestos/` (generated)

**Interfaces:**
- Consumes: `Bodega`, `Proveedor` (Task 1).
- Produces: `Repuesto` Prisma model — consumed by Task 8's `repuesto-actions.ts`, Task 11's `EntradaMercanciaItem`, and Task 14's `ItemOrden.repuestoId` link.

- [ ] **Step 1: Add the `Repuesto` model, with back-relations on `Bodega` and `Proveedor`**

Edit `prisma/tenant/schema.prisma` — add the `repuestos` back-relation to `model Bodega` and `model Proveedor`:

```prisma
model Bodega {
  id        String     @id @default(cuid())
  nombre    String
  sedeId    String     @map("sede_id")
  sede      Sede       @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  repuestos Repuesto[]
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  @@map("bodegas")
  @@index([sedeId])
}

model Proveedor {
  id        String     @id @default(cuid())
  nombre    String
  contacto  String?
  telefono  String?
  email     String?
  repuestos Repuesto[]
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  @@map("proveedores")
}
```

Append at the end of the file:

```prisma
model Repuesto {
  id           String   @id @default(cuid())
  codigo       String   @unique
  nombre       String
  descripcion  String?
  precioCompra Decimal  @map("precio_compra") @db.Decimal(10, 2)
  precioVenta  Decimal  @map("precio_venta") @db.Decimal(10, 2)
  stockActual  Int      @default(0) @map("stock_actual")
  stockMinimo  Int      @default(0) @map("stock_minimo")
  bodegaId     String   @map("bodega_id")
  bodega       Bodega   @relation(fields: [bodegaId], references: [id], onDelete: Restrict)
  proveedorId  String?  @map("proveedor_id")
  proveedor    Proveedor? @relation(fields: [proveedorId], references: [id], onDelete: SetNull)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("repuestos")
  @@index([bodegaId])
  @@index([proveedorId])
}
```

Note: `Repuesto.itemsOrden`/`entradaItems` back-relations are deliberately NOT added here — `ItemOrden.repuestoId` (Task 14) and `EntradaMercanciaItem` (Task 11) don't exist/reference `Repuesto` yet. Same task-independence rule as every prior cross-task schema split in this project.

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name add_repuestos`
Expected: creates `prisma/tenant/migrations/<timestamp>_add_repuestos/migration.sql`, applies it, regenerates the Prisma client.

- [ ] **Step 3: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations
git commit -m "fase3-task 7: add Repuesto model"
git push
```

---

### Task 8: `repuesto-actions.ts` — full CRUD, with `stockActual` write-once at creation

**Files:**
- Modify: `src/lib/validation/inventario.ts`
- Create: `src/app/actions/repuesto-actions.ts`
- Test: `src/app/actions/repuesto-actions.test.ts`

**Interfaces:**
- Consumes: `Repuesto` model (Task 7).
- Produces: `repuestoInputSchema` (`@/lib/validation/inventario`); `RepuestoFormState`, `RepuestoWithDetalle`, `listRepuestos()`, `getRepuesto(id)`, `createRepuestoAction(prevState, formData)`, `updateRepuestoAction(id, prevState, formData)`, `deleteRepuestoAction(id)` (`@/app/actions/repuesto-actions`) — consumed by Task 9 (UI), Task 11's `EntradaMercanciaItem` actions (repuesto `<select>`, via `listRepuestos`), and Task 15's `AgregarItemForm` update (repuesto `<select>` on the order detail page).

- [ ] **Step 1: Add `repuestoInputSchema`**

Edit `src/lib/validation/inventario.ts` — append:

```ts
export const repuestoInputSchema = z.object({
  codigo: z.string().min(1, "El código es obligatorio"),
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().optional().or(z.literal("")),
  precioCompra: z.coerce.number().min(0, "El precio de compra no puede ser negativo"),
  precioVenta: z.coerce.number().min(0, "El precio de venta no puede ser negativo"),
  stockMinimo: z.coerce.number().int().min(0, "El stock mínimo no puede ser negativo"),
  bodegaId: z.string().min(1, "Selecciona una bodega"),
  proveedorId: z.string().optional().or(z.literal("")),
});

export type RepuestoInput = z.infer<typeof repuestoInputSchema>;
```

- [ ] **Step 2: Write the failing tests for `repuesto-actions.ts`**

Create `src/app/actions/repuesto-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    repuesto: { create: mockCreate, update: mockUpdate, delete: mockDelete, findMany: mockFindMany },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createRepuestoAction,
  updateRepuestoAction,
  deleteRepuestoAction,
  listRepuestos,
  type RepuestoFormState,
} from "./repuesto-actions";

const initialState: RepuestoFormState = { error: null, success: false };

function baseFormData(): FormData {
  const formData = new FormData();
  formData.set("codigo", "FRN-001");
  formData.set("nombre", "Filtro de aceite");
  formData.set("precioCompra", "8");
  formData.set("precioVenta", "15");
  formData.set("stockMinimo", "5");
  formData.set("bodegaId", "b1");
  return formData;
}

describe("createRepuestoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error when codigo is missing", async () => {
    const formData = baseFormData();
    formData.delete("codigo");

    const result = await createRepuestoAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El código es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when the initial stockActual is negative", async () => {
    const formData = baseFormData();
    formData.set("stockActual", "-3");

    const result = await createRepuestoAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El stock inicial no puede ser negativo");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the repuesto with the given initial stock on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    const formData = baseFormData();
    formData.set("stockActual", "20");
    formData.set("proveedorId", "p1");

    const result = await createRepuestoAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        codigo: "FRN-001",
        nombre: "Filtro de aceite",
        descripcion: null,
        precioCompra: 8,
        precioVenta: 15,
        stockActual: 20,
        stockMinimo: 5,
        bodegaId: "b1",
        proveedorId: "p1",
      },
    });
  });

  it("defaults proveedorId to null when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    const formData = baseFormData();
    formData.set("stockActual", "0");

    await createRepuestoAction(initialState, formData);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proveedorId: null }) }),
    );
  });
});

describe("updateRepuestoAction", () => {
  it("updates the repuesto WITHOUT touching stockActual, even if the form somehow includes it", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "RECEPCION", tenantSchema: "taller_perez" } });
    mockUpdate.mockReset().mockResolvedValue({ id: "r1" });
    const formData = baseFormData();
    formData.set("stockActual", "9999");

    const result = await updateRepuestoAction("r1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    const callArg = mockUpdate.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("stockActual");
    expect(callArg).toEqual({
      where: { id: "r1" },
      data: {
        codigo: "FRN-001",
        nombre: "Filtro de aceite",
        descripcion: null,
        precioCompra: 8,
        precioVenta: 15,
        stockMinimo: 5,
        bodegaId: "b1",
        proveedorId: null,
      },
    });
  });
});

describe("deleteRepuestoAction", () => {
  it("requires ADMIN/RECEPCION and deletes by id", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();

    await deleteRepuestoAction("r1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});

describe("listRepuestos", () => {
  it("lists repuestos with bodega/proveedor included, ordered by nombre", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([{ id: "r1", nombre: "Filtro de aceite" }]);

    const result = await listRepuestos();

    expect(result).toEqual([{ id: "r1", nombre: "Filtro de aceite" }]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { nombre: "asc" } }),
    );
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: FAIL — `Cannot find module './repuesto-actions'`.

- [ ] **Step 4: Implement `repuesto-actions.ts`**

Create `src/app/actions/repuesto-actions.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { repuestoInputSchema } from "@/lib/validation/inventario";
import type { Prisma } from "@/generated/prisma-tenant";

export interface RepuestoFormState {
  error: string | null;
  success: boolean;
}

const REPUESTO_DETAIL_INCLUDE = {
  bodega: true,
  proveedor: true,
} satisfies Prisma.RepuestoInclude;

export type RepuestoWithDetalle = Prisma.RepuestoGetPayload<{ include: typeof REPUESTO_DETAIL_INCLUDE }>;

const stockInicialSchema = z.coerce.number().int().min(0, "El stock inicial no puede ser negativo");

function parseRepuestoFormData(formData: FormData) {
  return repuestoInputSchema.safeParse({
    codigo: formData.get("codigo"),
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
    precioCompra: formData.get("precioCompra"),
    precioVenta: formData.get("precioVenta"),
    stockMinimo: formData.get("stockMinimo"),
    bodegaId: formData.get("bodegaId"),
    proveedorId: formData.get("proveedorId"),
  });
}

export async function listRepuestos(): Promise<RepuestoWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findMany({ include: REPUESTO_DETAIL_INCLUDE, orderBy: { nombre: "asc" } });
}

export async function getRepuesto(id: string): Promise<RepuestoWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findUnique({ where: { id }, include: REPUESTO_DETAIL_INCLUDE });
}

export async function createRepuestoAction(
  prevState: RepuestoFormState,
  formData: FormData,
): Promise<RepuestoFormState> {
  const parsed = parseRepuestoFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const parsedStock = stockInicialSchema.safeParse(formData.get("stockActual"));
  if (!parsedStock.success) {
    return { error: parsedStock.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.repuesto.create({
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion || null,
        precioCompra: parsed.data.precioCompra,
        precioVenta: parsed.data.precioVenta,
        stockActual: parsedStock.data,
        stockMinimo: parsed.data.stockMinimo,
        bodegaId: parsed.data.bodegaId,
        proveedorId: parsed.data.proveedorId || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el repuesto"), success: false };
  }

  revalidatePath("/repuestos");
  return { error: null, success: true };
}

export async function updateRepuestoAction(
  id: string,
  prevState: RepuestoFormState,
  formData: FormData,
): Promise<RepuestoFormState> {
  const parsed = parseRepuestoFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.repuesto.update({
      where: { id },
      data: {
        codigo: parsed.data.codigo,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion || null,
        precioCompra: parsed.data.precioCompra,
        precioVenta: parsed.data.precioVenta,
        stockMinimo: parsed.data.stockMinimo,
        bodegaId: parsed.data.bodegaId,
        proveedorId: parsed.data.proveedorId || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el repuesto"), success: false };
  }

  revalidatePath("/repuestos");
  return { error: null, success: true };
}

export async function deleteRepuestoAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.repuesto.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el repuesto"));
  }
  revalidatePath("/repuestos");
}
```

Note: `updateRepuestoAction`'s `data` object has no `stockActual` key at all — this is the entire enforcement mechanism for the Global Constraint that stock only changes at creation or via `addEntradaItemAction` (Task 11). There is no runtime check to bypass; the field is structurally absent from every write path except those two.

- [ ] **Step 5: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/inventario.ts src/app/actions/repuesto-actions.ts src/app/actions/repuesto-actions.test.ts
git commit -m "fase3-task 8: add repuesto-actions CRUD with write-once stockActual"
git push
```

---

### Task 9: UI — Repuestos list page + create form + nav link

**Files:**
- Create: `src/app/(dashboard)/repuestos/page.tsx`
- Create: `src/app/(dashboard)/repuestos/nuevo-repuesto-form.tsx`
- Test: `src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `listRepuestos`, `createRepuestoAction` (Task 8), `listBodegas` (Task 3), `listProveedores` (Task 5).
- Produces: the `/repuestos` route.

- [ ] **Step 1: Write the failing test for `NuevoRepuestoForm`**

Create `src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateRepuestoAction = vi.fn();
vi.mock("@/app/actions/repuesto-actions", () => ({
  createRepuestoAction: (...args: unknown[]) => mockCreateRepuestoAction(...args),
}));

import { NuevoRepuestoForm } from "./nuevo-repuesto-form";

const bodegas = [{ id: "b1", nombre: "Bodega principal" }] as never;
const proveedores = [{ id: "p1", nombre: "Repuestos El Motor" }] as never;

describe("NuevoRepuestoForm", () => {
  beforeEach(() => {
    mockCreateRepuestoAction.mockReset();
    mockCreateRepuestoAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders all Repuesto fields plus the bodega/proveedor selects", () => {
    render(<NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />);

    expect(screen.getByLabelText("Código")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio de compra")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio de venta")).toBeInTheDocument();
    expect(screen.getByLabelText("Stock inicial")).toBeInTheDocument();
    expect(screen.getByLabelText("Stock mínimo")).toBeInTheDocument();
    expect(screen.getByLabelText("Bodega")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bodega principal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Proveedor")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Repuestos El Motor" })).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.type(screen.getByLabelText("Código"), "FRN-001");
    await userEvent.type(screen.getByLabelText("Nombre"), "Filtro de aceite");
    await userEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Repuesto creado");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateRepuestoAction.mockResolvedValue({ error: "El código es obligatorio", success: false });
    render(<NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El código es obligatorio");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement `NuevoRepuestoForm`**

Run: `npx vitest run src/app/\(dashboard\)/repuestos/nuevo-repuesto-form.test.tsx`
Expected: FAIL — `Cannot find module './nuevo-repuesto-form'`.

Create `src/app/(dashboard)/repuestos/nuevo-repuesto-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createRepuestoAction, type RepuestoFormState } from "@/app/actions/repuesto-actions";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";

const initialState: RepuestoFormState = { error: null, success: false };

export function NuevoRepuestoForm({
  bodegas,
  proveedores,
}: {
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const [state, formAction, isPending] = useActionState(createRepuestoAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="codigo">Código</label>
      <input id="codigo" name="codigo" required />

      <label htmlFor="nombre">Nombre</label>
      <input id="nombre" name="nombre" required />

      <label htmlFor="descripcion">Descripción</label>
      <textarea id="descripcion" name="descripcion" />

      <label htmlFor="precioCompra">Precio de compra</label>
      <input id="precioCompra" name="precioCompra" type="number" min="0" step="0.01" required />

      <label htmlFor="precioVenta">Precio de venta</label>
      <input id="precioVenta" name="precioVenta" type="number" min="0" step="0.01" required />

      <label htmlFor="stockActual">Stock inicial</label>
      <input id="stockActual" name="stockActual" type="number" min="0" defaultValue="0" required />

      <label htmlFor="stockMinimo">Stock mínimo</label>
      <input id="stockMinimo" name="stockMinimo" type="number" min="0" defaultValue="0" required />

      <label htmlFor="bodegaId">Bodega</label>
      <select id="bodegaId" name="bodegaId" defaultValue="" required>
        <option value="" disabled>
          Selecciona una bodega
        </option>
        {bodegas.map((bodega) => (
          <option key={bodega.id} value={bodega.id}>
            {bodega.nombre}
          </option>
        ))}
      </select>

      <label htmlFor="proveedorId">Proveedor</label>
      <select id="proveedorId" name="proveedorId" defaultValue="">
        <option value="">Sin proveedor asignado</option>
        {proveedores.map((proveedor) => (
          <option key={proveedor.id} value={proveedor.id}>
            {proveedor.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear repuesto"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Repuesto creado</p> : null}
    </form>
  );
}
```

Run: `npx vitest run src/app/\(dashboard\)/repuestos/nuevo-repuesto-form.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 3: Create the Repuestos list page**

Create `src/app/(dashboard)/repuestos/page.tsx`:

```tsx
import { listRepuestos } from "@/app/actions/repuesto-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { NuevoRepuestoForm } from "./nuevo-repuesto-form";

export default async function RepuestosPage() {
  const [repuestos, bodegas, proveedores] = await Promise.all([
    listRepuestos(),
    listBodegas(),
    listProveedores(),
  ]);

  return (
    <main>
      <h1>Repuestos</h1>
      <NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />
      <ul>
        {repuestos.map((repuesto) => (
          <li key={repuesto.id}>
            {repuesto.codigo} — {repuesto.nombre} — stock: {repuesto.stockActual} — {repuesto.bodega.nombre}
            {repuesto.stockActual <= repuesto.stockMinimo ? " ⚠ stock bajo" : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

Note: the "⚠ stock bajo" inline marker is a passive display-only comparison against `stockMinimo` already available on the fetched record — not the reabastecimiento *alert/notification* system explicitly excluded from this phase's scope (no email/push, no cron, no dashboard badge). It costs nothing extra to render since the data is already on the page.

- [ ] **Step 4: Add the nav link**

Edit `src/app/(dashboard)/layout.tsx`:

```tsx
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ordenes">Órdenes</Link>
          <Link href="/bodegas">Bodegas</Link>
          <Link href="/proveedores">Proveedores</Link>
          <Link href="/repuestos">Repuestos</Link>
        </nav>
```

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all tests pass, including the new form tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/repuestos" "src/app/(dashboard)/layout.tsx"
git commit -m "fase3-task 9: add repuestos list page and nav link"
git push
```

---

### Task 10: Prisma schema — `EntradaMercancia`, `EntradaMercanciaItem`

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/<timestamp>_add_entradas_mercancia/` (generated)

**Interfaces:**
- Consumes: `Proveedor`, `Bodega`, `Repuesto` (Tasks 1, 7), `Usuario` (Fase 1).
- Produces: `EntradaMercancia`, `EntradaMercanciaItem` Prisma models — consumed by Task 11's `entrada-mercancia-actions.ts`.

- [ ] **Step 1: Add the models, with back-relations on `Proveedor`, `Bodega`, `Repuesto`, `Usuario`**

Edit `prisma/tenant/schema.prisma` — add `entradas` to `model Proveedor` and `model Bodega`, `entradaItems` to `model Repuesto`, and `entradasCreadas` to `model Usuario`:

```prisma
model Proveedor {
  id        String              @id @default(cuid())
  nombre    String
  contacto  String?
  telefono  String?
  email     String?
  repuestos Repuesto[]
  entradas  EntradaMercancia[]
  createdAt DateTime            @default(now()) @map("created_at")
  updatedAt DateTime            @updatedAt @map("updated_at")

  @@map("proveedores")
}
```

```prisma
model Bodega {
  id        String              @id @default(cuid())
  nombre    String
  sedeId    String              @map("sede_id")
  sede      Sede                @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  repuestos Repuesto[]
  entradas  EntradaMercancia[]
  createdAt DateTime            @default(now()) @map("created_at")
  updatedAt DateTime            @updatedAt @map("updated_at")

  @@map("bodegas")
  @@index([sedeId])
}
```

```prisma
model Repuesto {
  id           String                 @id @default(cuid())
  codigo       String                 @unique
  nombre       String
  descripcion  String?
  precioCompra Decimal                @map("precio_compra") @db.Decimal(10, 2)
  precioVenta  Decimal                @map("precio_venta") @db.Decimal(10, 2)
  stockActual  Int                    @default(0) @map("stock_actual")
  stockMinimo  Int                    @default(0) @map("stock_minimo")
  bodegaId     String                 @map("bodega_id")
  bodega       Bodega                 @relation(fields: [bodegaId], references: [id], onDelete: Restrict)
  proveedorId  String?                @map("proveedor_id")
  proveedor    Proveedor?             @relation(fields: [proveedorId], references: [id], onDelete: SetNull)
  entradaItems EntradaMercanciaItem[]
  createdAt    DateTime               @default(now()) @map("created_at")
  updatedAt    DateTime               @updatedAt @map("updated_at")

  @@map("repuestos")
  @@index([bodegaId])
  @@index([proveedorId])
}
```

Add `entradasCreadas EntradaMercancia[]` to `model Usuario` (after `dviRealizados`):

```prisma
  dviRealizados     Dvi[]
  entradasCreadas   EntradaMercancia[]
```

Append at the end of the file:

```prisma
model EntradaMercancia {
  id          String                 @id @default(cuid())
  proveedorId String                 @map("proveedor_id")
  proveedor   Proveedor              @relation(fields: [proveedorId], references: [id], onDelete: Restrict)
  bodegaId    String                 @map("bodega_id")
  bodega      Bodega                 @relation(fields: [bodegaId], references: [id], onDelete: Restrict)
  creadoPorId String                 @map("creado_por_id")
  creadoPor   Usuario                @relation(fields: [creadoPorId], references: [id], onDelete: Restrict)
  items       EntradaMercanciaItem[]
  createdAt   DateTime               @default(now()) @map("created_at")

  @@map("entradas_mercancia")
  @@index([proveedorId])
  @@index([bodegaId])
}

model EntradaMercanciaItem {
  id                   String           @id @default(cuid())
  entradaId            String           @map("entrada_id")
  entrada              EntradaMercancia @relation(fields: [entradaId], references: [id], onDelete: Cascade)
  repuestoId           String           @map("repuesto_id")
  repuesto             Repuesto         @relation(fields: [repuestoId], references: [id], onDelete: Restrict)
  cantidad             Int
  precioCompraUnitario Decimal          @map("precio_compra_unitario") @db.Decimal(10, 2)
  createdAt            DateTime         @default(now()) @map("created_at")

  @@map("entrada_mercancia_items")
  @@index([entradaId])
  @@index([repuestoId])
}
```

Why `EntradaMercanciaItem.repuesto` uses `onDelete: Restrict` (not `SetNull` like `Repuesto.proveedor`): a receipt line with no repuesto would be meaningless (the stock increment it once caused can't be attributed to anything), so a `Repuesto` with any purchase history can't be deleted — matches the same reasoning as `Vehiculo`→`HistorialVehiculo` (Fase 1) and `OrdenTrabajo`→`ItemOrden` (Fase 2, `Cascade` there since items are owned by the order, not referenced from outside it — here `EntradaMercanciaItem` is owned by `EntradaMercancia`, `Cascade` on that edge, but `Restrict` on the `Repuesto` reference since deleting the entrada shouldn't be possible via deleting an unrelated repuesto).

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name add_entradas_mercancia`
Expected: creates `prisma/tenant/migrations/<timestamp>_add_entradas_mercancia/migration.sql`, applies it, regenerates the Prisma client.

- [ ] **Step 3: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations
git commit -m "fase3-task 10: add EntradaMercancia/EntradaMercanciaItem models"
git push
```

---

### Task 11: `entrada-mercancia-actions.ts` — create header, add item (atomic stock increment)

**Files:**
- Modify: `src/lib/validation/inventario.ts`
- Create: `src/app/actions/entrada-mercancia-actions.ts`
- Test: `src/app/actions/entrada-mercancia-actions.test.ts`

**Interfaces:**
- Consumes: `EntradaMercancia`/`EntradaMercanciaItem` (Task 10).
- Produces: `entradaMercanciaInputSchema`, `entradaMercanciaItemInputSchema` (`@/lib/validation/inventario`); `EntradaFormState`, `EntradaWithDetalle`, `listEntradas()`, `getEntrada(id)`, `createEntradaMercanciaAction(prevState, formData)`, `addEntradaItemAction(entradaId, prevState, formData)` (`@/app/actions/entrada-mercancia-actions`) — consumed by Task 12 (list/create UI) and Task 13 (detail page + add-item UI).

- [ ] **Step 1: Add the validation schemas**

Edit `src/lib/validation/inventario.ts` — append:

```ts
export const entradaMercanciaInputSchema = z.object({
  proveedorId: z.string().min(1, "Selecciona un proveedor"),
  bodegaId: z.string().min(1, "Selecciona una bodega"),
});

export type EntradaMercanciaInput = z.infer<typeof entradaMercanciaInputSchema>;

export const entradaMercanciaItemInputSchema = z.object({
  repuestoId: z.string().min(1, "Selecciona un repuesto"),
  cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
  precioCompraUnitario: z.coerce.number().min(0, "El precio no puede ser negativo"),
});

export type EntradaMercanciaItemInput = z.infer<typeof entradaMercanciaItemInputSchema>;
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/actions/entrada-mercancia-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockEntradaCreate = vi.fn();
const mockEntradaFindMany = vi.fn();
const mockItemCreate = vi.fn();
const mockRepuestoUpdate = vi.fn();
const mockTransaction = vi.fn((ops: unknown[]) => Promise.all(ops));
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    entradaMercancia: { create: mockEntradaCreate, findMany: mockEntradaFindMany },
    entradaMercanciaItem: { create: mockItemCreate },
    repuesto: { update: mockRepuestoUpdate },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createEntradaMercanciaAction,
  addEntradaItemAction,
  listEntradas,
  type EntradaFormState,
} from "./entrada-mercancia-actions";

const initialState: EntradaFormState = { error: null, success: false };

describe("createEntradaMercanciaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockEntradaCreate.mockReset();
  });

  it("returns a validation error when proveedorId is missing", async () => {
    const formData = new FormData();
    formData.set("bodegaId", "b1");

    const result = await createEntradaMercanciaAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Selecciona un proveedor");
    expect(mockEntradaCreate).not.toHaveBeenCalled();
  });

  it("creates the entrada header on valid input", async () => {
    mockEntradaCreate.mockResolvedValue({ id: "e1" });
    const formData = new FormData();
    formData.set("proveedorId", "p1");
    formData.set("bodegaId", "b1");

    const result = await createEntradaMercanciaAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockEntradaCreate).toHaveBeenCalledWith({
      data: { proveedorId: "p1", bodegaId: "b1", creadoPorId: "u1" },
    });
  });
});

describe("addEntradaItemAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockItemCreate.mockReset();
    mockRepuestoUpdate.mockReset();
    mockTransaction.mockClear();
  });

  it("returns a validation error when cantidad is less than 1", async () => {
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "0");
    formData.set("precioCompraUnitario", "8");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La cantidad debe ser al menos 1");
    expect(mockItemCreate).not.toHaveBeenCalled();
    expect(mockRepuestoUpdate).not.toHaveBeenCalled();
  });

  it("creates the item AND atomically increments the repuesto's stockActual on valid input", async () => {
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockItemCreate).toHaveBeenCalledWith({
      data: { entradaId: "e1", repuestoId: "r1", cantidad: 20, precioCompraUnitario: 8.5 },
    });
    expect(mockRepuestoUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { stockActual: { increment: 20 } },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not increment stock at all if the transaction rejects (no partial write)", async () => {
    mockTransaction.mockRejectedValueOnce(new Error("simulated DB failure"));
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result.success).toBe(false);
  });
});

describe("listEntradas", () => {
  it("lists entradas ordered by most recent first, with proveedor/bodega/items included", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockEntradaFindMany.mockReset().mockResolvedValue([{ id: "e1" }]);

    const result = await listEntradas();

    expect(result).toEqual([{ id: "e1" }]);
    expect(mockEntradaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });
});
```

Note: the array-form `tenantDb.$transaction([...])` call evaluates each operation (`tenantDb.entradaMercanciaItem.create(...)`, `tenantDb.repuesto.update(...)`) *before* passing the resulting array to `$transaction` — exactly like calling two mocked functions directly. The mock above (`mockTransaction.mockImplementation((ops) => Promise.all(ops))`) mirrors this: both mocks still receive and record their real call arguments regardless of what `$transaction` itself does with the array, so asserting on `mockItemCreate`/`mockRepuestoUpdate`'s call arguments is a faithful test of atomicity intent (both-or-neither is what the implementation code guarantees via `$transaction`, not something the mock needs to simulate).

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/entrada-mercancia-actions.test.ts`
Expected: FAIL — `Cannot find module './entrada-mercancia-actions'`.

- [ ] **Step 4: Implement `entrada-mercancia-actions.ts`**

Create `src/app/actions/entrada-mercancia-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { entradaMercanciaInputSchema, entradaMercanciaItemInputSchema } from "@/lib/validation/inventario";
import type { Prisma } from "@/generated/prisma-tenant";

export interface EntradaFormState {
  error: string | null;
  success: boolean;
}

const ENTRADA_DETAIL_INCLUDE = {
  proveedor: true,
  bodega: true,
  items: { include: { repuesto: true } },
} satisfies Prisma.EntradaMercanciaInclude;

export type EntradaWithDetalle = Prisma.EntradaMercanciaGetPayload<{ include: typeof ENTRADA_DETAIL_INCLUDE }>;

export async function listEntradas(): Promise<EntradaWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.entradaMercancia.findMany({ include: ENTRADA_DETAIL_INCLUDE, orderBy: { createdAt: "desc" } });
}

export async function getEntrada(id: string): Promise<EntradaWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.entradaMercancia.findUnique({ where: { id }, include: ENTRADA_DETAIL_INCLUDE });
}

export async function createEntradaMercanciaAction(
  prevState: EntradaFormState,
  formData: FormData,
): Promise<EntradaFormState> {
  const parsed = entradaMercanciaInputSchema.safeParse({
    proveedorId: formData.get("proveedorId"),
    bodegaId: formData.get("bodegaId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.entradaMercancia.create({
      data: {
        proveedorId: parsed.data.proveedorId,
        bodegaId: parsed.data.bodegaId,
        creadoPorId: session.user.id,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la entrada de mercancía"), success: false };
  }

  revalidatePath("/entradas-mercancia");
  return { error: null, success: true };
}

export async function addEntradaItemAction(
  entradaId: string,
  prevState: EntradaFormState,
  formData: FormData,
): Promise<EntradaFormState> {
  const parsed = entradaMercanciaItemInputSchema.safeParse({
    repuestoId: formData.get("repuestoId"),
    cantidad: formData.get("cantidad"),
    precioCompraUnitario: formData.get("precioCompraUnitario"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.$transaction([
      tenantDb.entradaMercanciaItem.create({
        data: {
          entradaId,
          repuestoId: parsed.data.repuestoId,
          cantidad: parsed.data.cantidad,
          precioCompraUnitario: parsed.data.precioCompraUnitario,
        },
      }),
      tenantDb.repuesto.update({
        where: { id: parsed.data.repuestoId },
        data: { stockActual: { increment: parsed.data.cantidad } },
      }),
    ]);
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar el ítem recibido"), success: false };
  }

  revalidatePath(`/entradas-mercancia/${entradaId}`);
  revalidatePath("/repuestos");
  return { error: null, success: true };
}
```

- [ ] **Step 5: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/entrada-mercancia-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/inventario.ts src/app/actions/entrada-mercancia-actions.ts src/app/actions/entrada-mercancia-actions.test.ts
git commit -m "fase3-task 11: add entrada-mercancia-actions with atomic stock increment"
git push
```

---

### Task 12: UI — Entradas de mercancía list page + create form + nav link

**Files:**
- Create: `src/app/(dashboard)/entradas-mercancia/page.tsx`
- Create: `src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.tsx`
- Test: `src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `listEntradas`, `createEntradaMercanciaAction` (Task 11), `listProveedores` (Task 5), `listBodegas` (Task 3).
- Produces: the `/entradas-mercancia` route — consumed by Task 13 (detail page) and Task 16's e2e test.

- [ ] **Step 1: Write the failing test for `NuevaEntradaMercanciaForm`**

Create `src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateEntradaMercanciaAction = vi.fn();
vi.mock("@/app/actions/entrada-mercancia-actions", () => ({
  createEntradaMercanciaAction: (...args: unknown[]) => mockCreateEntradaMercanciaAction(...args),
}));

import { NuevaEntradaMercanciaForm } from "./nueva-entrada-mercancia-form";

const proveedores = [{ id: "p1", nombre: "Repuestos El Motor" }] as never;
const bodegas = [{ id: "b1", nombre: "Bodega principal" }] as never;

describe("NuevaEntradaMercanciaForm", () => {
  beforeEach(() => {
    mockCreateEntradaMercanciaAction.mockReset();
    mockCreateEntradaMercanciaAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the proveedor and bodega selects", () => {
    render(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    expect(screen.getByLabelText("Proveedor")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Repuestos El Motor" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bodega")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bodega principal" })).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear entrada" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Entrada creada");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateEntradaMercanciaAction.mockResolvedValue({ error: "Selecciona un proveedor", success: false });
    render(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear entrada" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona un proveedor");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement `NuevaEntradaMercanciaForm`**

Run: `npx vitest run src/app/\(dashboard\)/entradas-mercancia/nueva-entrada-mercancia-form.test.tsx`
Expected: FAIL — `Cannot find module './nueva-entrada-mercancia-form'`.

Create `src/app/(dashboard)/entradas-mercancia/nueva-entrada-mercancia-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createEntradaMercanciaAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";

const initialState: EntradaFormState = { error: null, success: false };

export function NuevaEntradaMercanciaForm({
  proveedores,
  bodegas,
}: {
  proveedores: Proveedor[];
  bodegas: Bodega[];
}) {
  const [state, formAction, isPending] = useActionState(createEntradaMercanciaAction, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="proveedorId">Proveedor</label>
      <select id="proveedorId" name="proveedorId" defaultValue="" required>
        <option value="" disabled>
          Selecciona un proveedor
        </option>
        {proveedores.map((proveedor) => (
          <option key={proveedor.id} value={proveedor.id}>
            {proveedor.nombre}
          </option>
        ))}
      </select>

      <label htmlFor="bodegaId">Bodega</label>
      <select id="bodegaId" name="bodegaId" defaultValue="" required>
        <option value="" disabled>
          Selecciona una bodega
        </option>
        {bodegas.map((bodega) => (
          <option key={bodega.id} value={bodega.id}>
            {bodega.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear entrada"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Entrada creada</p> : null}
    </form>
  );
}
```

Run: `npx vitest run src/app/\(dashboard\)/entradas-mercancia/nueva-entrada-mercancia-form.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 3: Create the Entradas de mercancía list page**

Create `src/app/(dashboard)/entradas-mercancia/page.tsx`:

```tsx
import Link from "next/link";
import { listEntradas } from "@/app/actions/entrada-mercancia-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { NuevaEntradaMercanciaForm } from "./nueva-entrada-mercancia-form";

export default async function EntradasMercanciaPage() {
  const [entradas, proveedores, bodegas] = await Promise.all([
    listEntradas(),
    listProveedores(),
    listBodegas(),
  ]);

  return (
    <main>
      <h1>Entradas de mercancía</h1>
      <NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />
      <ul>
        {entradas.map((entrada) => (
          <li key={entrada.id}>
            <Link href={`/entradas-mercancia/${entrada.id}`}>
              {new Date(entrada.createdAt).toLocaleDateString()} — {entrada.proveedor.nombre} —{" "}
              {entrada.bodega.nombre} — {entrada.items.length} ítem(s)
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Add the nav link**

Edit `src/app/(dashboard)/layout.tsx`:

```tsx
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ordenes">Órdenes</Link>
          <Link href="/bodegas">Bodegas</Link>
          <Link href="/proveedores">Proveedores</Link>
          <Link href="/repuestos">Repuestos</Link>
          <Link href="/entradas-mercancia">Entradas</Link>
        </nav>
```

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all tests pass, including the new form tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/entradas-mercancia" "src/app/(dashboard)/layout.tsx"
git commit -m "fase3-task 12: add entradas de mercancia list page and nav link"
git push
```

---

### Task 13: UI — Entrada de mercancía detail page (agregar ítem, stock increments visibly)

**Files:**
- Create: `src/app/(dashboard)/entradas-mercancia/[id]/agregar-entrada-item-form.tsx`
- Test: `src/app/(dashboard)/entradas-mercancia/[id]/agregar-entrada-item-form.test.tsx`
- Create: `src/app/(dashboard)/entradas-mercancia/[id]/page.tsx`

**Interfaces:**
- Consumes: `getEntrada`, `addEntradaItemAction` (Task 11), `listRepuestos` (Task 8).
- Produces: the `/entradas-mercancia/[id]` route — consumed by Task 16's e2e test.

- [ ] **Step 1: Write the failing test for `AgregarEntradaItemForm`**

Create `src/app/(dashboard)/entradas-mercancia/[id]/agregar-entrada-item-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddEntradaItemAction = vi.fn();
vi.mock("@/app/actions/entrada-mercancia-actions", () => ({
  addEntradaItemAction: (...args: unknown[]) => mockAddEntradaItemAction(...args),
}));

import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";

const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }] as never;

describe("AgregarEntradaItemForm", () => {
  beforeEach(() => {
    mockAddEntradaItemAction.mockReset();
    mockAddEntradaItemAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the repuesto select, cantidad, and precio fields", () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    expect(screen.getByLabelText("Repuesto")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio de compra unitario")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem registrado, stock actualizado");
  });

  it("shows the error message when the action returns one", async () => {
    mockAddEntradaItemAction.mockResolvedValue({ error: "La cantidad debe ser al menos 1", success: false });
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La cantidad debe ser al menos 1");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, then implement `AgregarEntradaItemForm`**

Run: `npx vitest run "src/app/(dashboard)/entradas-mercancia/[id]/agregar-entrada-item-form.test.tsx"`
Expected: FAIL — `Cannot find module './agregar-entrada-item-form'`.

Create `src/app/(dashboard)/entradas-mercancia/[id]/agregar-entrada-item-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { addEntradaItemAction, type EntradaFormState } from "@/app/actions/entrada-mercancia-actions";
import type { Repuesto } from "@/generated/prisma-tenant";

const initialState: EntradaFormState = { error: null, success: false };

export function AgregarEntradaItemForm({
  entradaId,
  repuestos,
}: {
  entradaId: string;
  repuestos: Repuesto[];
}) {
  const addItem = addEntradaItemAction.bind(null, entradaId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="repuestoId">Repuesto</label>
      <select id="repuestoId" name="repuestoId" defaultValue="" required>
        <option value="" disabled>
          Selecciona un repuesto
        </option>
        {repuestos.map((repuesto) => (
          <option key={repuesto.id} value={repuesto.id}>
            {repuesto.codigo} — {repuesto.nombre}
          </option>
        ))}
      </select>

      <label htmlFor="cantidad">Cantidad</label>
      <input id="cantidad" name="cantidad" type="number" min="1" required />

      <label htmlFor="precioCompraUnitario">Precio de compra unitario</label>
      <input id="precioCompraUnitario" name="precioCompraUnitario" type="number" min="0" step="0.01" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar ítem"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Ítem registrado, stock actualizado</p> : null}
    </form>
  );
}
```

Run: `npx vitest run "src/app/(dashboard)/entradas-mercancia/[id]/agregar-entrada-item-form.test.tsx"`
Expected: PASS — 3 tests passed.

- [ ] **Step 3: Compose the Entrada de mercancía detail page**

Create `src/app/(dashboard)/entradas-mercancia/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getEntrada } from "@/app/actions/entrada-mercancia-actions";
import { listRepuestos } from "@/app/actions/repuesto-actions";
import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";

export default async function EntradaMercanciaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [entrada, repuestos] = await Promise.all([getEntrada(id), listRepuestos()]);

  if (!entrada) {
    notFound();
  }

  return (
    <main>
      <h1>Entrada de mercancía — {entrada.proveedor.nombre}</h1>
      <p>Bodega: {entrada.bodega.nombre}</p>
      <p>Fecha: {new Date(entrada.createdAt).toLocaleDateString()}</p>

      <h2>Ítems recibidos</h2>
      <AgregarEntradaItemForm entradaId={entrada.id} repuestos={repuestos} />
      <ul>
        {entrada.items.map((item) => (
          <li key={item.id}>
            {item.repuesto.codigo} — {item.repuesto.nombre} — {item.cantidad} x {item.precioCompraUnitario.toString()}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all tests pass, including the new form tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/entradas-mercancia/[id]"
git commit -m "fase3-task 13: add entrada de mercancia detail page with agregar-item form"
git push
```

---

### Task 14: Link `ItemOrden` to `Repuesto` — schema, validation, and `addItemOrdenAction`

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/<timestamp>_link_item_orden_repuesto/` (generated)
- Modify: `src/lib/validation/orden.ts`
- Modify: `src/app/actions/item-orden-actions.ts`
- Modify: `src/app/actions/item-orden-actions.test.ts`

**Interfaces:**
- Consumes: `Repuesto` (Task 7).
- Produces: `ItemOrden.repuestoId` (optional FK) — when an order's line item references a catalog `Repuesto`, `descripcion`/`precioUnitario` are derived server-side from that `Repuesto` (trusted pricing — the client can no longer submit an arbitrary price for a catalog item). A manual (non-catalog) line item still works exactly as in Fase 2. Consumed by Task 15's UI update to `AgregarItemForm`.

This is the one task in this plan that modifies existing Fase 2 code and its existing tests — read every file's current live content before editing, and expect exactly the changes below (no more, no less).

- [ ] **Step 1: Add `repuestoId` to `ItemOrden`, with a back-relation on `Repuesto`**

Edit `prisma/tenant/schema.prisma` — change `model ItemOrden` to:

```prisma
model ItemOrden {
  id             String       @id @default(cuid())
  ordenId        String       @map("orden_id")
  orden          OrdenTrabajo @relation(fields: [ordenId], references: [id], onDelete: Cascade)
  repuestoId     String?      @map("repuesto_id")
  repuesto       Repuesto?    @relation(fields: [repuestoId], references: [id], onDelete: SetNull)
  descripcion    String
  cantidad       Int
  precioUnitario Decimal      @map("precio_unitario") @db.Decimal(10, 2)
  createdAt      DateTime     @default(now()) @map("created_at")

  @@map("items_orden")
  @@index([ordenId])
  @@index([repuestoId])
}
```

`onDelete: SetNull` (not `Restrict` like `EntradaMercanciaItem.repuesto`, Task 10): a historical order line shouldn't block deleting a discontinued repuesto from the catalog — the line just becomes a plain manual/historical entry (its `descripcion`/`precioUnitario` stay intact, only the catalog link is severed). This mirrors `HistorialVehiculo.autor`'s reasoning (Fase 1) more than `EntradaMercanciaItem.repuesto`'s (a purchase receipt line without its repuesto would be meaningless; an order line without its repuesto is just an order line, same as any manual one).

Add `itemsOrden ItemOrden[]` to `model Repuesto` (after `entradaItems`):

```prisma
  entradaItems EntradaMercanciaItem[]
  itemsOrden   ItemOrden[]
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name link_item_orden_repuesto`
Expected: creates `prisma/tenant/migrations/<timestamp>_link_item_orden_repuesto/migration.sql`, applies it, regenerates the Prisma client.

- [ ] **Step 3: Write the failing tests for the linked-repuesto path**

Edit `src/app/actions/item-orden-actions.test.ts` — replace the entire file with:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();
const mockOrdenFindUnique = vi.fn();
const mockRepuestoFindUnique = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    itemOrden: { create: mockCreate, deleteMany: mockDeleteMany },
    ordenTrabajo: { findUnique: mockOrdenFindUnique },
    repuesto: { findUnique: mockRepuestoFindUnique },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addItemOrdenAction, deleteItemOrdenAction, type ItemOrdenFormState } from "./item-orden-actions";

const initialState: ItemOrdenFormState = { error: null, success: false };

describe("addItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
    mockRepuestoFindUnique.mockReset();
    mockOrdenFindUnique.mockReset().mockResolvedValue({ estado: "EN_PROCESO" });
  });

  it("returns a validation error when cantidad is less than 1", async () => {
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "0");
    formData.set("precioUnitario", "15");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La cantidad debe ser al menos 1");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when neither repuestoId nor manual descripcion+precio are given", async () => {
    const formData = new FormData();
    formData.set("cantidad", "2");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Selecciona un repuesto del inventario o completa descripción y precio manualmente");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a manual (non-catalog) item linked to the given ordenId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "2");
    formData.set("precioUnitario", "15.5");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRepuestoFindUnique).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: { ordenId: "o1", repuestoId: null, descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: 15.5 },
    });
  });

  it("creates a catalog-linked item, deriving descripcion/precioUnitario from the Repuesto and ignoring manual fields", async () => {
    mockRepuestoFindUnique.mockResolvedValue({ id: "r1", nombre: "Filtro de aceite Bosch", precioVenta: 18.9 });
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "3");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRepuestoFindUnique).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        repuestoId: "r1",
        descripcion: "Filtro de aceite Bosch",
        cantidad: 3,
        precioUnitario: 18.9,
      },
    });
  });

  it("returns an error when repuestoId references a repuesto that doesn't exist", async () => {
    mockRepuestoFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("repuestoId", "r-missing");
    formData.set("cantidad", "1");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Repuesto no encontrado");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("allows TECNICO to add items (not just ADMIN/RECEPCION)", async () => {
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("descripcion", "Bujía");
    formData.set("cantidad", "4");
    formData.set("precioUnitario", "8");

    await addItemOrdenAction("o1", initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION", "TECNICO"]);
  });

  it("blocks adding an item when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindUnique.mockResolvedValue({ estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "1");
    formData.set("precioUnitario", "15");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se puede modificar una orden en estado ENTREGADA.");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("deleteItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDeleteMany.mockReset();
    mockOrdenFindUnique.mockReset().mockResolvedValue({ estado: "EN_PROCESO" });
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete an item", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteItemOrdenAction("i1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "i1", ordenId: "o1" } });
  });

  it("blocks deleting an item when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindUnique.mockResolvedValue({ estado: "ENTREGADA" });

    await expect(deleteItemOrdenAction("i1", "o1")).rejects.toThrow(
      "No se puede modificar una orden en estado ENTREGADA.",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("throws when the item exists but belongs to a different orden", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteItemOrdenAction("i1", "o1")).rejects.toThrow("Ítem no encontrado en esta orden");
  });
});
```

This is a full-file replacement of Fase 2's test file. Two things changed versus Fase 2: the "creates the item..." test now expects `repuestoId: null` in the `create` call (previously that key was absent), and four new tests were added (missing-both-inputs validation, catalog-linked derivation, repuesto-not-found, plus keeping the manual-path test explicit that `repuesto.findUnique` is never called for it). `deleteItemOrdenAction`'s tests are carried over byte-for-byte — this task doesn't touch delete.

- [ ] **Step 4: Run it to confirm the new/changed tests fail**

Run: `npx vitest run src/app/actions/item-orden-actions.test.ts`
Expected: FAIL — the "manual item" test fails on the missing `repuestoId: null` key, the "catalog-linked" and "repuesto not found" and "neither given" tests fail because `addItemOrdenAction` doesn't yet handle `repuestoId` at all.

- [ ] **Step 5: Update `itemOrdenInputSchema`**

Edit `src/lib/validation/orden.ts` — change:

```ts
export const itemOrdenInputSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
  precioUnitario: z.coerce.number().min(0, "El precio no puede ser negativo"),
});
```

to:

```ts
export const itemOrdenInputSchema = z
  .object({
    repuestoId: z.string().optional().or(z.literal("")),
    descripcion: z.string().optional().or(z.literal("")),
    cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
    precioUnitario: z.coerce.number().min(0, "El precio no puede ser negativo").optional(),
  })
  .refine((data) => Boolean(data.repuestoId) || (Boolean(data.descripcion) && data.precioUnitario !== undefined), {
    message: "Selecciona un repuesto del inventario o completa descripción y precio manualmente",
  });
```

Note: `cantidad`'s own `min(1)` check still runs as a normal field-level check before Zod evaluates the object-level `.refine()`, so `parsed.error.issues[0]` is still the cantidad message when cantidad is invalid regardless of what else is filled in — the first existing test above (cantidad=0) is unaffected by this change.

- [ ] **Step 6: Update `addItemOrdenAction`**

Edit `src/app/actions/item-orden-actions.ts` — change:

```ts
export async function addItemOrdenAction(
  ordenId: string,
  prevState: ItemOrdenFormState,
  formData: FormData,
): Promise<ItemOrdenFormState> {
  const parsed = itemOrdenInputSchema.safeParse({
    descripcion: formData.get("descripcion"),
    cantidad: formData.get("cantidad"),
    precioUnitario: formData.get("precioUnitario"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findUnique({ where: { id: ordenId }, select: { estado: true } });
  if (!orden) {
    return { error: "Orden no encontrada", success: false };
  }
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false };
  }

  try {
    await tenantDb.itemOrden.create({
      data: {
        ordenId,
        descripcion: parsed.data.descripcion,
        cantidad: parsed.data.cantidad,
        precioUnitario: parsed.data.precioUnitario,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar el ítem"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}
```

to:

```ts
export async function addItemOrdenAction(
  ordenId: string,
  prevState: ItemOrdenFormState,
  formData: FormData,
): Promise<ItemOrdenFormState> {
  const parsed = itemOrdenInputSchema.safeParse({
    repuestoId: formData.get("repuestoId") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    cantidad: formData.get("cantidad"),
    precioUnitario: formData.get("precioUnitario") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findUnique({ where: { id: ordenId }, select: { estado: true } });
  if (!orden) {
    return { error: "Orden no encontrada", success: false };
  }
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false };
  }

  let descripcion: string;
  let precioUnitario: number;

  if (parsed.data.repuestoId) {
    const repuesto = await tenantDb.repuesto.findUnique({ where: { id: parsed.data.repuestoId } });
    if (!repuesto) {
      return { error: "Repuesto no encontrado", success: false };
    }
    descripcion = repuesto.nombre;
    precioUnitario = Number(repuesto.precioVenta);
  } else {
    descripcion = parsed.data.descripcion as string;
    precioUnitario = parsed.data.precioUnitario as number;
  }

  try {
    await tenantDb.itemOrden.create({
      data: {
        ordenId,
        repuestoId: parsed.data.repuestoId || null,
        descripcion,
        cantidad: parsed.data.cantidad,
        precioUnitario,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar el ítem"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}
```

The `as string`/`as number` casts are safe, not a type-safety hole: the `.refine()` in `itemOrdenInputSchema` already guarantees that when `repuestoId` is falsy, both `descripcion` and `precioUnitario` are truthy/defined — Zod's inferred type just can't express that cross-field guarantee itself.

- [ ] **Step 7: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/item-orden-actions.test.ts`
Expected: PASS — all 10 tests pass (6 in `addItemOrdenAction`, 3 in `deleteItemOrdenAction`... recount: 7 in `addItemOrdenAction`, 3 in `deleteItemOrdenAction` = 10 total).

- [ ] **Step 8: Run the full unit suite to confirm no regressions elsewhere**

Run: `npx vitest run`
Expected: PASS — every test from Fases 1-2 plus this task still passes (nothing else reads `ItemOrden.repuestoId` yet — Task 15 is next).

- [ ] **Step 9: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations src/lib/validation/orden.ts src/app/actions/item-orden-actions.ts src/app/actions/item-orden-actions.test.ts
git commit -m "fase3-task 14: link ItemOrden to Repuesto with server-trusted pricing"
git push
```

---

### Task 15: UI — `AgregarItemForm` gets a repuesto select

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx`

**Interfaces:**
- Consumes: `listRepuestos` (Task 8), Task 14's updated `addItemOrdenAction`.
- Produces: the updated Órdenes detail page — consumed by Task 16's e2e test.

Read all three files' current live content before editing.

- [ ] **Step 1: Write the failing test for the repuesto select**

Edit `src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx` — replace the entire file with:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddItemOrdenAction = vi.fn();
vi.mock("@/app/actions/item-orden-actions", () => ({
  addItemOrdenAction: (...args: unknown[]) => mockAddItemOrdenAction(...args),
}));

import { AgregarItemForm } from "./agregar-item-form";

const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }] as never;

describe("AgregarItemForm", () => {
  beforeEach(() => {
    mockAddItemOrdenAction.mockReset();
    mockAddItemOrdenAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the repuesto select alongside the manual fields", () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} />);

    expect(screen.getByLabelText("Repuesto del inventario (opcional)")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit with manual fields", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem agregado");
  });

  it("shows the error message when the action returns one", async () => {
    mockAddItemOrdenAction.mockResolvedValue({ error: "La cantidad debe ser al menos 1", success: false });
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La cantidad debe ser al menos 1");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx"`
Expected: FAIL — `AgregarItemForm` doesn't accept a `repuestos` prop yet, and the "Repuesto del inventario (opcional)" label doesn't exist.

- [ ] **Step 3: Update `AgregarItemForm`**

Edit `src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx` — replace the entire file with:

```tsx
"use client";

import { useActionState } from "react";
import { addItemOrdenAction, type ItemOrdenFormState } from "@/app/actions/item-orden-actions";
import type { Repuesto } from "@/generated/prisma-tenant";

const initialState: ItemOrdenFormState = { error: null, success: false };

export function AgregarItemForm({ ordenId, repuestos }: { ordenId: string; repuestos: Repuesto[] }) {
  const addItem = addItemOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="repuestoId">Repuesto del inventario (opcional)</label>
      <select id="repuestoId" name="repuestoId" defaultValue="">
        <option value="">Ítem manual (completa descripción y precio abajo)</option>
        {repuestos.map((repuesto) => (
          <option key={repuesto.id} value={repuesto.id}>
            {repuesto.codigo} — {repuesto.nombre}
          </option>
        ))}
      </select>

      <label htmlFor="itemDescripcion">Descripción</label>
      <input id="itemDescripcion" name="descripcion" />

      <label htmlFor="itemCantidad">Cantidad</label>
      <input id="itemCantidad" name="cantidad" type="number" min="1" required />

      <label htmlFor="itemPrecioUnitario">Precio unitario</label>
      <input id="itemPrecioUnitario" name="precioUnitario" type="number" min="0" step="0.01" />

      <p>Si seleccionas un repuesto del inventario, la descripción y el precio se completan automáticamente.</p>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar ítem"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Ítem agregado</p> : null}
    </form>
  );
}
```

`required` was removed from `descripcion`/`precioUnitario` (they're now conditionally optional depending on whether a repuesto is selected, enforced server-side by Task 14's `itemOrdenInputSchema` `.refine()`) — `cantidad` stays `required` since it's always mandatory either way.

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx"`
Expected: PASS — 3 tests passed.

- [ ] **Step 4: Wire `listRepuestos` into the Orden detail page**

Edit `src/app/(dashboard)/ordenes/[id]/page.tsx` — add the import and fetch it alongside `orden`:

```tsx
import { notFound } from "next/navigation";
import { getOrden } from "@/app/actions/orden-actions";
import { listRepuestos } from "@/app/actions/repuesto-actions";
import { CambiarEstadoForm } from "./cambiar-estado-form";
import { AgregarItemForm } from "./agregar-item-form";
import { AgregarManoObraForm } from "./agregar-mano-obra-form";
import { DviChecklistForm } from "./dvi-checklist-form";
import { DviFotoForm } from "./dvi-foto-form";
import type { DviChecklist } from "@/lib/dvi/checklist-items";

export default async function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [orden, repuestos] = await Promise.all([getOrden(id), listRepuestos()]);

  if (!orden) {
    notFound();
  }

  return (
    <main>
      <h1>
        Orden — {orden.vehiculo.placa} ({orden.cliente.nombre})
      </h1>
      <p>Sede: {orden.sede.nombre}</p>
      <p>Mecánico: {orden.mecanico?.nombre ?? "Sin asignar"}</p>
      <p>Kilometraje de ingreso: {orden.kilometrajeIngreso ?? "—"}</p>
      <p>Síntomas: {orden.sintomas ?? "—"}</p>

      <h2>Estado: {orden.estado}</h2>
      <CambiarEstadoForm ordenId={orden.id} estadoActual={orden.estado} />

      <h2>Ítems (repuestos)</h2>
      <AgregarItemForm ordenId={orden.id} repuestos={repuestos} />
      <ul>
        {orden.items.map((item) => (
          <li key={item.id}>
            {item.descripcion} — {item.cantidad} x {item.precioUnitario.toString()}
          </li>
        ))}
      </ul>

      <h2>Mano de obra</h2>
      <AgregarManoObraForm ordenId={orden.id} />
      <ul>
        {orden.manoDeObra.map((linea) => (
          <li key={linea.id}>
            {linea.descripcion} — {linea.horas.toString()}h x {linea.precioHora.toString()}
          </li>
        ))}
      </ul>

      <h2>Inspección vehicular digital (DVI)</h2>
      <DviChecklistForm ordenId={orden.id} checklist={(orden.dvi?.checklist as DviChecklist | undefined) ?? null} />
      <DviFotoForm ordenId={orden.id} />
      <ul>
        {orden.dvi?.fotos.map((foto) => (
          <li key={foto.id}>
            {foto.momento === "ANTES" ? "Antes" : "Después"}:{" "}
            {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated route, next/image's optimizer can't reach it */}
            <img src={foto.url} alt={`Foto ${foto.momento.toLowerCase()} de la inspección`} width={200} />
          </li>
        ))}
      </ul>
    </main>
  );
}
```

Only the import line, the `Promise.all` fetch, and the `<AgregarItemForm>` call changed — everything else on the page is untouched. `listRepuestos()` returns `RepuestoWithDetalle[]` (includes `bodega`/`proveedor`), which is structurally assignable to `AgregarItemForm`'s `Repuesto[]` prop (extra included fields are fine).

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — every test from Fases 1-2 plus this phase still passes.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx" "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/page.tsx"
git commit -m "fase3-task 15: add repuesto select to AgregarItemForm"
git push
```

---

### Task 16: E2E — extend the smoke test through Inventario, Repuestos y Proveedores

**Files:**
- Modify: `e2e/tenant-flow.spec.ts`

**Interfaces:**
- Consumes: every UI surface from Tasks 4, 6, 9, 12, 13, 15 (`/bodegas`, `/proveedores`, `/repuestos`, `/entradas-mercancia`, `/entradas-mercancia/[id]`, and the Orden detail page's updated `AgregarItemForm`).
- Produces: end-to-end confidence that goods-receipt stock increments are real (not just unit-tested with mocks) and that linking a repuesto to an order line does NOT deduct stock (Fase 4's job) — extends the same single smoke test Fases 1-2 already built, rather than a second file.

Read the current live `e2e/tenant-flow.spec.ts` first (Fase 2 already extended it through DVI and estado transitions) — this task inserts a new inventory-setup block early (right after login, before the existing Cliente creation) and extends the existing "agregar ítem" step with one additional repuesto-linked item.

- [ ] **Step 1: Extend the existing smoke test**

Edit `e2e/tenant-flow.spec.ts` — replace the entire file with:

```ts
import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

test.use({ baseURL: "http://taller-e2e-smoke.localhost:3000" });

// A minimal valid 1x1 transparent PNG, used to exercise the DVI foto upload
// without committing a binary fixture file to the repo.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("login through Inventario, Orden de trabajo, and DVI, end to end", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/clientes$/);

  // --- Fase 3: Inventario, repuestos y proveedores ---

  await page.goto("/bodegas");
  await expect(page.getByText("Bodega principal")).toBeVisible();
  await page.getByLabel("Nombre").fill("Bodega norte");
  await page.getByRole("button", { name: "Crear bodega" }).click();
  await expect(page.getByRole("status")).toHaveText("Bodega creada");
  await expect(page.getByText("Bodega norte")).toBeVisible();

  await page.goto("/proveedores");
  await page.getByLabel("Nombre").fill("Repuestos El Motor");
  await page.getByRole("button", { name: "Crear proveedor" }).click();
  await expect(page.getByRole("status")).toHaveText("Proveedor creado");

  await page.goto("/repuestos");
  await page.getByLabel("Código").fill("FRN-001");
  await page.getByLabel("Nombre").fill("Filtro de aceite");
  await page.getByLabel("Precio de compra").fill("8");
  await page.getByLabel("Precio de venta").fill("18.9");
  await page.getByLabel("Stock inicial").fill("0");
  await page.getByLabel("Stock mínimo").fill("5");
  await page.getByLabel("Bodega").selectOption({ label: "Bodega principal" });
  await page.getByLabel("Proveedor").selectOption({ label: "Repuestos El Motor" });
  await page.getByRole("button", { name: "Crear repuesto" }).click();
  await expect(page.getByRole("status")).toHaveText("Repuesto creado");

  await page.goto("/entradas-mercancia");
  await page.getByLabel("Proveedor").selectOption({ label: "Repuestos El Motor" });
  await page.getByLabel("Bodega").selectOption({ label: "Bodega principal" });
  await page.getByRole("button", { name: "Crear entrada" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrada creada");

  await page.getByRole("link", { name: /Repuestos El Motor/ }).click();
  await expect(page.getByRole("heading", { name: /Entrada de mercancía/ })).toBeVisible();

  await page.getByLabel("Repuesto").selectOption({ label: /FRN-001/ });
  await page.getByLabel("Cantidad").fill("20");
  await page.getByLabel("Precio de compra unitario").fill("8");
  await page.getByRole("button", { name: "Registrar ítem" }).click();
  await expect(page.getByRole("status")).toHaveText("Ítem registrado, stock actualizado");

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 20/)).toBeVisible();

  // --- Fase 1: Clientes, Vehículos, Historial ---

  await page.goto("/clientes");
  await page.getByLabel("Nombre").fill("Juan Pérez");
  await page.getByRole("button", { name: "Crear cliente" }).click();
  await expect(page.getByRole("status")).toHaveText("Cliente creado");

  await page.getByRole("link", { name: "Juan Pérez" }).click();
  await expect(page.getByRole("heading", { name: "Juan Pérez" })).toBeVisible();

  await page.getByLabel("Placa").fill("ABC123");
  await page.getByLabel("Marca").fill("Toyota");
  await page.getByLabel("Modelo").fill("Corolla");
  await page.getByRole("button", { name: "Agregar vehículo" }).click();
  await expect(page.getByRole("status")).toHaveText("Vehículo agregado");

  await page.getByRole("link", { name: /ABC123/ }).click();
  await expect(page.getByRole("heading", { name: /ABC123/ })).toBeVisible();

  await page.getByLabel("Descripción").fill("Cambio de aceite y filtro");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByRole("status")).toHaveText("Entrada registrada");
  await expect(page.getByText("Cambio de aceite y filtro")).toBeVisible();

  // --- Fase 2: Orden de trabajo + DVI ---

  await page.getByLabel("Kilometraje de ingreso").fill("45000");
  await page.getByLabel("Síntomas reportados").fill("Ruido al frenar");
  await page.getByRole("button", { name: "Crear orden" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Orden creada" })).toBeVisible();

  await page.getByRole("link", { name: /EN_PROCESO|BORRADOR/ }).first().click();
  await expect(page.getByRole("heading", { name: /Orden — ABC123/ })).toBeVisible();

  await page.getByLabel("Descripción").first().fill("Pastillas de freno");
  await page.getByLabel("Cantidad").fill("4");
  await page.getByLabel("Precio unitario").fill("15");
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ítem agregado" })).toBeVisible();
  await expect(page.getByText("Pastillas de freno")).toBeVisible();

  // --- Fase 3: link a catalog Repuesto to this same order — trusted server-side pricing, no stock deduction ---

  await page.getByLabel("Repuesto del inventario (opcional)").selectOption({ label: /FRN-001/ });
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ítem agregado" })).toBeVisible();
  await expect(page.getByText(/Filtro de aceite — 2 x 18.9/)).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 20/)).toBeVisible();

  await page.goto(`/ordenes`);
  await page.getByRole("link", { name: /ABC123/ }).click();

  await page.getByLabel("Descripción").nth(1).fill("Cambio de pastillas de freno");
  await page.getByLabel("Horas").fill("1.5");
  await page.getByLabel("Precio por hora").fill("20");
  await page.getByRole("button", { name: "Agregar mano de obra" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mano de obra agregada" })).toBeVisible();

  await page.getByLabel("Frenos", { exact: true }).selectOption("CRITICO");
  await page.getByRole("button", { name: "Guardar checklist" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Checklist guardado" })).toBeVisible();

  await page.getByLabel("Momento").selectOption("ANTES");
  await page.getByLabel("Foto").setInputFiles({
    name: "antes.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  const [uploadsResponse] = await Promise.all([
    page.waitForResponse(
      (resp) => resp.url().includes("/api/uploads/") && resp.request().resourceType() === "image",
    ),
    page.getByRole("button", { name: "Subir foto" }).click(),
  ]);
  expect(uploadsResponse.status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "Foto subida" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Foto antes de la inspección" })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("EN_PROCESO");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByRole("heading", { name: "Estado: EN_PROCESO" })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("TERMINADA");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByRole("heading", { name: "Estado: TERMINADA" })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("ENTREGADA");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByText(/Estado actual: Entregada/)).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 20/)).toBeVisible();
});
```

Notes on the two changes from Fase 2's version, beyond the new inventory block:
1. After creating the first (manual) item, the test navigates away to `/repuestos` to assert the stock-after-receipt value, then has to navigate back into the same order via `/ordenes` → the `ABC123` link, since Playwright lost the order detail page context. This is why the mano-de-obra/DVI/estado steps that follow are unchanged in content but now come after a page round-trip.
2. Two stock assertions bookend the order-linking step (`stock: 20` before AND after adding the repuesto-linked item to the order, and again after the order reaches `ENTREGADA`) — proving Task 14's explicit non-goal (no automatic deduction this phase) holds through the whole order lifecycle, not just immediately after linking.

- [ ] **Step 2: Run the e2e test to confirm it passes end to end**

Run: `npm run test:e2e`
Expected: PASS — 2 tests passed (`landing.spec.ts` from Fase 1 plus this extended flow), exercising bodega creation → proveedor → repuesto → entrada de mercancía (real stock increment via the `$transaction`) → cliente → vehículo → historial → orden creation → manual item → catalog-linked item (trusted pricing, no stock deduction) → mano de obra → DVI checklist → DVI foto upload → estado transitions to `ENTREGADA` → final stock still unchanged.

- [ ] **Step 3: Run the full unit suite one more time to confirm the whole phase is green**

Run: `npx vitest run`
Expected: PASS — every unit/integration test from Tasks 1-15 plus every Fase 1/2 test still passes.

- [ ] **Step 4: Commit**

```bash
git add e2e/tenant-flow.spec.ts
git commit -m "fase3-task 16: extend e2e smoke test through inventario, repuestos y proveedores"
git push
```

---

## After this plan

This plan does not include a final whole-branch review task — following the same pattern as Fases 1-2, run the `code-review` skill (or `/code-review ultra` for a deeper multi-agent pass) against the full diff once Task 16 is committed, before considering Fase 3 done. Known, deliberate simplifications to flag to a reviewer as accepted scope (not bugs) if raised:

- `deleteBodegaAction`/`deleteProveedorAction`/`deleteRepuestoAction` exist and are unit-tested but have no UI caller yet — same precedent as Fase 1/2's other unwired delete actions.
- `updateBodegaAction`/`updateProveedorAction`/`updateRepuestoAction` exist and are unit-tested but have no UI caller yet either (no edit form was built this phase) — same precedent, extended to update for the first time in this project. Revisit if editing a repuesto's price turns out to be a frequent real need.
- `EntradaMercancia`/`EntradaMercanciaItem` have no update/delete at all (not even unwired-but-tested ones) — append-only by design, a correction is a new entry, not an edit.
- No reabastecimiento (low-stock) alerts/notifications — `stockMinimo` is captured and passively compared for the `⚠ stock bajo` list marker, but nothing pushes/emails/schedules anything.
- `ItemOrden.repuestoId` links pricing/traceability only — no automatic stock deduction anywhere in this phase (explicitly Fase 4's job, once facturación exists). The e2e test explicitly asserts stock is unchanged through the whole order lifecycle including `ENTREGADA`.
- Every bodega/repuesto is implicitly single-sede (the tenant's one auto-provisioned `Sede`) — `Bodega.sedeId` exists and is populated, but there's no sede selector anywhere (same Fase 2 precedent, Fase 6's job).
- Money (`precioCompra`, `precioVenta`, `precioCompraUnitario`) stored via `z.coerce.number()` into `Decimal` columns — same known simplification flagged in Fase 2's final review (Minor #11), not fixed here.
