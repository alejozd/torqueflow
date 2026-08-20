# TorqueFlow — Fase 2 (Órdenes de Trabajo + DVI): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Órdenes de trabajo module (módulo 2, sin facturación) and the Inspección Vehicular Digital — DVI (módulo 3) on top of Fase 1's multi-tenant Clientes/Vehículos core, with the `Sede` entity and `sede_id` wiring built in from the start (per the 2026-08-20 design-doc decision) even though only a single default sede exists until Fase 6 activates multi-sede UI.

**Architecture:** New Prisma models in the tenant schema template (`Sede`, `OrdenTrabajo`, `ItemOrden`, `ManoDeObra`, `Dvi`, `DviFoto`) follow the exact server-action + Zod + `useActionState` pattern established by Fase 1's Cliente/Vehículo/Historial modules — no new architectural layer. DVI photo uploads are the one new capability: files are written to a local disk directory (no cloud storage — matches design doc §6/§8's self-hosted, no-cloud-provider stance for v1) and served back through an auth-gated Next.js Route Handler, never through `public/`.

**Tech Stack:** Next.js 16 App Router (Server Actions, Route Handlers) + Prisma 6.19.3 + PostgreSQL + Zod 4 + Vitest/React Testing Library + Playwright. No new npm dependencies are introduced by this phase.

## Global Constraints

- **Prisma pin**: any `prisma`/`@prisma/client` install in this plan must stay at `6.19.3` exactly (already installed — this phase does not change the version, only extends `prisma/tenant/schema.prisma`).
- **Remote Postgres only**: no local Postgres. Every `prisma migrate` command in this plan connects to the developer's remote server via `TENANT_DATABASE_URL`/`TENANT_DATABASE_BASE_URL`, same as Fase 1.
- **Sede architecture (2026-08-20 design-doc decision, `docs/design/2026-08-02-taller-saas-multitenant-design.md` §5.12)**: `OrdenTrabajo` carries `sede_id` from this phase onward. `provisionTenant` auto-creates one default `Sede` per tenant. There is no sede selector, no multi-sede UI, and no `UsuarioSede` bridge table in this phase — that is Fase 6's job. Every order in this phase is silently attached to the tenant's single default sede.
- **Auth roles** (per this phase's brief): `requireRole(["ADMIN", "RECEPCION"])` to create orders and to delete items/mano de obra/fotos (corrections). `requireRole(["ADMIN", "RECEPCION", "TECNICO"])` to change order state and to add items/mano de obra/DVI checklist/DVI fotos. `requireSession()` (any authenticated role) to read. This mirrors the existing precedent: Cliente/Vehículo create+delete already gate on `["ADMIN", "RECEPCION"]`; Historial's add-entry already gates on all three roles.
- **Validation**: every Server Action that accepts `FormData` parses it with a Zod (`zod@^4.4.3`, already installed) `safeParse` schema first and returns `{ error, success }` — never throws for a validation failure, matching Cliente/Vehículo/Historial.
- **Data layer**: Server Actions for mutations, React Server Components for reads — no client-side data fetching. All new models live in `prisma/tenant/schema.prisma` (per-tenant schema), never in `prisma/schema.prisma` (the global `public` schema, which only holds `Tenant`).
- **No inventory deduction, no billing**: `ItemOrden.descripcion` is free text in this phase (repuestos are not linked to an `Inventario`/`Repuesto` model — that model doesn't exist until Fase 3). No `Factura`/payment entity, no `descuento`/`iva` fields — Fase 4's job.
- **Tests**: unit tests for Server Actions mock `@/lib/auth/guards` and `@/lib/db/tenant-client` exactly like `vehiculo-actions.test.ts`/`cliente-actions.test.ts` (no real DB). Tests that touch Prisma schema/migration behavior directly (provisioning) are real-DB integration tests using `provisionTenant`, exactly like `provision-tenant.test.ts`/`tenant-client.test.ts` — self-provisioning a uniquely-named fixture schema and dropping it in `afterAll`/`afterEach`.
- **UI style**: plain semantic HTML, no component library, no client-side tab widgets — matches every existing page (`clientes/page.tsx`, `clientes/[id]/page.tsx`, `vehiculos/[id]/page.tsx`). The order detail page renders its sections (info, items, mano de obra, DVI) stacked under `<h2>` headings on one page, not interactive tabs, to stay consistent with the codebase's existing flat-page convention.
- **File uploads**: DVI fotos are written under `UPLOADS_DIR` (default `./uploads` at repo root, gitignored) as `image/jpeg`, `image/png`, or `image/webp`, max 5 MB. `next.config.ts` needs `experimental.serverActions.bodySizeLimit` raised to `"6mb"` (5 MB file + multipart overhead — see Next.js's own guidance in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`) or uploads over ~1 MB will be rejected before reaching the Server Action.

---

### Task 1: Prisma schema — `Sede`, `EstadoOrden`, `OrdenTrabajo`, `ItemOrden`, `ManoDeObra` + default-Sede provisioning

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/<timestamp>_add_sedes_ordenes_items_mano_de_obra/` (generated)
- Modify: `scripts/provision-tenant.ts`
- Modify: `scripts/provision-tenant.test.ts`

**Interfaces:**
- Consumes: `Cliente`, `Vehiculo`, `Usuario` models (Fase 1, `prisma/tenant/schema.prisma`); `getTenantDb` (`src/lib/db/tenant-client.ts`).
- Produces: `Sede`, `EstadoOrden` enum (`BORRADOR | EN_PROCESO | TERMINADA | ENTREGADA | ANULADA`), `OrdenTrabajo`, `ItemOrden`, `ManoDeObra` Prisma models — every later task in this plan depends on these. `provisionTenant` now also inserts one `Sede` row per new tenant, which Task 3's `createOrdenAction` reads via `tenantDb.sede.findFirst()`.

- [ ] **Step 1: Add the new models to the tenant schema template**

Edit `prisma/tenant/schema.prisma` — add after the `Role` enum and before `model Usuario`:

```prisma
enum EstadoOrden {
  BORRADOR
  EN_PROCESO
  TERMINADA
  ENTREGADA
  ANULADA
}
```

Add `ordenesCreadas` and `ordenesAsignadas` back-relations to `model Usuario` (insert the two lines after `historialEntries`):

```prisma
model Usuario {
  id                String              @id @default(cuid())
  email             String              @unique
  passwordHash      String              @map("password_hash")
  nombre            String
  role              Role                @default(RECEPCION)
  historialEntries  HistorialVehiculo[]
  ordenesCreadas    OrdenTrabajo[]      @relation("OrdenCreadoPor")
  ordenesAsignadas  OrdenTrabajo[]      @relation("OrdenMecanico")
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  @@map("usuarios")
}
```

Add the `ordenes` back-relation to `model Cliente` (after `vehiculos`) and to `model Vehiculo` (after `historial`):

```prisma
model Cliente {
  id        String         @id @default(cuid())
  nombre    String
  telefono  String?
  email     String?
  documento String?
  vehiculos Vehiculo[]
  ordenes   OrdenTrabajo[]
  createdAt DateTime       @default(now()) @map("created_at")
  updatedAt DateTime       @updatedAt @map("updated_at")

  @@map("clientes")
}

model Vehiculo {
  id        String              @id @default(cuid())
  placa     String              @unique
  marca     String
  modelo    String
  anio      Int?
  clienteId String              @map("cliente_id")
  cliente   Cliente             @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  historial HistorialVehiculo[]
  ordenes   OrdenTrabajo[]
  createdAt DateTime            @default(now()) @map("created_at")
  updatedAt DateTime            @updatedAt @map("updated_at")

  @@map("vehiculos")
  @@index([clienteId])
}
```

Append at the end of the file, after `model HistorialVehiculo`:

```prisma
model Sede {
  id        String         @id @default(cuid())
  nombre    String
  direccion String?
  ordenes   OrdenTrabajo[]
  createdAt DateTime       @default(now()) @map("created_at")
  updatedAt DateTime       @updatedAt @map("updated_at")

  @@map("sedes")
}

model OrdenTrabajo {
  id                 String       @id @default(cuid())
  estado             EstadoOrden  @default(BORRADOR)
  clienteId          String       @map("cliente_id")
  cliente            Cliente      @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  vehiculoId         String       @map("vehiculo_id")
  vehiculo           Vehiculo     @relation(fields: [vehiculoId], references: [id], onDelete: Restrict)
  sedeId             String       @map("sede_id")
  sede               Sede         @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  mecanicoId         String?      @map("mecanico_id")
  mecanico           Usuario?     @relation("OrdenMecanico", fields: [mecanicoId], references: [id], onDelete: SetNull)
  creadoPorId        String       @map("creado_por_id")
  creadoPor          Usuario      @relation("OrdenCreadoPor", fields: [creadoPorId], references: [id], onDelete: Restrict)
  kilometrajeIngreso Int?         @map("kilometraje_ingreso")
  sintomas           String?
  items              ItemOrden[]
  manoDeObra         ManoDeObra[]
  dvi                Dvi?
  entregadaAt        DateTime?    @map("entregada_at")
  anuladaAt          DateTime?    @map("anulada_at")
  createdAt          DateTime     @default(now()) @map("created_at")
  updatedAt          DateTime     @updatedAt @map("updated_at")

  @@map("ordenes_trabajo")
  @@index([clienteId])
  @@index([vehiculoId])
  @@index([sedeId])
  @@index([estado])
}

model ItemOrden {
  id             String       @id @default(cuid())
  ordenId        String       @map("orden_id")
  orden          OrdenTrabajo @relation(fields: [ordenId], references: [id], onDelete: Cascade)
  descripcion    String
  cantidad       Int
  precioUnitario Decimal      @map("precio_unitario") @db.Decimal(10, 2)
  createdAt      DateTime     @default(now()) @map("created_at")

  @@map("items_orden")
  @@index([ordenId])
}

model ManoDeObra {
  id          String       @id @default(cuid())
  ordenId     String       @map("orden_id")
  orden       OrdenTrabajo @relation(fields: [ordenId], references: [id], onDelete: Cascade)
  descripcion String
  horas       Decimal      @db.Decimal(5, 2)
  precioHora  Decimal      @map("precio_hora") @db.Decimal(10, 2)
  createdAt   DateTime     @default(now()) @map("created_at")

  @@map("mano_de_obra")
  @@index([ordenId])
}
```

Note: `Dvi` (Task 10) is referenced above (`dvi Dvi?`) but not defined until Task 10 — this is fine, Prisma resolves relations across the whole file at generate time and Task 10 adds the missing model before the next migration.

Actually, do not leave a dangling reference across tasks: **for this step only**, temporarily omit the `dvi Dvi?` line from `OrdenTrabajo` (add it in Task 10 instead, in the same edit that defines `model Dvi`). This keeps every task's migration self-contained and buildable in isolation, per this plan's task-independence rule.

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name add_sedes_ordenes_items_mano_de_obra`
Expected: creates `prisma/tenant/migrations/<timestamp>_add_sedes_ordenes_items_mano_de_obra/migration.sql`, applies it against the reference tenant schema (`TENANT_DATABASE_URL` from `.env`), regenerates the Prisma client at `src/generated/prisma-tenant`.

- [ ] **Step 3: Write the failing test for default-Sede provisioning**

Edit `scripts/provision-tenant.test.ts` — add this `it` block inside the existing `describe("provisionTenant", ...)`, right after the first `it` block:

```ts
  it("creates one default Sede for the new tenant", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);
    const sedes = await tenantDb.sede.findMany();

    expect(sedes).toHaveLength(1);
    expect(sedes[0].nombre).toBe("Sede principal");
  });
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run scripts/provision-tenant.test.ts -t "creates one default Sede"`
Expected: FAIL — `sedes` has length 0 (no `Sede` row was created by `provisionTenant`).

- [ ] **Step 5: Make `provisionTenant` create the default Sede**

Edit `scripts/provision-tenant.ts` — add the import and the post-creation insert:

```ts
import { execSync } from "node:child_process";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { isValidTenantSlug } from "@/lib/tenant/subdomain";
import type { Tenant } from "@/generated/prisma-public";
```

Change the `return await publicDb.tenant.create({ data: { slug, schemaName } });` line to:

```ts
    const tenant = await publicDb.tenant.create({ data: { slug, schemaName } });

    const tenantDb = getTenantDb(schemaName);
    await tenantDb.sede.create({ data: { nombre: "Sede principal" } });

    return tenant;
```

- [ ] **Step 6: Run the tests again to confirm they pass**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: PASS — all `provisionTenant` tests pass, including the new one.

- [ ] **Step 7: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations scripts/provision-tenant.ts scripts/provision-tenant.test.ts
git commit -m "task 1: add Sede/OrdenTrabajo/ItemOrden/ManoDeObra models, auto-create default Sede on provisioning"
git push
```

---

### Task 2: Validation schemas + order state machine

**Files:**
- Create: `src/lib/validation/orden.ts`
- Create: `src/lib/orden/estado-transitions.ts`
- Test: `src/lib/orden/estado-transitions.test.ts`

**Interfaces:**
- Consumes: `EstadoOrden` type (`@/generated/prisma-tenant`, Task 1).
- Produces: `ordenTrabajoInputSchema`, `itemOrdenInputSchema`, `manoDeObraInputSchema`, `estadoOrdenSchema` (all `@/lib/validation/orden`) — consumed by Tasks 3-6's Server Actions. `ESTADO_ORDEN_TRANSITIONS: Record<EstadoOrden, EstadoOrden[]>` and `isValidEstadoTransition(from, to): boolean` (`@/lib/orden/estado-transitions`) — consumed by Task 4's `updateEstadoOrdenAction` and Task 9's `CambiarEstadoForm`.

- [ ] **Step 1: Write the failing test for the state machine**

Create `src/lib/orden/estado-transitions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ESTADO_ORDEN_TRANSITIONS, isValidEstadoTransition } from "./estado-transitions";

describe("isValidEstadoTransition", () => {
  it("allows BORRADOR to move to EN_PROCESO", () => {
    expect(isValidEstadoTransition("BORRADOR", "EN_PROCESO")).toBe(true);
  });

  it("allows BORRADOR to move to ANULADA", () => {
    expect(isValidEstadoTransition("BORRADOR", "ANULADA")).toBe(true);
  });

  it("rejects BORRADOR moving directly to TERMINADA", () => {
    expect(isValidEstadoTransition("BORRADOR", "TERMINADA")).toBe(false);
  });

  it("allows EN_PROCESO to move to TERMINADA or ANULADA", () => {
    expect(isValidEstadoTransition("EN_PROCESO", "TERMINADA")).toBe(true);
    expect(isValidEstadoTransition("EN_PROCESO", "ANULADA")).toBe(true);
  });

  it("allows TERMINADA to move only to ENTREGADA", () => {
    expect(isValidEstadoTransition("TERMINADA", "ENTREGADA")).toBe(true);
    expect(isValidEstadoTransition("TERMINADA", "ANULADA")).toBe(false);
  });

  it("rejects any transition out of ENTREGADA or ANULADA (terminal states)", () => {
    expect(ESTADO_ORDEN_TRANSITIONS.ENTREGADA).toEqual([]);
    expect(ESTADO_ORDEN_TRANSITIONS.ANULADA).toEqual([]);
    expect(isValidEstadoTransition("ENTREGADA", "BORRADOR")).toBe(false);
  });

  it("rejects a no-op transition to the same state", () => {
    expect(isValidEstadoTransition("EN_PROCESO", "EN_PROCESO")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/orden/estado-transitions.test.ts`
Expected: FAIL — `Cannot find module './estado-transitions'`.

- [ ] **Step 3: Implement the state machine**

Create `src/lib/orden/estado-transitions.ts`:

```ts
import type { EstadoOrden } from "@/generated/prisma-tenant";

export const ESTADO_ORDEN_TRANSITIONS: Record<EstadoOrden, EstadoOrden[]> = {
  BORRADOR: ["EN_PROCESO", "ANULADA"],
  EN_PROCESO: ["TERMINADA", "ANULADA"],
  TERMINADA: ["ENTREGADA"],
  ENTREGADA: [],
  ANULADA: [],
};

export function isValidEstadoTransition(from: EstadoOrden, to: EstadoOrden): boolean {
  return ESTADO_ORDEN_TRANSITIONS[from].includes(to);
}
```

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `npx vitest run src/lib/orden/estado-transitions.test.ts`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Add the Zod validation schemas (no separate test — pure declarative schemas, exercised end-to-end by Tasks 3/5/6's action tests)**

Create `src/lib/validation/orden.ts`:

```ts
import { z } from "zod";

export const ordenTrabajoInputSchema = z.object({
  mecanicoId: z.string().optional().or(z.literal("")),
  kilometrajeIngreso: z.coerce.number().int().min(0, "El kilometraje no puede ser negativo").optional(),
  sintomas: z.string().optional().or(z.literal("")),
});

export type OrdenTrabajoInput = z.infer<typeof ordenTrabajoInputSchema>;

export const itemOrdenInputSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
  precioUnitario: z.coerce.number().min(0, "El precio no puede ser negativo"),
});

export type ItemOrdenInput = z.infer<typeof itemOrdenInputSchema>;

export const manoDeObraInputSchema = z.object({
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  horas: z.coerce.number().min(0.1, "Las horas deben ser mayores a 0"),
  precioHora: z.coerce.number().min(0, "El precio no puede ser negativo"),
});

export type ManoDeObraInput = z.infer<typeof manoDeObraInputSchema>;

export const estadoOrdenSchema = z.enum(["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"]);
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/orden/estado-transitions.ts src/lib/orden/estado-transitions.test.ts src/lib/validation/orden.ts
git commit -m "task 2: add OrdenTrabajo validation schemas and estado state machine"
git push
```

---

### Task 3: `orden-actions.ts` — list, get, create

**Files:**
- Create: `src/app/actions/orden-actions.ts`
- Test: `src/app/actions/orden-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole`/`requireSession` (`@/lib/auth/guards`), `getTenantDb` (`@/lib/db/tenant-client`), `friendlyPrismaErrorMessage` (`@/lib/db/prisma-error-message`), `ordenTrabajoInputSchema` (Task 2).
- Produces: `OrdenFormState`, `OrdenWithDetalle` type, `ORDEN_DETAIL_INCLUDE`, `listOrdenes(estado?)`, `listOrdenesByVehiculo(vehiculoId)`, `getOrden(id)`, `listTecnicos()`, `createOrdenAction(clienteId, vehiculoId, prevState, formData)` — consumed by Task 4 (adds `updateEstadoOrdenAction` to this same file), Task 7 (list page), Task 8 (create form + vehiculo detail page), Task 9 (detail page).

- [ ] **Step 1: Write the failing tests**

Create `src/app/actions/orden-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockSedeFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: { create: mockCreate, findMany: mockFindMany, findUnique: mockFindUnique },
    sede: { findFirst: mockSedeFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createOrdenAction, listOrdenes, getOrden, type OrdenFormState } from "./orden-actions";

const initialState: OrdenFormState = { error: null, success: false };

describe("createOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
    mockSedeFindFirst.mockReset().mockResolvedValue({ id: "s1", nombre: "Sede principal" });
  });

  it("returns a validation error for a negative kilometraje", async () => {
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "-5");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El kilometraje no puede ser negativo");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the order attached to the tenant's default Sede on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "o1" });
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "12000");
    formData.set("sintomas", "Ruido al frenar");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "c1",
        vehiculoId: "v1",
        sedeId: "s1",
        creadoPorId: "u1",
        mecanicoId: null,
        kilometrajeIngreso: 12000,
        sintomas: "Ruido al frenar",
      },
    });
  });

  it("returns an error when the tenant has no Sede (should never happen post-provisioning, but guarded)", async () => {
    mockSedeFindFirst.mockResolvedValue(null);
    const formData = new FormData();

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No hay una sede configurada para este taller.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();

    await expect(createOrdenAction("c1", "v1", initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("listOrdenes", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset();
  });

  it("lists all orders when no estado filter is given", async () => {
    mockFindMany.mockResolvedValue([{ id: "o1" }]);

    const result = await listOrdenes();

    expect(result).toEqual([{ id: "o1" }]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined, orderBy: { createdAt: "desc" } }),
    );
  });

  it("filters by estado when given", async () => {
    mockFindMany.mockResolvedValue([]);

    await listOrdenes("EN_PROCESO");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: "EN_PROCESO" } }),
    );
  });
});

describe("getOrden", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "RECEPCION", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset();
  });

  it("returns null when the order does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getOrden("missing");

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: FAIL — `Cannot find module './orden-actions'`.

- [ ] **Step 3: Implement `orden-actions.ts`**

Create `src/app/actions/orden-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { ordenTrabajoInputSchema } from "@/lib/validation/orden";
import type { EstadoOrden, OrdenTrabajo, Prisma, Usuario } from "@/generated/prisma-tenant";

export interface OrdenFormState {
  error: string | null;
  success: boolean;
}

const ORDEN_DETAIL_INCLUDE = {
  cliente: true,
  vehiculo: true,
  sede: true,
  mecanico: true,
  items: true,
  manoDeObra: true,
} satisfies Prisma.OrdenTrabajoInclude;

export type OrdenWithDetalle = Prisma.OrdenTrabajoGetPayload<{ include: typeof ORDEN_DETAIL_INCLUDE }>;

export async function listOrdenes(estado?: EstadoOrden): Promise<OrdenWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.findMany({
    where: estado ? { estado } : undefined,
    include: ORDEN_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function listOrdenesByVehiculo(vehiculoId: string): Promise<OrdenTrabajo[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.findMany({ where: { vehiculoId }, orderBy: { createdAt: "desc" } });
}

export async function getOrden(id: string): Promise<OrdenWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.ordenTrabajo.findUnique({ where: { id }, include: ORDEN_DETAIL_INCLUDE });
}

export async function listTecnicos(): Promise<Usuario[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.usuario.findMany({ where: { role: "TECNICO" }, orderBy: { nombre: "asc" } });
}

export async function createOrdenAction(
  clienteId: string,
  vehiculoId: string,
  prevState: OrdenFormState,
  formData: FormData,
): Promise<OrdenFormState> {
  const parsed = ordenTrabajoInputSchema.safeParse({
    mecanicoId: formData.get("mecanicoId") ?? "",
    kilometrajeIngreso: formData.get("kilometrajeIngreso") || undefined,
    sintomas: formData.get("sintomas") ?? "",
  });

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
    await tenantDb.ordenTrabajo.create({
      data: {
        clienteId,
        vehiculoId,
        sedeId: sede.id,
        creadoPorId: session.user.id,
        mecanicoId: parsed.data.mecanicoId || null,
        kilometrajeIngreso: parsed.data.kilometrajeIngreso,
        sintomas: parsed.data.sintomas || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la orden"), success: false };
  }

  revalidatePath(`/vehiculos/${vehiculoId}`);
  return { error: null, success: true };
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/orden-actions.ts src/app/actions/orden-actions.test.ts
git commit -m "task 3: add orden-actions list/get/create"
git push
```

---

### Task 4: `updateEstadoOrdenAction` — state-machine-enforced transitions

**Files:**
- Modify: `src/app/actions/orden-actions.ts`
- Modify: `src/app/actions/orden-actions.test.ts`

**Interfaces:**
- Consumes: `isValidEstadoTransition` (`@/lib/orden/estado-transitions`, Task 2), `estadoOrdenSchema` (`@/lib/validation/orden`, Task 2).
- Produces: `EstadoFormState`, `updateEstadoOrdenAction(id, prevState, formData)` — consumed by Task 9's `CambiarEstadoForm`.

- [ ] **Step 1: Write the failing tests**

Edit `src/app/actions/orden-actions.test.ts` — add `findUnique` (already mocked for `getOrden`) plus a new `mockUpdate`, and extend the tenant-client mock:

```ts
const mockUpdate = vi.fn();
```

Change the `vi.mock("@/lib/db/tenant-client", ...)` block to also expose `update`:

```ts
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: { create: mockCreate, findMany: mockFindMany, findUnique: mockFindUnique, update: mockUpdate },
    sede: { findFirst: mockSedeFindFirst },
  }),
}));
```

Add to the import line:

```ts
import {
  createOrdenAction,
  listOrdenes,
  getOrden,
  updateEstadoOrdenAction,
  type OrdenFormState,
  type EstadoFormState,
} from "./orden-actions";
```

Append this new `describe` block at the end of the file:

```ts
describe("updateEstadoOrdenAction", () => {
  const initialEstadoState: EstadoFormState = { error: null };

  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("rejects an invalid estado value", async () => {
    const formData = new FormData();
    formData.set("estado", "NOT_A_REAL_ESTADO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("Estado inválido");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a transition that skips states (BORRADOR straight to TERMINADA)", async () => {
    mockFindUnique.mockResolvedValue({ id: "o1", estado: "BORRADOR" });
    const formData = new FormData();
    formData.set("estado", "TERMINADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("No se puede cambiar de BORRADOR a TERMINADA");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("applies a valid transition and stamps entregadaAt when moving to ENTREGADA", async () => {
    mockFindUnique.mockResolvedValue({ id: "o1", estado: "TERMINADA" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("estado", "ENTREGADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { estado: "ENTREGADA", entregadaAt: expect.any(Date), anuladaAt: undefined },
    });
  });

  it("returns 'Orden no encontrada' when the order does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("missing", initialEstadoState, formData);

    expect(result.error).toBe("Orden no encontrada");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/orden-actions.test.ts -t "updateEstadoOrdenAction"`
Expected: FAIL — `updateEstadoOrdenAction is not a function`.

- [ ] **Step 3: Implement `updateEstadoOrdenAction`**

Edit `src/app/actions/orden-actions.ts` — add to the imports:

```ts
import { isValidEstadoTransition } from "@/lib/orden/estado-transitions";
import { estadoOrdenSchema } from "@/lib/validation/orden";
```

Append at the end of the file:

```ts
export interface EstadoFormState {
  error: string | null;
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

  const orden = await tenantDb.ordenTrabajo.findUnique({ where: { id } });
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
  return { error: null };
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/orden-actions.ts src/app/actions/orden-actions.test.ts
git commit -m "task 4: add updateEstadoOrdenAction with state-machine enforcement"
git push
```

---

### Task 5: `item-orden-actions.ts` — add/delete repuestos on an order

**Files:**
- Create: `src/app/actions/item-orden-actions.ts`
- Test: `src/app/actions/item-orden-actions.test.ts`

**Interfaces:**
- Consumes: `itemOrdenInputSchema` (`@/lib/validation/orden`, Task 2).
- Produces: `ItemOrdenFormState`, `addItemOrdenAction(ordenId, prevState, formData)`, `deleteItemOrdenAction(id, ordenId)` — consumed by Task 9 (detail page).

- [ ] **Step 1: Write the failing tests**

Create `src/app/actions/item-orden-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreate = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ itemOrden: { create: mockCreate, delete: mockDelete } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addItemOrdenAction, deleteItemOrdenAction, type ItemOrdenFormState } from "./item-orden-actions";

const initialState: ItemOrdenFormState = { error: null, success: false };

describe("addItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
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

  it("creates the item linked to the given ordenId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "2");
    formData.set("precioUnitario", "15.5");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: 15.5 },
    });
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
});

describe("deleteItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete an item", async () => {
    await deleteItemOrdenAction("i1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/item-orden-actions.test.ts`
Expected: FAIL — `Cannot find module './item-orden-actions'`.

- [ ] **Step 3: Implement `item-orden-actions.ts`**

Create `src/app/actions/item-orden-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { itemOrdenInputSchema } from "@/lib/validation/orden";

export interface ItemOrdenFormState {
  error: string | null;
  success: boolean;
}

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

export async function deleteItemOrdenAction(id: string, ordenId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.itemOrden.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el ítem"));
  }
  revalidatePath(`/ordenes/${ordenId}`);
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/item-orden-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/item-orden-actions.ts src/app/actions/item-orden-actions.test.ts
git commit -m "task 5: add item-orden-actions add/delete"
git push
```

---

### Task 6: `mano-de-obra-actions.ts` — add/delete labor lines on an order

**Files:**
- Create: `src/app/actions/mano-de-obra-actions.ts`
- Test: `src/app/actions/mano-de-obra-actions.test.ts`

**Interfaces:**
- Consumes: `manoDeObraInputSchema` (`@/lib/validation/orden`, Task 2).
- Produces: `ManoDeObraFormState`, `addManoDeObraAction(ordenId, prevState, formData)`, `deleteManoDeObraAction(id, ordenId)` — consumed by Task 9 (detail page). Mirrors Task 5 exactly, with `horas`/`precioHora` fields instead of `cantidad`/`precioUnitario`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/actions/mano-de-obra-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreate = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ manoDeObra: { create: mockCreate, delete: mockDelete } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addManoDeObraAction, deleteManoDeObraAction, type ManoDeObraFormState } from "./mano-de-obra-actions";

const initialState: ManoDeObraFormState = { error: null, success: false };

describe("addManoDeObraAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error when horas is 0", async () => {
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("horas", "0");
    formData.set("precioHora", "20");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Las horas deben ser mayores a 0");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the labor line linked to the given ordenId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "m1" });
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("horas", "1.5");
    formData.set("precioHora", "20");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Cambio de pastillas de freno", horas: 1.5, precioHora: 20 },
    });
  });
});

describe("deleteManoDeObraAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete a labor line", async () => {
    await deleteManoDeObraAction("m1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/mano-de-obra-actions.test.ts`
Expected: FAIL — `Cannot find module './mano-de-obra-actions'`.

- [ ] **Step 3: Implement `mano-de-obra-actions.ts`**

Create `src/app/actions/mano-de-obra-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { manoDeObraInputSchema } from "@/lib/validation/orden";

export interface ManoDeObraFormState {
  error: string | null;
  success: boolean;
}

export async function addManoDeObraAction(
  ordenId: string,
  prevState: ManoDeObraFormState,
  formData: FormData,
): Promise<ManoDeObraFormState> {
  const parsed = manoDeObraInputSchema.safeParse({
    descripcion: formData.get("descripcion"),
    horas: formData.get("horas"),
    precioHora: formData.get("precioHora"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.manoDeObra.create({
      data: {
        ordenId,
        descripcion: parsed.data.descripcion,
        horas: parsed.data.horas,
        precioHora: parsed.data.precioHora,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar la mano de obra"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function deleteManoDeObraAction(id: string, ordenId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.manoDeObra.delete({ where: { id } });
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar la mano de obra"));
  }
  revalidatePath(`/ordenes/${ordenId}`);
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/mano-de-obra-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/mano-de-obra-actions.ts src/app/actions/mano-de-obra-actions.test.ts
git commit -m "task 6: add mano-de-obra-actions add/delete"
git push
```

---

### Task 7: UI — Órdenes list page + dashboard nav link

**Files:**
- Create: `src/app/(dashboard)/ordenes/page.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `listOrdenes(estado?)` (`@/app/actions/orden-actions`, Task 3).
- Produces: the `/ordenes` route, linked from the dashboard header — consumed visually by Task 14's e2e test (`page.getByRole("link", { name: "Órdenes" })`).

Note on testing: this list page is a thin Server Component composition (fetch + map to links), no conditional branching beyond a query-string filter. Following the precedent already set in this codebase — `clientes/page.tsx` and `vehiculos/[id]/page.tsx` have no dedicated `.test.tsx` (only components with real conditional logic, like `login/page.tsx`, get an RSC render test) — this page is covered by Task 14's e2e test instead of a unit test.

- [ ] **Step 1: Create the Órdenes list page**

Create `src/app/(dashboard)/ordenes/page.tsx`:

```tsx
import Link from "next/link";
import { listOrdenes } from "@/app/actions/orden-actions";
import type { EstadoOrden } from "@/generated/prisma-tenant";

const ESTADOS_VALIDOS: EstadoOrden[] = ["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"];

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoOrden) ? (estado as EstadoOrden) : undefined;
  const ordenes = await listOrdenes(estadoFiltro);

  return (
    <main>
      <h1>Órdenes de trabajo</h1>

      <nav aria-label="Filtrar por estado">
        <Link href="/ordenes">Todas</Link>
        {ESTADOS_VALIDOS.map((value) => (
          <Link key={value} href={`/ordenes?estado=${value}`}>
            {ESTADO_LABELS[value]}
          </Link>
        ))}
      </nav>

      <ul>
        {ordenes.map((orden) => (
          <li key={orden.id}>
            <Link href={`/ordenes/${orden.id}`}>
              {orden.vehiculo.placa} — {orden.cliente.nombre} — {ESTADO_LABELS[orden.estado]}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Add the nav link to the dashboard header**

Edit `src/app/(dashboard)/layout.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guards";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <div style={{ padding: "2rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ordenes">Órdenes</Link>
        </nav>
        <span>
          Sesión: {session.user.email} — {session.user.tenantSlug}
        </span>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Verify manually (dev server) and run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all existing tests still pass (this task adds no new `.test.tsx`, so the count should be unchanged from before this task).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/ordenes/page.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "task 7: add ordenes list page and dashboard nav link"
git push
```

---

### Task 8: UI — Nueva orden form, wired into the Vehículo detail page

**Files:**
- Create: `src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.tsx`
- Test: `src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.test.tsx`
- Modify: `src/app/(dashboard)/vehiculos/[id]/page.tsx`

**Interfaces:**
- Consumes: `createOrdenAction` (Task 3), `listOrdenesByVehiculo`, `listTecnicos` (Task 3).
- Produces: the "Nueva orden" entry point on the Vehículo detail page, per this phase's business flow step 1-3 (recepcionista crea orden para un vehículo existente, asigna mecánico, registra kilometraje y síntomas — folded into one form for MVP simplicity, since this codebase has no multi-step wizard precedent).

- [ ] **Step 1: Write the failing tests**

Create `src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateOrdenAction = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  createOrdenAction: (...args: unknown[]) => mockCreateOrdenAction(...args),
}));

import { NuevaOrdenForm } from "./nueva-orden-form";

const tecnicos = [{ id: "t1", nombre: "Carlos Ruiz" }] as never;

describe("NuevaOrdenForm", () => {
  beforeEach(() => {
    mockCreateOrdenAction.mockReset();
    mockCreateOrdenAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the kilometraje, síntomas, and mecánico fields", () => {
    render(<NuevaOrdenForm clienteId="c1" vehiculoId="v1" tecnicos={tecnicos} />);

    expect(screen.getByLabelText("Kilometraje de ingreso")).toBeInTheDocument();
    expect(screen.getByLabelText("Síntomas reportados")).toBeInTheDocument();
    expect(screen.getByLabelText("Mecánico asignado")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Carlos Ruiz" })).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevaOrdenForm clienteId="c1" vehiculoId="v1" tecnicos={tecnicos} />);

    await userEvent.type(screen.getByLabelText("Kilometraje de ingreso"), "12000");
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Orden creada");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateOrdenAction.mockResolvedValue({ error: "El kilometraje no puede ser negativo", success: false });
    render(<NuevaOrdenForm clienteId="c1" vehiculoId="v1" tecnicos={tecnicos} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El kilometraje no puede ser negativo");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/\(dashboard\)/vehiculos/\[id\]/nueva-orden-form.test.tsx`
Expected: FAIL — `Cannot find module './nueva-orden-form'`.

- [ ] **Step 3: Implement `NuevaOrdenForm`**

Create `src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { createOrdenAction, type OrdenFormState } from "@/app/actions/orden-actions";
import type { Usuario } from "@/generated/prisma-tenant";

const initialState: OrdenFormState = { error: null, success: false };

export function NuevaOrdenForm({
  clienteId,
  vehiculoId,
  tecnicos,
}: {
  clienteId: string;
  vehiculoId: string;
  tecnicos: Usuario[];
}) {
  const createForVehiculo = createOrdenAction.bind(null, clienteId, vehiculoId);
  const [state, formAction, isPending] = useActionState(createForVehiculo, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="kilometrajeIngreso">Kilometraje de ingreso</label>
      <input id="kilometrajeIngreso" name="kilometrajeIngreso" type="number" min="0" />

      <label htmlFor="sintomas">Síntomas reportados</label>
      <textarea id="sintomas" name="sintomas" />

      <label htmlFor="mecanicoId">Mecánico asignado</label>
      <select id="mecanicoId" name="mecanicoId" defaultValue="">
        <option value="">Sin asignar</option>
        {tecnicos.map((tecnico) => (
          <option key={tecnico.id} value={tecnico.id}>
            {tecnico.nombre}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear orden"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Orden creada</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/\(dashboard\)/vehiculos/\[id\]/nueva-orden-form.test.tsx`
Expected: PASS — all tests pass.

- [ ] **Step 5: Wire the form and the vehicle's order list into the Vehículo detail page**

Edit `src/app/(dashboard)/vehiculos/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getVehiculo } from "@/app/actions/vehiculo-actions";
import { listHistorial } from "@/app/actions/historial-actions";
import { listOrdenesByVehiculo, listTecnicos } from "@/app/actions/orden-actions";
import { NuevaEntradaForm } from "./nueva-entrada-form";
import { NuevaOrdenForm } from "./nueva-orden-form";

export default async function VehiculoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehiculo = await getVehiculo(id);

  if (!vehiculo) {
    notFound();
  }

  const [historial, ordenes, tecnicos] = await Promise.all([
    listHistorial(id),
    listOrdenesByVehiculo(id),
    listTecnicos(),
  ]);

  return (
    <main>
      <h1>
        {vehiculo.placa} — {vehiculo.marca} {vehiculo.modelo}
      </h1>
      <p>Año: {vehiculo.anio ?? "—"}</p>

      <h2>Órdenes de trabajo</h2>
      <NuevaOrdenForm clienteId={vehiculo.clienteId} vehiculoId={vehiculo.id} tecnicos={tecnicos} />
      <ul>
        {ordenes.map((orden) => (
          <li key={orden.id}>
            <Link href={`/ordenes/${orden.id}`}>
              {new Date(orden.createdAt).toLocaleDateString()} — {orden.estado}
            </Link>
          </li>
        ))}
      </ul>

      <h2>Historial</h2>
      <NuevaEntradaForm vehiculoId={vehiculo.id} />
      <ul>
        {historial.map((entrada) => (
          <li key={entrada.id}>
            {new Date(entrada.fecha).toLocaleDateString()} — {entrada.descripcion} —{" "}
            {entrada.autor?.nombre ?? "Desconocido"}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all tests pass, including the new `nueva-orden-form.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.tsx" "src/app/(dashboard)/vehiculos/[id]/nueva-orden-form.test.tsx" "src/app/(dashboard)/vehiculos/[id]/page.tsx"
git commit -m "task 8: add nueva orden form, wire into vehiculo detail page"
git push
```

---

### Task 9: UI — Orden detail page (info, cambiar estado, items, mano de obra)

**Files:**
- Create: `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx`
- Create: `src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx`
- Create: `src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.test.tsx`
- Create: `src/app/(dashboard)/ordenes/[id]/page.tsx`

**Interfaces:**
- Consumes: `getOrden` (Task 3), `updateEstadoOrdenAction` (Task 4), `addItemOrdenAction` (Task 5), `addManoDeObraAction` (Task 6), `ESTADO_ORDEN_TRANSITIONS` (Task 2).
- Produces: the `/ordenes/[id]` route — consumed by Task 13 (DVI forms mount on this same page) and Task 14's e2e test.

Note on scope: this task wires **add** actions into the UI only. `deleteItemOrdenAction`/`deleteManoDeObraAction` (Task 5/6) stay unit-tested but not yet wired to a UI button — this matches the existing precedent in this codebase, where `deleteClienteAction`/`deleteVehiculoAction` are implemented and tested (Fase 1) but have no UI caller yet either.

- [ ] **Step 1: Write the failing test for `CambiarEstadoForm`**

Create `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateEstadoOrdenAction = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  updateEstadoOrdenAction: (...args: unknown[]) => mockUpdateEstadoOrdenAction(...args),
}));

import { CambiarEstadoForm } from "./cambiar-estado-form";

describe("CambiarEstadoForm", () => {
  beforeEach(() => {
    mockUpdateEstadoOrdenAction.mockReset();
    mockUpdateEstadoOrdenAction.mockResolvedValue({ error: null });
  });

  it("offers only the valid next states for BORRADOR (EN_PROCESO, ANULADA)", () => {
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    expect(screen.getByRole("option", { name: "En proceso" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Anulada" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Terminada" })).not.toBeInTheDocument();
  });

  it("renders no form and a static message for a terminal state (ENTREGADA)", () => {
    render(<CambiarEstadoForm ordenId="o1" estadoActual="ENTREGADA" />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/Entregada/)).toBeInTheDocument();
  });

  it("submits the selected estado and shows the error when the action returns one", async () => {
    mockUpdateEstadoOrdenAction.mockResolvedValue({ error: "No se puede cambiar de BORRADOR a TERMINADA" });
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede cambiar de BORRADOR a TERMINADA");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/cambiar-estado-form.test.tsx`
Expected: FAIL — `Cannot find module './cambiar-estado-form'`.

- [ ] **Step 3: Implement `CambiarEstadoForm`**

Create `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { updateEstadoOrdenAction, type EstadoFormState } from "@/app/actions/orden-actions";
import { ESTADO_ORDEN_TRANSITIONS } from "@/lib/orden/estado-transitions";
import type { EstadoOrden } from "@/generated/prisma-tenant";

const initialState: EstadoFormState = { error: null };

const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

export function CambiarEstadoForm({ ordenId, estadoActual }: { ordenId: string; estadoActual: EstadoOrden }) {
  const changeEstado = updateEstadoOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(changeEstado, initialState);
  const opciones = ESTADO_ORDEN_TRANSITIONS[estadoActual];

  if (opciones.length === 0) {
    return <p>Estado actual: {ESTADO_LABELS[estadoActual]} (sin más transiciones posibles)</p>;
  }

  return (
    <form action={formAction}>
      <label htmlFor="estado">Cambiar estado a</label>
      <select id="estado" name="estado" defaultValue={opciones[0]}>
        {opciones.map((estado) => (
          <option key={estado} value={estado}>
            {ESTADO_LABELS[estado]}
          </option>
        ))}
      </select>

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Cambiar estado"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/cambiar-estado-form.test.tsx`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Write the failing test for `AgregarItemForm`**

Create `src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddItemOrdenAction = vi.fn();
vi.mock("@/app/actions/item-orden-actions", () => ({
  addItemOrdenAction: (...args: unknown[]) => mockAddItemOrdenAction(...args),
}));

import { AgregarItemForm } from "./agregar-item-form";

describe("AgregarItemForm", () => {
  beforeEach(() => {
    mockAddItemOrdenAction.mockReset();
    mockAddItemOrdenAction.mockResolvedValue({ error: null, success: true });
  });

  it("shows a success message after a successful submit", async () => {
    render(<AgregarItemForm ordenId="o1" />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem agregado");
  });

  it("shows the error message when the action returns one", async () => {
    mockAddItemOrdenAction.mockResolvedValue({ error: "La cantidad debe ser al menos 1", success: false });
    render(<AgregarItemForm ordenId="o1" />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La cantidad debe ser al menos 1");
  });
});
```

- [ ] **Step 6: Run it to confirm it fails, then implement `AgregarItemForm`**

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/agregar-item-form.test.tsx`
Expected: FAIL — `Cannot find module './agregar-item-form'`.

Create `src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { addItemOrdenAction, type ItemOrdenFormState } from "@/app/actions/item-orden-actions";

const initialState: ItemOrdenFormState = { error: null, success: false };

export function AgregarItemForm({ ordenId }: { ordenId: string }) {
  const addItem = addItemOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="itemDescripcion">Descripción</label>
      <input id="itemDescripcion" name="descripcion" required />

      <label htmlFor="itemCantidad">Cantidad</label>
      <input id="itemCantidad" name="cantidad" type="number" min="1" required />

      <label htmlFor="itemPrecioUnitario">Precio unitario</label>
      <input id="itemPrecioUnitario" name="precioUnitario" type="number" min="0" step="0.01" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar ítem"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Ítem agregado</p> : null}
    </form>
  );
}
```

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/agregar-item-form.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 7: Write the failing test for `AgregarManoObraForm`, then implement it**

Create `src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddManoDeObraAction = vi.fn();
vi.mock("@/app/actions/mano-de-obra-actions", () => ({
  addManoDeObraAction: (...args: unknown[]) => mockAddManoDeObraAction(...args),
}));

import { AgregarManoObraForm } from "./agregar-mano-obra-form";

describe("AgregarManoObraForm", () => {
  beforeEach(() => {
    mockAddManoDeObraAction.mockReset();
    mockAddManoDeObraAction.mockResolvedValue({ error: null, success: true });
  });

  it("shows a success message after a successful submit", async () => {
    render(<AgregarManoObraForm ordenId="o1" />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Cambio de pastillas de freno");
    await userEvent.type(screen.getByLabelText("Horas"), "1.5");
    await userEvent.type(screen.getByLabelText("Precio por hora"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Agregar mano de obra" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Mano de obra agregada");
  });

  it("shows the error message when the action returns one", async () => {
    mockAddManoDeObraAction.mockResolvedValue({ error: "Las horas deben ser mayores a 0", success: false });
    render(<AgregarManoObraForm ordenId="o1" />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar mano de obra" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Las horas deben ser mayores a 0");
  });
});
```

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/agregar-mano-obra-form.test.tsx`
Expected: FAIL — `Cannot find module './agregar-mano-obra-form'`.

Create `src/app/(dashboard)/ordenes/[id]/agregar-mano-obra-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { addManoDeObraAction, type ManoDeObraFormState } from "@/app/actions/mano-de-obra-actions";

const initialState: ManoDeObraFormState = { error: null, success: false };

export function AgregarManoObraForm({ ordenId }: { ordenId: string }) {
  const addManoObra = addManoDeObraAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addManoObra, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="manoObraDescripcion">Descripción</label>
      <input id="manoObraDescripcion" name="descripcion" required />

      <label htmlFor="manoObraHoras">Horas</label>
      <input id="manoObraHoras" name="horas" type="number" min="0.1" step="0.1" required />

      <label htmlFor="manoObraPrecioHora">Precio por hora</label>
      <input id="manoObraPrecioHora" name="precioHora" type="number" min="0" step="0.01" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar mano de obra"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Mano de obra agregada</p> : null}
    </form>
  );
}
```

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/agregar-mano-obra-form.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 8: Compose the Orden detail page**

Create `src/app/(dashboard)/ordenes/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getOrden } from "@/app/actions/orden-actions";
import { CambiarEstadoForm } from "./cambiar-estado-form";
import { AgregarItemForm } from "./agregar-item-form";
import { AgregarManoObraForm } from "./agregar-mano-obra-form";

export default async function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orden = await getOrden(id);

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
      <AgregarItemForm ordenId={orden.id} />
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
    </main>
  );
}
```

- [ ] **Step 9: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all tests pass, including the three new form tests from this task.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]"
git commit -m "task 9: add orden detail page with cambiar-estado, items, and mano de obra forms"
git push
```

---

### Task 10: Prisma schema — `Dvi`, `DviFoto`, checklist constants

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/<timestamp>_add_dvi/` (generated)
- Create: `src/lib/dvi/checklist-items.ts`
- Test: `src/lib/dvi/checklist-items.test.ts`

**Interfaces:**
- Consumes: `OrdenTrabajo`, `Usuario` models (Task 1).
- Produces: `Dvi`, `DviFoto` Prisma models, `DviFotoMomento` enum (`ANTES | DESPUES`) — consumed by Task 12's DVI actions and Task 13's UI. `DVI_CHECKLIST_ITEMS` constant, `DviChecklistKey`/`DviChecklistStatus`/`DviChecklist` types (`@/lib/dvi/checklist-items`) — consumed by Task 12 and Task 13.

Note: the model is named `Dvi` (not `DVI`) deliberately — Prisma's client-property naming only lowercases a model name's first letter, so a model literally named `DVI` would generate the awkward `tenantDb.dVI` accessor. `Dvi` generates the clean `tenantDb.dvi`.

- [ ] **Step 1: Add the Dvi/DviFoto models to the tenant schema template**

Edit `prisma/tenant/schema.prisma` — add the `dvi Dvi?` relation field back to `model OrdenTrabajo` (it was intentionally omitted in Task 1 to keep that migration self-contained):

```prisma
model OrdenTrabajo {
  id                 String       @id @default(cuid())
  estado             EstadoOrden  @default(BORRADOR)
  clienteId          String       @map("cliente_id")
  cliente            Cliente      @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  vehiculoId         String       @map("vehiculo_id")
  vehiculo           Vehiculo     @relation(fields: [vehiculoId], references: [id], onDelete: Restrict)
  sedeId             String       @map("sede_id")
  sede               Sede         @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  mecanicoId         String?      @map("mecanico_id")
  mecanico           Usuario?     @relation("OrdenMecanico", fields: [mecanicoId], references: [id], onDelete: SetNull)
  creadoPorId        String       @map("creado_por_id")
  creadoPor          Usuario      @relation("OrdenCreadoPor", fields: [creadoPorId], references: [id], onDelete: Restrict)
  kilometrajeIngreso Int?         @map("kilometraje_ingreso")
  sintomas           String?
  items              ItemOrden[]
  manoDeObra         ManoDeObra[]
  dvi                Dvi?
  entregadaAt        DateTime?    @map("entregada_at")
  anuladaAt          DateTime?    @map("anulada_at")
  createdAt          DateTime     @default(now()) @map("created_at")
  updatedAt          DateTime     @updatedAt @map("updated_at")

  @@map("ordenes_trabajo")
  @@index([clienteId])
  @@index([vehiculoId])
  @@index([sedeId])
  @@index([estado])
}
```

Add a `dviRealizados` back-relation to `model Usuario` (after `ordenesAsignadas`):

```prisma
  ordenesAsignadas  OrdenTrabajo[]      @relation("OrdenMecanico")
  dviRealizados     Dvi[]
```

Append at the end of the file:

```prisma
enum DviFotoMomento {
  ANTES
  DESPUES
}

model Dvi {
  id          String        @id @default(cuid())
  ordenId     String        @unique @map("orden_id")
  orden       OrdenTrabajo  @relation(fields: [ordenId], references: [id], onDelete: Cascade)
  checklist   Json          @default("{}")
  fotos       DviFoto[]
  creadoPorId String        @map("creado_por_id")
  creadoPor   Usuario       @relation(fields: [creadoPorId], references: [id], onDelete: Restrict)
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  @@map("dvi")
}

model DviFoto {
  id        String         @id @default(cuid())
  dviId     String         @map("dvi_id")
  dvi       Dvi            @relation(fields: [dviId], references: [id], onDelete: Cascade)
  momento   DviFotoMomento
  url       String
  createdAt DateTime       @default(now()) @map("created_at")

  @@map("dvi_fotos")
  @@index([dviId])
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name add_dvi`
Expected: creates `prisma/tenant/migrations/<timestamp>_add_dvi/migration.sql`, applies it, regenerates the Prisma client.

- [ ] **Step 3: Write the failing test for the checklist constants**

Create `src/lib/dvi/checklist-items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DVI_CHECKLIST_ITEMS } from "./checklist-items";

describe("DVI_CHECKLIST_ITEMS", () => {
  it("has a unique, non-empty key and label for every item", () => {
    expect(DVI_CHECKLIST_ITEMS.length).toBeGreaterThan(0);

    const keys = DVI_CHECKLIST_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);

    for (const item of DVI_CHECKLIST_ITEMS) {
      expect(item.key.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("includes the frenos (brakes) checklist item, a legally required inspection point", () => {
    expect(DVI_CHECKLIST_ITEMS.some((item) => item.key === "frenos")).toBe(true);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run src/lib/dvi/checklist-items.test.ts`
Expected: FAIL — `Cannot find module './checklist-items'`.

- [ ] **Step 5: Implement the checklist constants**

Create `src/lib/dvi/checklist-items.ts`:

```ts
export const DVI_CHECKLIST_ITEMS = [
  { key: "luces", label: "Luces (altas, bajas, direccionales)" },
  { key: "frenos", label: "Frenos" },
  { key: "llantas", label: "Llantas y presión" },
  { key: "niveles_fluidos", label: "Niveles de fluidos (aceite, refrigerante, frenos)" },
  { key: "bateria", label: "Batería" },
  { key: "suspension", label: "Suspensión" },
  { key: "correas_mangueras", label: "Correas y mangueras" },
  { key: "limpiaparabrisas", label: "Limpiaparabrisas" },
] as const;

export type DviChecklistKey = (typeof DVI_CHECKLIST_ITEMS)[number]["key"];

export const DVI_CHECKLIST_STATUSES = ["OK", "ATENCION", "CRITICO", "NO_APLICA"] as const;

export type DviChecklistStatus = (typeof DVI_CHECKLIST_STATUSES)[number];

export type DviChecklist = Partial<Record<DviChecklistKey, DviChecklistStatus>>;
```

- [ ] **Step 6: Run the test again to confirm it passes**

Run: `npx vitest run src/lib/dvi/checklist-items.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 7: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations src/lib/dvi/checklist-items.ts src/lib/dvi/checklist-items.test.ts
git commit -m "task 10: add Dvi/DviFoto models and checklist constants"
git push
```

---

### Task 11: Local file storage + auth-gated upload route handler

**Files:**
- Create: `src/lib/storage/local-file-storage.ts`
- Test: `src/lib/storage/local-file-storage.test.ts`
- Create: `src/app/api/uploads/[...path]/route.ts`
- Modify: `next.config.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: none new (Node `fs`/`path`/`crypto`, `requireSession` from `@/lib/auth/guards`).
- Produces: `ALLOWED_UPLOAD_MIME_TYPES`, `MAX_UPLOAD_SIZE_BYTES`, `getUploadsRoot()`, `saveDviFoto(tenantSchema, dviId, file): Promise<{ relativePath, url }>` (`@/lib/storage/local-file-storage`) — consumed by Task 12's `addDviFotoAction`. The `/api/uploads/[...path]` `GET` handler — consumed by Task 13's `<img>` tags and Task 14's e2e test.

- [ ] **Step 1: Write the failing tests for `saveDviFoto`**

Create `src/lib/storage/local-file-storage.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveDviFoto } from "./local-file-storage";

let uploadsDir: string;
const originalUploadsDir = process.env.UPLOADS_DIR;

beforeEach(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), "torqueflow-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
});

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
  process.env.UPLOADS_DIR = originalUploadsDir;
});

function makeFile(bytes: Uint8Array, type: string, name = "foto.jpg"): File {
  return new File([bytes], name, { type });
}

describe("saveDviFoto", () => {
  it("writes the file under <UPLOADS_DIR>/<tenantSchema>/dvi/<dviId>/ and returns a matching url", async () => {
    const file = makeFile(new Uint8Array([1, 2, 3]), "image/jpeg");

    const saved = await saveDviFoto("taller_perez", "dvi1", file);

    expect(saved.url).toMatch(/^\/api\/uploads\/taller_perez\/dvi\/dvi1\/[^/]+\.jpg$/);
    const writtenPath = path.join(uploadsDir, saved.relativePath);
    const contents = await readFile(writtenPath);
    expect(Array.from(contents)).toEqual([1, 2, 3]);
  });

  it("rejects a disallowed mime type", async () => {
    const file = makeFile(new Uint8Array([1]), "application/pdf", "doc.pdf");

    await expect(saveDviFoto("taller_perez", "dvi1", file)).rejects.toThrow(/no permitido/);
  });

  it("rejects a file over the 5 MB limit", async () => {
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    const file = makeFile(oversized, "image/png", "big.png");

    await expect(saveDviFoto("taller_perez", "dvi1", file)).rejects.toThrow(/tamaño máximo/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/storage/local-file-storage.test.ts`
Expected: FAIL — `Cannot find module './local-file-storage'`.

- [ ] **Step 3: Implement `local-file-storage.ts`**

Create `src/lib/storage/local-file-storage.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const ALLOWED_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

type AllowedMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

const MIME_EXTENSIONS: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function getUploadsRoot(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
}

function isAllowedMimeType(type: string): type is AllowedMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(type);
}

export interface SavedUpload {
  relativePath: string;
  url: string;
}

export async function saveDviFoto(tenantSchema: string, dviId: string, file: File): Promise<SavedUpload> {
  if (!isAllowedMimeType(file.type)) {
    throw new Error(`Tipo de archivo no permitido: ${file.type}`);
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (5 MB)");
  }

  const extension = MIME_EXTENSIONS[file.type];
  const filename = `${randomUUID()}.${extension}`;
  const relativeSegments = [tenantSchema, "dvi", dviId, filename];
  const absoluteDir = path.join(getUploadsRoot(), tenantSchema, "dvi", dviId);

  await mkdir(absoluteDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(absoluteDir, filename), buffer);

  const relativePath = relativeSegments.join("/");
  return { relativePath, url: `/api/uploads/${relativePath}` };
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/lib/storage/local-file-storage.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Add the authenticated upload Route Handler**

Create `src/app/api/uploads/[...path]/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireSession } from "@/lib/auth/guards";
import { getUploadsRoot } from "@/lib/storage/local-file-storage";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const session = await requireSession();
  const { path: segments } = await params;

  if (segments[0] !== session.user.tenantSchema) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const uploadsRoot = getUploadsRoot();
  const tenantRoot = path.join(uploadsRoot, session.user.tenantSchema);
  const requestedPath = path.join(uploadsRoot, ...segments);

  if (!requestedPath.startsWith(tenantRoot)) {
    return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
  }

  try {
    const file = await readFile(requestedPath);
    const extension = path.extname(requestedPath).toLowerCase();
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": contentType } });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
}
```

No dedicated unit test for this handler — this codebase has no precedent for testing Route Handlers in isolation (`src/app/api/auth/[...nextauth]/route.ts` has none either); it is exercised end-to-end by Task 14's e2e test (upload a real photo, then load it back).

- [ ] **Step 6: Raise the Server Actions body size limit for photo uploads**

Edit `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 7: Gitignore the local uploads directory**

Edit `.gitignore` — append:

```
/uploads
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/storage/local-file-storage.ts src/lib/storage/local-file-storage.test.ts "src/app/api/uploads/[...path]/route.ts" next.config.ts .gitignore
git commit -m "task 11: add local DVI photo storage and auth-gated upload route handler"
git push
```

---

### Task 12: `dvi-actions.ts` — checklist upsert + foto add/delete

**Files:**
- Create: `src/lib/validation/dvi.ts`
- Create: `src/app/actions/dvi-actions.ts`
- Test: `src/app/actions/dvi-actions.test.ts`

**Interfaces:**
- Consumes: `DVI_CHECKLIST_ITEMS`, `DviChecklist` (`@/lib/dvi/checklist-items`, Task 10), `saveDviFoto` (`@/lib/storage/local-file-storage`, Task 11).
- Produces: `dviChecklistStatusSchema`, `dviFotoMomentoSchema` (`@/lib/validation/dvi`); `DviFormState`, `updateDviChecklistAction(ordenId, prevState, formData)`, `addDviFotoAction(ordenId, prevState, formData)`, `deleteDviFotoAction(id, ordenId)` (`@/app/actions/dvi-actions`) — consumed by Task 13's UI.

- [ ] **Step 1: Add the DVI-specific Zod schemas**

Create `src/lib/validation/dvi.ts`:

```ts
import { z } from "zod";
import { DVI_CHECKLIST_STATUSES } from "@/lib/dvi/checklist-items";

export const dviChecklistStatusSchema = z.enum(DVI_CHECKLIST_STATUSES);
export const dviFotoMomentoSchema = z.enum(["ANTES", "DESPUES"]);
```

- [ ] **Step 2: Write the failing tests for `dvi-actions.ts`**

Create `src/app/actions/dvi-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpsert = vi.fn();
const mockDviFindUnique = vi.fn();
const mockFotoCreate = vi.fn();
const mockFotoDelete = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    dvi: { upsert: mockUpsert, findUnique: mockDviFindUnique },
    dviFoto: { create: mockFotoCreate, delete: mockFotoDelete },
  }),
}));

const mockSaveDviFoto = vi.fn();
vi.mock("@/lib/storage/local-file-storage", () => ({
  saveDviFoto: (...args: unknown[]) => mockSaveDviFoto(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  updateDviChecklistAction,
  addDviFotoAction,
  deleteDviFotoAction,
  type DviFormState,
} from "./dvi-actions";

const initialState: DviFormState = { error: null, success: false };

describe("updateDviChecklistAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez" } });
    mockUpsert.mockReset();
  });

  it("upserts only the recognized checklist keys with valid statuses", async () => {
    mockUpsert.mockResolvedValue({ id: "d1" });
    const formData = new FormData();
    formData.set("frenos", "OK");
    formData.set("luces", "ATENCION");
    formData.set("not_a_real_key", "OK");
    formData.set("bateria", "not_a_real_status");

    const result = await updateDviChecklistAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ordenId: "o1" },
      create: { ordenId: "o1", checklist: { frenos: "OK", luces: "ATENCION" }, creadoPorId: "u1" },
      update: { checklist: { frenos: "OK", luces: "ATENCION" } },
    });
  });
});

describe("addDviFotoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez" } });
    mockDviFindUnique.mockReset();
    mockFotoCreate.mockReset();
    mockSaveDviFoto.mockReset();
  });

  it("returns an error when no checklist (Dvi record) exists yet", async () => {
    mockDviFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("momento", "ANTES");
    formData.set("foto", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    const result = await addDviFotoAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Primero guarda el checklist de inspección");
    expect(mockSaveDviFoto).not.toHaveBeenCalled();
  });

  it("saves the file and creates the DviFoto row on valid input", async () => {
    mockDviFindUnique.mockResolvedValue({ id: "d1" });
    mockSaveDviFoto.mockResolvedValue({ url: "/api/uploads/taller_perez/dvi/d1/abc.jpg" });
    mockFotoCreate.mockResolvedValue({ id: "f1" });
    const formData = new FormData();
    formData.set("momento", "DESPUES");
    formData.set("foto", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    const result = await addDviFotoAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockFotoCreate).toHaveBeenCalledWith({
      data: { dviId: "d1", momento: "DESPUES", url: "/api/uploads/taller_perez/dvi/d1/abc.jpg" },
    });
  });

  it("propagates the storage error message when saveDviFoto rejects", async () => {
    mockDviFindUnique.mockResolvedValue({ id: "d1" });
    mockSaveDviFoto.mockRejectedValue(new Error("Tipo de archivo no permitido: application/pdf"));
    const formData = new FormData();
    formData.set("momento", "ANTES");
    formData.set("foto", new File(["x"], "doc.pdf", { type: "application/pdf" }));

    const result = await addDviFotoAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Tipo de archivo no permitido: application/pdf");
    expect(mockFotoCreate).not.toHaveBeenCalled();
  });
});

describe("deleteDviFotoAction", () => {
  it("requires ADMIN/RECEPCION (not TECNICO) to delete a foto", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockFotoDelete.mockReset();

    await deleteDviFotoAction("f1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockFotoDelete).toHaveBeenCalledWith({ where: { id: "f1" } });
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/dvi-actions.test.ts`
Expected: FAIL — `Cannot find module './dvi-actions'`.

- [ ] **Step 4: Implement `dvi-actions.ts`**

Create `src/app/actions/dvi-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { saveDviFoto } from "@/lib/storage/local-file-storage";
import { DVI_CHECKLIST_ITEMS, type DviChecklist } from "@/lib/dvi/checklist-items";
import { dviChecklistStatusSchema, dviFotoMomentoSchema } from "@/lib/validation/dvi";

export interface DviFormState {
  error: string | null;
  success: boolean;
}

export async function updateDviChecklistAction(
  ordenId: string,
  prevState: DviFormState,
  formData: FormData,
): Promise<DviFormState> {
  const checklist: DviChecklist = {};
  for (const item of DVI_CHECKLIST_ITEMS) {
    const parsed = dviChecklistStatusSchema.safeParse(formData.get(item.key));
    if (parsed.success) {
      checklist[item.key] = parsed.data;
    }
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    await tenantDb.dvi.upsert({
      where: { ordenId },
      create: { ordenId, checklist, creadoPorId: session.user.id },
      update: { checklist },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al guardar el checklist"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function addDviFotoAction(
  ordenId: string,
  prevState: DviFormState,
  formData: FormData,
): Promise<DviFormState> {
  const momentoParsed = dviFotoMomentoSchema.safeParse(formData.get("momento"));
  const file = formData.get("foto");

  if (!momentoParsed.success) {
    return { error: "Selecciona si la foto es antes o después", success: false };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona un archivo de imagen", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const dvi = await tenantDb.dvi.findUnique({ where: { ordenId } });
  if (!dvi) {
    return { error: "Primero guarda el checklist de inspección", success: false };
  }

  let saved: Awaited<ReturnType<typeof saveDviFoto>>;
  try {
    saved = await saveDviFoto(session.user.tenantSchema, dvi.id, file);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al guardar la foto", success: false };
  }

  try {
    await tenantDb.dviFoto.create({
      data: { dviId: dvi.id, momento: momentoParsed.data, url: saved.url },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar la foto"), success: false };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return { error: null, success: true };
}

export async function deleteDviFotoAction(id: string, ordenId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  await tenantDb.dviFoto.delete({ where: { id } });
  revalidatePath(`/ordenes/${ordenId}`);
}
```

- [ ] **Step 5: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/dvi-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/dvi.ts src/app/actions/dvi-actions.ts src/app/actions/dvi-actions.test.ts
git commit -m "task 12: add dvi-actions checklist upsert and foto add/delete"
git push
```

---

### Task 13: UI — DVI checklist form + foto upload form on the Orden detail page

**Files:**
- Create: `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx`
- Create: `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.test.tsx`
- Modify: `src/app/actions/orden-actions.ts`
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx`

**Interfaces:**
- Consumes: `updateDviChecklistAction`, `addDviFotoAction` (`@/app/actions/dvi-actions`, Task 12), `DVI_CHECKLIST_ITEMS`, `DviChecklist` (`@/lib/dvi/checklist-items`, Task 10).
- Produces: the DVI section on `/ordenes/[id]` — consumed by Task 14's e2e test.

Note: Task 3's `ORDEN_DETAIL_INCLUDE` deliberately did not include `dvi` (the `Dvi` model didn't exist until Task 10, and Task 3 had to compile on its own). This task adds it now, in Step 1, since this is the first task that actually reads `orden.dvi`.

- [ ] **Step 1: Add `dvi` to `ORDEN_DETAIL_INCLUDE`**

Edit `src/app/actions/orden-actions.ts` — change:

```ts
const ORDEN_DETAIL_INCLUDE = {
  cliente: true,
  vehiculo: true,
  sede: true,
  mecanico: true,
  items: true,
  manoDeObra: true,
} satisfies Prisma.OrdenTrabajoInclude;
```

to:

```ts
const ORDEN_DETAIL_INCLUDE = {
  cliente: true,
  vehiculo: true,
  sede: true,
  mecanico: true,
  items: true,
  manoDeObra: true,
  dvi: { include: { fotos: true } },
} satisfies Prisma.OrdenTrabajoInclude;
```

Run: `npx vitest run src/app/actions/orden-actions.test.ts`
Expected: PASS — unchanged (the mocked `ordenTrabajo.findMany`/`findUnique` don't assert on `include`'s exact shape beyond what Task 3/4's tests already check with `expect.objectContaining`).

- [ ] **Step 2: Write the failing test for `DviChecklistForm`**

Create `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateDviChecklistAction = vi.fn();
vi.mock("@/app/actions/dvi-actions", () => ({
  updateDviChecklistAction: (...args: unknown[]) => mockUpdateDviChecklistAction(...args),
}));

import { DviChecklistForm } from "./dvi-checklist-form";

describe("DviChecklistForm", () => {
  beforeEach(() => {
    mockUpdateDviChecklistAction.mockReset();
    mockUpdateDviChecklistAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders one select per checklist item, defaulting to the saved status", () => {
    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "CRITICO" }} />);

    expect(screen.getByLabelText("Frenos")).toHaveValue("CRITICO");
    expect(screen.getByLabelText("Luces (altas, bajas, direccionales)")).toHaveValue("OK");
  });

  it("shows a success message after a successful submit", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Checklist guardado");
  });
});
```

- [ ] **Step 3: Run it to confirm it fails, then implement `DviChecklistForm`**

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/dvi-checklist-form.test.tsx`
Expected: FAIL — `Cannot find module './dvi-checklist-form'`.

Create `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { updateDviChecklistAction, type DviFormState } from "@/app/actions/dvi-actions";
import { DVI_CHECKLIST_ITEMS, DVI_CHECKLIST_STATUSES, type DviChecklist } from "@/lib/dvi/checklist-items";

const initialState: DviFormState = { error: null, success: false };

const ESTADO_LABELS: Record<(typeof DVI_CHECKLIST_STATUSES)[number], string> = {
  OK: "OK",
  ATENCION: "Atención",
  CRITICO: "Crítico",
  NO_APLICA: "No aplica",
};

export function DviChecklistForm({ ordenId, checklist }: { ordenId: string; checklist: DviChecklist | null }) {
  const current = checklist ?? {};
  const saveChecklist = updateDviChecklistAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(saveChecklist, initialState);

  return (
    <form action={formAction}>
      {DVI_CHECKLIST_ITEMS.map((item) => (
        <div key={item.key}>
          <label htmlFor={item.key}>{item.label}</label>
          <select id={item.key} name={item.key} defaultValue={current[item.key] ?? "OK"}>
            {DVI_CHECKLIST_STATUSES.map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_LABELS[estado]}
              </option>
            ))}
          </select>
        </div>
      ))}

      <button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar checklist"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Checklist guardado</p> : null}
    </form>
  );
}
```

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/dvi-checklist-form.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 4: Write the failing test for `DviFotoForm`, then implement it**

Create `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddDviFotoAction = vi.fn();
vi.mock("@/app/actions/dvi-actions", () => ({
  addDviFotoAction: (...args: unknown[]) => mockAddDviFotoAction(...args),
}));

import { DviFotoForm } from "./dvi-foto-form";

describe("DviFotoForm", () => {
  beforeEach(() => {
    mockAddDviFotoAction.mockReset();
    mockAddDviFotoAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the momento select and file input", () => {
    render(<DviFotoForm ordenId="o1" />);

    expect(screen.getByLabelText("Momento")).toBeInTheDocument();
    expect(screen.getByLabelText("Foto")).toBeInTheDocument();
  });

  it("shows the error message when the action returns one", async () => {
    mockAddDviFotoAction.mockResolvedValue({ error: "Primero guarda el checklist de inspección", success: false });
    render(<DviFotoForm ordenId="o1" />);

    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Foto"), file);
    await userEvent.click(screen.getByRole("button", { name: "Subir foto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Primero guarda el checklist de inspección");
  });
});
```

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/dvi-foto-form.test.tsx`
Expected: FAIL — `Cannot find module './dvi-foto-form'`.

Create `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { addDviFotoAction, type DviFormState } from "@/app/actions/dvi-actions";

const initialState: DviFormState = { error: null, success: false };

export function DviFotoForm({ ordenId }: { ordenId: string }) {
  const addFoto = addDviFotoAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addFoto, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="momento">Momento</label>
      <select id="momento" name="momento" defaultValue="ANTES">
        <option value="ANTES">Antes</option>
        <option value="DESPUES">Después</option>
      </select>

      <label htmlFor="foto">Foto</label>
      <input id="foto" name="foto" type="file" accept="image/jpeg,image/png,image/webp" required />

      <button type="submit" disabled={isPending}>
        {isPending ? "Subiendo..." : "Subir foto"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Foto subida</p> : null}
    </form>
  );
}
```

Run: `npx vitest run src/app/\(dashboard\)/ordenes/\[id\]/dvi-foto-form.test.tsx`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Mount the DVI section on the Orden detail page**

Edit `src/app/(dashboard)/ordenes/[id]/page.tsx` — add the imports and the new section after the "Mano de obra" section:

```tsx
import { notFound } from "next/navigation";
import { getOrden } from "@/app/actions/orden-actions";
import { CambiarEstadoForm } from "./cambiar-estado-form";
import { AgregarItemForm } from "./agregar-item-form";
import { AgregarManoObraForm } from "./agregar-mano-obra-form";
import { DviChecklistForm } from "./dvi-checklist-form";
import { DviFotoForm } from "./dvi-foto-form";
import type { DviChecklist } from "@/lib/dvi/checklist-items";

export default async function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orden = await getOrden(id);

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
      <AgregarItemForm ordenId={orden.id} />
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

- [ ] **Step 6: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — all tests pass, including the two new DVI form tests.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-foto-form.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-foto-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/page.tsx"
git commit -m "task 13: add DVI checklist and foto upload forms to orden detail page"
git push
```

---

### Task 14: E2E — extend the smoke test through Orden de trabajo + DVI

**Files:**
- Modify: `e2e/tenant-flow.spec.ts`

**Interfaces:**
- Consumes: every UI surface from Tasks 7-13 (`/ordenes`, the Vehículo detail page's "Nueva orden" form, the Orden detail page's estado/items/mano de obra/DVI forms).
- Produces: end-to-end confidence that the whole Fase 2 flow works against a real provisioned tenant and a real Postgres schema, extending Fase 1's existing smoke test rather than duplicating its login/cliente/vehículo setup in a second file.

- [ ] **Step 1: Extend the existing smoke test**

Edit `e2e/tenant-flow.spec.ts` — rename the test and append the new steps after the existing Historial assertion:

```ts
import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

test.use({ baseURL: "http://taller-e2e-smoke.localhost:3000" });

// A minimal valid 1x1 transparent PNG, used to exercise the DVI foto upload
// without committing a binary fixture file to the repo.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("login through Orden de trabajo terminada y entregada, end to end", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/clientes$/);

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
  await expect(page.getByRole("status")).toHaveText("Orden creada");

  await page.getByRole("link", { name: /EN_PROCESO|BORRADOR/ }).first().click();
  await expect(page.getByRole("heading", { name: /Orden — ABC123/ })).toBeVisible();

  await page.getByLabel("Descripción").first().fill("Pastillas de freno");
  await page.getByLabel("Cantidad").fill("4");
  await page.getByLabel("Precio unitario").fill("15");
  await page.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ítem agregado" })).toBeVisible();
  await expect(page.getByText("Pastillas de freno")).toBeVisible();

  await page.getByLabel("Descripción").nth(1).fill("Cambio de pastillas de freno");
  await page.getByLabel("Horas").fill("1.5");
  await page.getByLabel("Precio por hora").fill("20");
  await page.getByRole("button", { name: "Agregar mano de obra" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mano de obra agregada" })).toBeVisible();

  await page.getByLabel("Frenos").selectOption("CRITICO");
  await page.getByRole("button", { name: "Guardar checklist" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Checklist guardado" })).toBeVisible();

  await page.getByLabel("Momento").selectOption("ANTES");
  await page.getByLabel("Foto").setInputFiles({
    name: "antes.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  await page.getByRole("button", { name: "Subir foto" }).click();
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
});
```

- [ ] **Step 2: Run the e2e test to confirm it passes end to end**

Run: `npm run test:e2e`
Expected: PASS — 1 test passed, exercising login → cliente → vehículo → historial → orden creation → ítems → mano de obra → DVI checklist → DVI foto upload (through the real `/api/uploads` route handler) → estado transitions through `ENTREGADA`.

- [ ] **Step 3: Run the full unit suite one more time to confirm the whole phase is green**

Run: `npx vitest run`
Expected: PASS — every unit/integration test from Tasks 1-13 plus every Fase 1 test still passes.

- [ ] **Step 4: Commit**

```bash
git add e2e/tenant-flow.spec.ts
git commit -m "task 14: extend e2e smoke test through orden de trabajo and DVI"
git push
```

---

## After this plan

This plan does not include a final whole-branch review task — following the same pattern as Fase 1, run the `code-review` skill (or `/code-review ultra` for a deeper multi-agent pass) against the full diff once Task 14 is committed, before considering Fase 2 done. Known, deliberate simplifications to flag to a reviewer as accepted scope (not bugs) if raised:

- `deleteItemOrdenAction`/`deleteManoDeObraAction`/`deleteDviFotoAction` exist and are unit-tested but have no UI caller yet (same precedent as Fase 1's `deleteClienteAction`/`deleteVehiculoAction`).
- Deleting a `DviFoto` row does not delete the underlying file from disk (accepted storage-leak tradeoff for this phase; revisit if it matters before Fase 6).
- `ItemOrden.descripcion` is free text, not linked to an inventory model — Fase 3 introduces `Inventario`/`Repuesto` and will need a follow-up migration to link them.
- Every order in this phase is silently attached to the tenant's one auto-provisioned `Sede` — there is no sede selector anywhere in the UI. This is intentional per the design doc's Fase 6 plan, not a bug.

