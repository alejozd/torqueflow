# TorqueFlow Fase 4 (Facturación y Pagos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a shop generate an invoice (`Factura`) from a completed `OrdenTrabajo`, register one or more payments against it (`Pago`), track the outstanding balance (cuentas por cobrar), and — for the first time in this codebase — actually decrement `Repuesto.stockActual` for the catalog-linked parts consumed by that order.

**Architecture:** Same layered pattern as Fases 2/3: Prisma models in `prisma/tenant/schema.prisma` → pure logic in `src/lib/factura/` → Zod validation in `src/lib/validation/` → `"use server"` actions in `src/app/actions/` → React Server Component pages + small `"use client"` forms under `src/app/(dashboard)/facturas/`. `Factura` is generated from an existing `OrdenTrabajo`'s `items`/`manoDeObra` (no separate line-item entry UI — mirrors how DVI/items/mano de obra are all created from the parent order's detail page, not their own routes).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 6.19.3 (per-tenant Postgres schema), Zod 4.4.3, Vitest + React Testing Library, Playwright.

## Global Constraints

- IVA es una constante fija del 19% (`IVA_RATE = 0.19` en `src/lib/factura/totales.ts`), no editable por factura — decisión explícita del usuario 2026-08-20 (Colombia). Cambiarla en el futuro es editar una constante, no una migración.
- Una `OrdenTrabajo` admite como máximo una `Factura` (`Factura.ordenId` es `@unique`) — no se permite refacturar la misma orden. Enforced en el modelo de datos (constraint DB) y en la acción (chequeo explícito con mensaje amigable antes de tocar la DB).
- Una orden solo es facturable en estado `TERMINADA` o `ENTREGADA` (`assertOrdenFacturable`, mismo patrón que el `assertOrdenMutable` de Fase 2 pero en la dirección opuesta: ese bloquea mutaciones en estados terminales, este exige un estado terminal-de-trabajo para facturar).
- El descuento al facturar es un **monto fijo en moneda** (no porcentaje), opcional (blank = 0), y la acción rechaza explícitamente un descuento mayor al subtotal en vez de dejarlo producir un total negativo.
- Todo campo de dinero **obligatorio** (ej. `monto` de un pago) debe usar el helper `requiredMoney` (relocalizado a `src/lib/validation/money.ts` en la Tarea 2) para rechazar entradas vacías con un error, en vez de coercionarlas silenciosamente a `0` — esta clase exacta de bug ya se coló dos veces en este proyecto (Fase 3 Task 16 stock crash y la revisión final de Fase 3, commit `8c45b54`). Un campo de dinero **opcional** con default `0` (ej. `descuento`) NO usa `requiredMoney` — ese helper es solo para "obligatorio y blank es un error", no para "opcional y blank es el default".
- El stock de los `ItemOrden` con `repuestoId` (repuesto de catálogo) se descuenta realmente (`decrement` atómico dentro de la misma transacción que crea la `Factura`) al generar la factura — la Fase 3 dejó esto deliberadamente sin implementar (confirmado por su e2e: stock sin cambios durante todo el ciclo de vida de la orden). No se bloquea la generación de la factura si el stock quedara negativo (mismo criterio de "no hay reservas de inventario" que el resto del proyecto).
- El pago (`registrarPagoAction`) usa un `updateMany` condicionado (`where: { saldoPendiente: { gte: monto } }`) para decrementar el saldo de forma atómica a nivel de Postgres — cierra de raíz la clase de carrera (TOCTOU) que la revisión final de Fase 3 juzgó aceptable para un mismatch de bodega pero que aquí, tratándose de dinero, se cierra con la garantía más fuerte disponible sin necesidad de locks explícitos.
- No incluye en esta fase: anular/reversar una factura ya emitida, refacturación parcial, integraciones contables externas, cobro automático de suscripción del arriendo (YAGNI, ver diseño §6).
- Commits: `fase4-task N: descripción breve` (RULES.md), push inmediato al terminar cada tarea, máximo 1 intento de corrección por tarea.

---

### Task 1: Prisma schema — `EstadoFactura`/`MetodoPago` enums, `Factura`/`Pago` models

**Files:**
- Modify: `prisma/tenant/schema.prisma`
- Create: `prisma/tenant/migrations/<timestamp>_add_facturas_pagos/` (generated)

**Interfaces:**
- Consumes: `OrdenTrabajo`, `Cliente`, `Usuario` (Fase 1/2).
- Produces: `Factura`, `Pago`, `EstadoFactura`, `MetodoPago` Prisma models/enums — consumed by every later task in this plan.

- [ ] **Step 1: Add the back-relation fields**

Edit `prisma/tenant/schema.prisma`. In `model Usuario`, add two fields right after `entradasCreadas`:

```prisma
  entradasCreadas   EntradaMercancia[]
  facturasEmitidas  Factura[]
  pagosRegistrados  Pago[]
```

In `model Cliente`, add one field right after `ordenes`:

```prisma
  ordenes   OrdenTrabajo[]
  facturas  Factura[]
```

In `model OrdenTrabajo`, add one field right after `dvi`:

```prisma
  dvi                Dvi?
  factura            Factura?
```

- [ ] **Step 2: Append the new enums and models at the end of the file**

```prisma
enum EstadoFactura {
  PENDIENTE
  PAGADA
}

enum MetodoPago {
  EFECTIVO
  TARJETA
  TRANSFERENCIA
  OTRO
}

model Factura {
  id             String        @id @default(cuid())
  numero         Int           @unique @default(autoincrement())
  estado         EstadoFactura @default(PENDIENTE)
  ordenId        String        @unique @map("orden_id")
  orden          OrdenTrabajo  @relation(fields: [ordenId], references: [id], onDelete: Restrict)
  clienteId      String        @map("cliente_id")
  cliente        Cliente       @relation(fields: [clienteId], references: [id], onDelete: Restrict)
  subtotal       Decimal       @db.Decimal(10, 2)
  descuento      Decimal       @default(0) @db.Decimal(10, 2)
  iva            Decimal       @db.Decimal(10, 2)
  total          Decimal       @db.Decimal(10, 2)
  saldoPendiente Decimal       @map("saldo_pendiente") @db.Decimal(10, 2)
  emitidaPorId   String        @map("emitida_por_id")
  emitidaPor     Usuario       @relation(fields: [emitidaPorId], references: [id], onDelete: Restrict)
  pagos          Pago[]
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  @@map("facturas")
  @@index([clienteId])
  @@index([estado])
}

model Pago {
  id              String     @id @default(cuid())
  facturaId       String     @map("factura_id")
  factura         Factura    @relation(fields: [facturaId], references: [id], onDelete: Restrict)
  monto           Decimal    @db.Decimal(10, 2)
  metodoPago      MetodoPago @map("metodo_pago")
  referencia      String?
  registradoPorId String     @map("registrado_por_id")
  registradoPor   Usuario    @relation(fields: [registradoPorId], references: [id], onDelete: Restrict)
  createdAt       DateTime   @default(now()) @map("created_at")

  @@map("pagos")
  @@index([facturaId])
}
```

Why `numero Int @unique @default(autoincrement())` alongside the `cuid()` primary key: it's a human-readable sequential invoice number (Postgres serial column, independent of the `id` PK), scoped naturally per tenant since it lives inside that tenant's own schema — no shared counter table needed. Confirmed valid against this project's exact Prisma version (`npx prisma validate` passes with this exact model). Why `Factura.orden`/`Factura.cliente`/`Pago.factura`/`*.registradoPor`/`*.emitidaPor` all use `onDelete: Restrict`: a `Factura` is a financial record — nothing in this phase ever deletes one, and every reference into it (payments, the order it bills, the staff who touched it) must stay protected the same way `HistorialVehiculo`/`EntradaMercanciaItem` protect their own referenced rows.

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name add_facturas_pagos`
Expected: creates `prisma/tenant/migrations/<timestamp>_add_facturas_pagos/migration.sql`, applies it, regenerates the Prisma client.

- [ ] **Step 4: Run `tsc --noEmit` to confirm the regenerated client is consistent**

Run: `npx tsc --noEmit`
Expected: no errors (nothing references the new models yet, so this just confirms the schema change alone didn't break anything).

- [ ] **Step 5: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations
git commit -m "fase4-task 1: add Factura/Pago models"
git push
```

---

### Task 2: Pure logic + validation — `computeFacturaTotales`, `assertOrdenFacturable`, Zod schemas

**Files:**
- Create: `src/lib/validation/money.ts`
- Modify: `src/lib/validation/inventario.ts`
- Create: `src/lib/validation/factura.ts`
- Create: `src/lib/factura/totales.ts`
- Test: `src/lib/factura/totales.test.ts`
- Create: `src/lib/factura/facturable-guard.ts`
- Test: `src/lib/factura/facturable-guard.test.ts`

**Interfaces:**
- Consumes: `EstadoOrden` (Fase 2, `@/generated/prisma-tenant`).
- Produces: `requiredMoney(msg)` (`@/lib/validation/money`); `facturarOrdenInputSchema`, `pagoInputSchema` (`@/lib/validation/factura`); `IVA_RATE`, `computeFacturaTotales(input)` (`@/lib/factura/totales`); `assertOrdenFacturable(orden)` (`@/lib/factura/facturable-guard`) — all consumed by Task 3 (`factura-actions.ts`) and Task 6 (`pago-actions.ts`).

- [ ] **Step 1: Extract `requiredMoney` into its own shared file**

Create `src/lib/validation/money.ts`:

```ts
import { z } from "zod";

export const requiredMoney = (msg: string) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number({ error: msg }).min(0, msg),
  );
```

Edit `src/lib/validation/inventario.ts` — replace the local definition with an import, so both files share the exact same helper instead of drifting into two copies:

```ts
import { z } from "zod";
import { requiredMoney } from "./money";
```

(remove the old inline `const requiredMoney = (msg: string) => ...` block that currently sits between the import and `bodegaInputSchema`). Everything else in `inventario.ts` stays unchanged.

- [ ] **Step 2: Run the existing inventario/repuesto/entrada-mercancia tests to confirm the extraction didn't change behavior**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts src/app/actions/entrada-mercancia-actions.test.ts`
Expected: PASS — same tests as before (this is a pure relocation, not a behavior change).

- [ ] **Step 3: Write the failing tests for `computeFacturaTotales`**

Create `src/lib/factura/totales.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeFacturaTotales, IVA_RATE } from "./totales";

describe("computeFacturaTotales", () => {
  it("computes subtotal, IVA at the fixed rate, and total with no discount", () => {
    const result = computeFacturaTotales({
      items: [{ cantidad: 4, precioUnitario: 15 }],
      manoDeObra: [{ horas: 1.5, precioHora: 20 }],
      descuento: 0,
    });

    expect(result).toEqual({ subtotal: 90, descuento: 0, iva: 17.1, total: 107.1 });
  });

  it("applies the discount before computing IVA", () => {
    const result = computeFacturaTotales({
      items: [
        { cantidad: 4, precioUnitario: 15 },
        { cantidad: 2, precioUnitario: 18.9 },
      ],
      manoDeObra: [{ horas: 1.5, precioHora: 20 }],
      descuento: 10,
    });

    expect(result).toEqual({ subtotal: 127.8, descuento: 10, iva: 22.38, total: 140.18 });
  });

  it("uses a fixed 19% IVA rate", () => {
    expect(IVA_RATE).toBe(0.19);
  });

  it("returns zero totals for an order with no items and no mano de obra", () => {
    const result = computeFacturaTotales({ items: [], manoDeObra: [], descuento: 0 });

    expect(result).toEqual({ subtotal: 0, descuento: 0, iva: 0, total: 0 });
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run src/lib/factura/totales.test.ts`
Expected: FAIL — `Cannot find module './totales'`.

- [ ] **Step 5: Implement `totales.ts`**

Create `src/lib/factura/totales.ts`:

```ts
export const IVA_RATE = 0.19;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface FacturaTotalesInput {
  items: { cantidad: number; precioUnitario: number }[];
  manoDeObra: { horas: number; precioHora: number }[];
  descuento: number;
}

export interface FacturaTotales {
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
}

export function computeFacturaTotales({ items, manoDeObra, descuento }: FacturaTotalesInput): FacturaTotales {
  const itemsTotal = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
  const manoDeObraTotal = manoDeObra.reduce((sum, linea) => sum + linea.horas * linea.precioHora, 0);
  const subtotal = roundMoney(itemsTotal + manoDeObraTotal);
  const base = roundMoney(subtotal - descuento);
  const iva = roundMoney(base * IVA_RATE);
  const total = roundMoney(base + iva);
  return { subtotal, descuento, iva, total };
}
```

Note: `computeFacturaTotales` assumes `descuento <= subtotal` — it does not clamp or validate that itself. The caller (Task 3's `crearFacturaAction`) validates that at the boundary (raw user input) before calling this function, matching this codebase's established "validate at the boundary, trust internal code" convention (see `RULES.md`/`CLAUDE.md`).

- [ ] **Step 6: Run the tests again to confirm they pass**

Run: `npx vitest run src/lib/factura/totales.test.ts`
Expected: PASS — all 4 tests pass.

- [ ] **Step 7: Write the failing tests for `assertOrdenFacturable`**

Create `src/lib/factura/facturable-guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertOrdenFacturable } from "./facturable-guard";

describe("assertOrdenFacturable", () => {
  it("does not throw for TERMINADA", () => {
    expect(() => assertOrdenFacturable({ estado: "TERMINADA" })).not.toThrow();
  });

  it("does not throw for ENTREGADA", () => {
    expect(() => assertOrdenFacturable({ estado: "ENTREGADA" })).not.toThrow();
  });

  it("throws for BORRADOR", () => {
    expect(() => assertOrdenFacturable({ estado: "BORRADOR" })).toThrow(
      "No se puede facturar una orden en estado BORRADOR. Debe estar Terminada o Entregada.",
    );
  });

  it("throws for EN_PROCESO", () => {
    expect(() => assertOrdenFacturable({ estado: "EN_PROCESO" })).toThrow(/Debe estar Terminada o Entregada/);
  });

  it("throws for ANULADA", () => {
    expect(() => assertOrdenFacturable({ estado: "ANULADA" })).toThrow(/Debe estar Terminada o Entregada/);
  });
});
```

- [ ] **Step 8: Run it to confirm it fails**

Run: `npx vitest run src/lib/factura/facturable-guard.test.ts`
Expected: FAIL — `Cannot find module './facturable-guard'`.

- [ ] **Step 9: Implement `facturable-guard.ts`**

Create `src/lib/factura/facturable-guard.ts`:

```ts
import type { EstadoOrden } from "@/generated/prisma-tenant";

const FACTURABLE_ESTADOS: EstadoOrden[] = ["TERMINADA", "ENTREGADA"];

export function assertOrdenFacturable(orden: { estado: EstadoOrden }): void {
  if (!FACTURABLE_ESTADOS.includes(orden.estado)) {
    throw new Error(
      `No se puede facturar una orden en estado ${orden.estado}. Debe estar Terminada o Entregada.`,
    );
  }
}
```

- [ ] **Step 10: Run the tests again to confirm they pass**

Run: `npx vitest run src/lib/factura/facturable-guard.test.ts`
Expected: PASS — all 5 tests pass.

- [ ] **Step 11: Add the Zod schemas**

Create `src/lib/validation/factura.ts`:

```ts
import { z } from "zod";
import { requiredMoney } from "./money";

export const facturarOrdenInputSchema = z.object({
  descuento: z.coerce.number().min(0, "El descuento no puede ser negativo").optional(),
});

export type FacturarOrdenInput = z.infer<typeof facturarOrdenInputSchema>;

export const pagoInputSchema = z.object({
  monto: requiredMoney("El monto es obligatorio").refine((v) => v > 0, {
    message: "El monto debe ser mayor a 0",
  }),
  metodoPago: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"], {
    error: "Selecciona un método de pago",
  }),
  referencia: z.string().optional().or(z.literal("")),
});

export type PagoInput = z.infer<typeof pagoInputSchema>;
```

There's no dedicated test file for these schemas — matching this codebase's existing convention (`bodegaInputSchema`/`repuestoInputSchema`/etc. have no standalone test files either; their behavior is exercised through the action tests in Tasks 3 and 6).

- [ ] **Step 12: Run `tsc --noEmit` and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all existing tests plus the 9 new ones (4 `totales` + 5 `facturable-guard`) pass.

- [ ] **Step 13: Commit**

```bash
git add src/lib/validation/money.ts src/lib/validation/inventario.ts src/lib/validation/factura.ts src/lib/factura/totales.ts src/lib/factura/totales.test.ts src/lib/factura/facturable-guard.ts src/lib/factura/facturable-guard.test.ts
git commit -m "fase4-task 2: add factura totales/facturable-guard and validation schemas"
git push
```

---

### Task 3: `factura-actions.ts` — generate a factura from an orden (atomic stock decrement)

**Files:**
- Create: `src/app/actions/factura-actions.ts`
- Test: `src/app/actions/factura-actions.test.ts`

**Interfaces:**
- Consumes: `Factura`/`Pago`/`EstadoFactura` (Task 1); `facturarOrdenInputSchema` (Task 2, `@/lib/validation/factura`); `assertOrdenFacturable` (Task 2, `@/lib/factura/facturable-guard`); `computeFacturaTotales` (Task 2, `@/lib/factura/totales`).
- Produces: `FacturaFormState { error: string | null; success: boolean; facturaId: string | null }`, `FacturaWithDetalle`, `listFacturas(estado?)`, `getFactura(id)`, `crearFacturaAction(ordenId, prevState, formData)` (`@/app/actions/factura-actions`) — consumed by Task 4 (list UI), Task 5 (orden-page wiring), Task 7 (detail UI).

- [ ] **Step 1: Write the failing tests**

Create `src/app/actions/factura-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockOrdenFindUnique = vi.fn();
const mockFacturaFindMany = vi.fn();
const mockFacturaFindUnique = vi.fn();
const mockFacturaCreate = vi.fn();
const mockRepuestoUpdate = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({ factura: { create: mockFacturaCreate }, repuesto: { update: mockRepuestoUpdate } }),
);
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: { findUnique: mockOrdenFindUnique },
    factura: { findMany: mockFacturaFindMany, findUnique: mockFacturaFindUnique },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { crearFacturaAction, listFacturas, getFactura, type FacturaFormState } from "./factura-actions";

const initialState: FacturaFormState = { error: null, success: false, facturaId: null };

function baseOrden(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    estado: "TERMINADA",
    clienteId: "c1",
    factura: null,
    items: [
      { id: "i1", repuestoId: "r1", cantidad: 2, precioUnitario: "18.9" },
      { id: "i2", repuestoId: null, cantidad: 4, precioUnitario: "15" },
    ],
    manoDeObra: [{ id: "m1", horas: "1.5", precioHora: "20" }],
    ...overrides,
  };
}

describe("crearFacturaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockOrdenFindUnique.mockReset().mockResolvedValue(baseOrden());
    mockFacturaCreate.mockReset().mockResolvedValue({ id: "f1" });
    mockRepuestoUpdate.mockReset();
    mockTransaction.mockClear();
  });

  it("returns an error when the orden does not exist", async () => {
    mockOrdenFindUnique.mockResolvedValue(null);

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({ error: "Orden no encontrada", success: false, facturaId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the orden already has a factura", async () => {
    mockOrdenFindUnique.mockResolvedValue(baseOrden({ factura: { id: "f0" } }));

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({ error: "Esta orden ya tiene una factura generada", success: false, facturaId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the orden is not in an invoiceable estado", async () => {
    mockOrdenFindUnique.mockResolvedValue(baseOrden({ estado: "EN_PROCESO" }));

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Debe estar Terminada o Entregada/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the discount exceeds the subtotal", async () => {
    const formData = new FormData();
    formData.set("descuento", "9999");

    const result = await crearFacturaAction("o1", initialState, formData);

    expect(result).toEqual({ error: "El descuento no puede ser mayor al subtotal", success: false, facturaId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("computes totals, creates the factura, and atomically decrements stock only for catalog-linked items", async () => {
    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({ error: null, success: true, facturaId: "f1" });
    expect(mockFacturaCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        clienteId: "c1",
        subtotal: 127.8,
        descuento: 0,
        iva: 24.28,
        total: 152.08,
        saldoPendiente: 152.08,
        emitidaPorId: "u1",
      },
    });
    expect(mockRepuestoUpdate).toHaveBeenCalledTimes(1);
    expect(mockRepuestoUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { stockActual: { decrement: 2 } },
    });
  });

  it("applies a valid discount to the totals", async () => {
    const formData = new FormData();
    formData.set("descuento", "10");

    await crearFacturaAction("o1", initialState, formData);

    expect(mockFacturaCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ descuento: 10, iva: 22.38, total: 140.18 }) }),
    );
  });

  it("sums cantidad across multiple items linked to the same repuesto into a single decrement", async () => {
    mockOrdenFindUnique.mockResolvedValue(
      baseOrden({
        items: [
          { id: "i1", repuestoId: "r1", cantidad: 2, precioUnitario: "18.9" },
          { id: "i2", repuestoId: "r1", cantidad: 3, precioUnitario: "18.9" },
        ],
      }),
    );

    await crearFacturaAction("o1", initialState, new FormData());

    expect(mockRepuestoUpdate).toHaveBeenCalledTimes(1);
    expect(mockRepuestoUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { stockActual: { decrement: 5 } },
    });
  });
});

describe("listFacturas", () => {
  it("lists facturas ordered by most recent first, optionally filtered by estado", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFacturaFindMany.mockReset().mockResolvedValue([{ id: "f1" }]);

    const result = await listFacturas("PENDIENTE");

    expect(result).toEqual([{ id: "f1" }]);
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: "PENDIENTE" }, orderBy: { createdAt: "desc" } }),
    );
  });
});

describe("getFactura", () => {
  it("fetches a single factura by id with full detail", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFacturaFindUnique.mockReset().mockResolvedValue({ id: "f1" });

    const result = await getFactura("f1");

    expect(result).toEqual({ id: "f1" });
    expect(mockFacturaFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "f1" } }));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/factura-actions.test.ts`
Expected: FAIL — `Cannot find module './factura-actions'`.

- [ ] **Step 3: Implement `factura-actions.ts`**

Create `src/app/actions/factura-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { facturarOrdenInputSchema } from "@/lib/validation/factura";
import { assertOrdenFacturable } from "@/lib/factura/facturable-guard";
import { computeFacturaTotales } from "@/lib/factura/totales";
import type { EstadoFactura, Prisma } from "@/generated/prisma-tenant";

export interface FacturaFormState {
  error: string | null;
  success: boolean;
  facturaId: string | null;
}

const FACTURA_DETAIL_INCLUDE = {
  cliente: true,
  orden: { include: { vehiculo: true, items: true, manoDeObra: true } },
  pagos: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.FacturaInclude;

export type FacturaWithDetalle = Prisma.FacturaGetPayload<{ include: typeof FACTURA_DETAIL_INCLUDE }>;

export async function listFacturas(estado?: EstadoFactura): Promise<FacturaWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.factura.findMany({
    where: estado ? { estado } : undefined,
    include: FACTURA_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getFactura(id: string): Promise<FacturaWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.factura.findUnique({ where: { id }, include: FACTURA_DETAIL_INCLUDE });
}

export async function crearFacturaAction(
  ordenId: string,
  prevState: FacturaFormState,
  formData: FormData,
): Promise<FacturaFormState> {
  const parsed = facturarOrdenInputSchema.safeParse({
    descuento: formData.get("descuento") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, facturaId: null };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findUnique({
    where: { id: ordenId },
    include: { items: true, manoDeObra: true, factura: true },
  });
  if (!orden) {
    return { error: "Orden no encontrada", success: false, facturaId: null };
  }
  if (orden.factura) {
    return { error: "Esta orden ya tiene una factura generada", success: false, facturaId: null };
  }
  try {
    assertOrdenFacturable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no facturable", success: false, facturaId: null };
  }

  const descuento = parsed.data.descuento ?? 0;
  const { subtotal, iva, total } = computeFacturaTotales({
    items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
    manoDeObra: orden.manoDeObra.map((linea) => ({
      horas: Number(linea.horas),
      precioHora: Number(linea.precioHora),
    })),
    descuento,
  });

  if (descuento > subtotal) {
    return { error: "El descuento no puede ser mayor al subtotal", success: false, facturaId: null };
  }

  const decrementosStock = new Map<string, number>();
  for (const item of orden.items) {
    if (item.repuestoId) {
      decrementosStock.set(item.repuestoId, (decrementosStock.get(item.repuestoId) ?? 0) + item.cantidad);
    }
  }

  let facturaId: string;
  try {
    const factura = await tenantDb.$transaction(async (tx) => {
      const creada = await tx.factura.create({
        data: {
          ordenId,
          clienteId: orden.clienteId,
          subtotal,
          descuento,
          iva,
          total,
          saldoPendiente: total,
          emitidaPorId: session.user.id,
        },
      });
      for (const [repuestoId, cantidad] of decrementosStock) {
        await tx.repuesto.update({ where: { id: repuestoId }, data: { stockActual: { decrement: cantidad } } });
      }
      return creada;
    });
    facturaId = factura.id;
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al generar la factura"), success: false, facturaId: null };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  revalidatePath("/facturas");
  revalidatePath("/repuestos");
  return { error: null, success: true, facturaId };
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/factura-actions.test.ts`
Expected: PASS — all 9 tests pass.

- [ ] **Step 5: Run `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/factura-actions.ts src/app/actions/factura-actions.test.ts
git commit -m "fase4-task 3: add factura-actions with atomic stock decrement"
git push
```

---

### Task 4: UI — Facturas list page + nav link

**Files:**
- Create: `src/app/(dashboard)/facturas/page.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `listFacturas(estado?)`, `FacturaWithDetalle` (Task 3, `@/app/actions/factura-actions`).
- Produces: `/facturas` route — consumed by Task 5 (link target after generating a factura) and Task 8 (e2e).

- [ ] **Step 1: Create the list page**

Create `src/app/(dashboard)/facturas/page.tsx`:

```tsx
import Link from "next/link";
import { listFacturas } from "@/app/actions/factura-actions";
import type { EstadoFactura } from "@/generated/prisma-tenant";

const ESTADOS_VALIDOS: EstadoFactura[] = ["PENDIENTE", "PAGADA"];

const ESTADO_LABELS: Record<EstadoFactura, string> = {
  PENDIENTE: "Pendiente",
  PAGADA: "Pagada",
};

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado as EstadoFactura) ? (estado as EstadoFactura) : undefined;
  const facturas = await listFacturas(estadoFiltro);

  return (
    <main>
      <h1>Facturas</h1>

      <nav aria-label="Filtrar por estado">
        <Link href="/facturas">Todas</Link>
        {ESTADOS_VALIDOS.map((value) => (
          <Link key={value} href={`/facturas?estado=${value}`}>
            {ESTADO_LABELS[value]}
          </Link>
        ))}
      </nav>

      <ul>
        {facturas.map((factura) => (
          <li key={factura.id}>
            <Link href={`/facturas/${factura.id}`}>
              Factura #{factura.numero} — {factura.cliente.nombre} — {factura.orden.vehiculo.placa} —{" "}
              {ESTADO_LABELS[factura.estado]} — Total: {factura.total.toString()} — Saldo:{" "}
              {factura.saldoPendiente.toString()}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Add the nav link**

Edit `src/app/(dashboard)/layout.tsx` — add a link after `Entradas`:

```tsx
          <Link href="/entradas-mercancia">Entradas</Link>
          <Link href="/facturas">Facturas</Link>
```

- [ ] **Step 3: Run `tsc --noEmit` and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests still pass (no new unit tests for a plain RSC page, matching the established precedent for `/ordenes`, Fase 2 Task 7).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/facturas/page.tsx" "src/app/(dashboard)/layout.tsx"
git commit -m "fase4-task 4: add facturas list page and nav link"
git push
```

---

### Task 5: UI — "Generar factura" wired into the orden detail page

**Files:**
- Modify: `src/app/actions/orden-actions.ts`
- Create: `src/app/(dashboard)/ordenes/[id]/generar-factura-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx`

**Interfaces:**
- Consumes: `crearFacturaAction`, `FacturaFormState` (Task 3, `@/app/actions/factura-actions`).
- Produces: `OrdenWithDetalle.factura: { id: string; numero: number } | null` (via `ORDEN_DETAIL_INCLUDE`) — consumed only within this task's own page.

- [ ] **Step 1: Add `factura` to `ORDEN_DETAIL_INCLUDE`**

Edit `src/app/actions/orden-actions.ts` — add one line to `ORDEN_DETAIL_INCLUDE`, right after `dvi`:

```ts
const ORDEN_DETAIL_INCLUDE = {
  cliente: true,
  vehiculo: true,
  sede: true,
  mecanico: { select: { id: true, nombre: true } },
  items: true,
  manoDeObra: true,
  dvi: { include: { fotos: true } },
  factura: { select: { id: true, numero: true } },
} satisfies Prisma.OrdenTrabajoInclude;
```

- [ ] **Step 2: Create `GenerarFacturaForm`**

Create `src/app/(dashboard)/ordenes/[id]/generar-factura-form.tsx`:

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { crearFacturaAction, type FacturaFormState } from "@/app/actions/factura-actions";

const initialState: FacturaFormState = { error: null, success: false, facturaId: null };

export function GenerarFacturaForm({ ordenId }: { ordenId: string }) {
  const router = useRouter();
  const crearFactura = crearFacturaAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(crearFactura, initialState);

  useEffect(() => {
    if (state.success && state.facturaId) {
      router.push(`/facturas/${state.facturaId}`);
    }
  }, [state.success, state.facturaId, router]);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="descuento">Descuento</label>
      <input id="descuento" name="descuento" type="number" min="0" step="0.01" defaultValue="0" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Generando..." : "Generar factura"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```

- [ ] **Step 3: Wire it into the orden detail page**

Edit `src/app/(dashboard)/ordenes/[id]/page.tsx` — add the import and a new section right after the "Inspección vehicular digital (DVI)" block (before the closing `</main>`):

```tsx
import { GenerarFacturaForm } from "./generar-factura-form";
```

```tsx
      <h2>Facturación</h2>
      {orden.factura ? (
        <p>
          <Link href={`/facturas/${orden.factura.id}`}>Ver factura #{orden.factura.numero}</Link>
        </p>
      ) : orden.estado === "TERMINADA" || orden.estado === "ENTREGADA" ? (
        <GenerarFacturaForm ordenId={orden.id} />
      ) : (
        <p>La orden debe estar Terminada o Entregada para poder facturarse.</p>
      )}
```

This page doesn't currently import `Link` — add it alongside the other imports:

```tsx
import Link from "next/link";
```

- [ ] **Step 4: Run `tsc --noEmit` and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (no new unit tests — this is RSC page wiring, matching the precedent of Fase 3 Task 15's `AgregarItemForm` wiring, which also had no dedicated test file).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/orden-actions.ts "src/app/(dashboard)/ordenes/[id]/generar-factura-form.tsx" "src/app/(dashboard)/ordenes/[id]/page.tsx"
git commit -m "fase4-task 5: wire generar-factura form into orden detail page"
git push
```

---

### Task 6: `pago-actions.ts` — register a payment (atomic overpayment guard)

**Files:**
- Create: `src/app/actions/pago-actions.ts`
- Test: `src/app/actions/pago-actions.test.ts`

**Interfaces:**
- Consumes: `pagoInputSchema` (Task 2, `@/lib/validation/factura`).
- Produces: `PagoFormState { error: string | null; success: boolean }`, `registrarPagoAction(facturaId, prevState, formData)` (`@/app/actions/pago-actions`) — consumed by Task 7 (detail UI).

- [ ] **Step 1: Write the failing tests**

Create `src/app/actions/pago-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockFacturaFindUnique = vi.fn();
const mockFacturaUpdateMany = vi.fn();
const mockPagoCreate = vi.fn();
const mockFacturaFindUniqueOrThrow = vi.fn();
const mockFacturaUpdate = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    factura: {
      updateMany: mockFacturaUpdateMany,
      findUniqueOrThrow: mockFacturaFindUniqueOrThrow,
      update: mockFacturaUpdate,
    },
    pago: { create: mockPagoCreate },
  }),
);
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    factura: { findUnique: mockFacturaFindUnique },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { registrarPagoAction, type PagoFormState } from "./pago-actions";

const initialState: PagoFormState = { error: null, success: false };

describe("registrarPagoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockFacturaFindUnique.mockReset().mockResolvedValue({ id: "f1" });
    mockFacturaUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mockPagoCreate.mockReset();
    mockFacturaFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "f1", saldoPendiente: "40.18" });
    mockFacturaUpdate.mockReset();
    mockTransaction.mockClear();
  });

  it("returns a validation error when monto is left blank, instead of silently defaulting to 0", async () => {
    const formData = new FormData();
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto es obligatorio", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns a validation error when monto is 0", async () => {
    const formData = new FormData();
    formData.set("monto", "0");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto debe ser mayor a 0", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the factura does not exist", async () => {
    mockFacturaFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("monto", "50");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "Factura no encontrada", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("registers a partial payment: decrements saldoPendiente atomically and leaves the factura PENDIENTE", async () => {
    const formData = new FormData();
    formData.set("monto", "100");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockFacturaUpdateMany).toHaveBeenCalledWith({
      where: { id: "f1", saldoPendiente: { gte: 100 } },
      data: { saldoPendiente: { decrement: 100 } },
    });
    expect(mockPagoCreate).toHaveBeenCalledWith({
      data: { facturaId: "f1", monto: 100, metodoPago: "EFECTIVO", referencia: null, registradoPorId: "u1" },
    });
    expect(mockFacturaUpdate).not.toHaveBeenCalled();
  });

  it("marks the factura PAGADA once saldoPendiente reaches 0", async () => {
    mockFacturaFindUniqueOrThrow.mockResolvedValue({ id: "f1", saldoPendiente: "0" });
    const formData = new FormData();
    formData.set("monto", "40.18");
    formData.set("metodoPago", "TRANSFERENCIA");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockFacturaUpdate).toHaveBeenCalledWith({ where: { id: "f1" }, data: { estado: "PAGADA" } });
  });

  it("rejects a payment that exceeds the saldoPendiente, atomically (no partial write)", async () => {
    mockFacturaUpdateMany.mockResolvedValue({ count: 0 });
    const formData = new FormData();
    formData.set("monto", "99999");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto no puede ser mayor al saldo pendiente", success: false });
    expect(mockPagoCreate).not.toHaveBeenCalled();
  });
});
```

Note: `mockTransaction`'s callback form means `mockFacturaUpdateMany`/`mockPagoCreate`/`mockFacturaFindUniqueOrThrow`/`mockFacturaUpdate` are called in real execution order inside `registrarPagoAction`'s own `async (tx) => {...}` body — the "rejects... atomically" test relies on `mockFacturaUpdateMany` returning `{count: 0}` to make the implementation throw before it ever reaches `tx.pago.create`, which is exactly what closes the overpayment race at the database level (see Task 6 Step 3).

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/pago-actions.test.ts`
Expected: FAIL — `Cannot find module './pago-actions'`.

- [ ] **Step 3: Implement `pago-actions.ts`**

Create `src/app/actions/pago-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { pagoInputSchema } from "@/lib/validation/factura";

export interface PagoFormState {
  error: string | null;
  success: boolean;
}

const SALDO_INSUFICIENTE = "SALDO_INSUFICIENTE";

export async function registrarPagoAction(
  facturaId: string,
  prevState: PagoFormState,
  formData: FormData,
): Promise<PagoFormState> {
  const parsed = pagoInputSchema.safeParse({
    monto: formData.get("monto"),
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const factura = await tenantDb.factura.findUnique({ where: { id: facturaId }, select: { id: true } });
  if (!factura) {
    return { error: "Factura no encontrada", success: false };
  }

  try {
    await tenantDb.$transaction(async (tx) => {
      const { count } = await tx.factura.updateMany({
        where: { id: facturaId, saldoPendiente: { gte: parsed.data.monto } },
        data: { saldoPendiente: { decrement: parsed.data.monto } },
      });
      if (count === 0) {
        throw new Error(SALDO_INSUFICIENTE);
      }

      await tx.pago.create({
        data: {
          facturaId,
          monto: parsed.data.monto,
          metodoPago: parsed.data.metodoPago,
          referencia: parsed.data.referencia || null,
          registradoPorId: session.user.id,
        },
      });

      const actualizada = await tx.factura.findUniqueOrThrow({ where: { id: facturaId } });
      if (Number(actualizada.saldoPendiente) <= 0) {
        await tx.factura.update({ where: { id: facturaId }, data: { estado: "PAGADA" } });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === SALDO_INSUFICIENTE) {
      return { error: "El monto no puede ser mayor al saldo pendiente", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "Error al registrar el pago"), success: false };
  }

  revalidatePath(`/facturas/${facturaId}`);
  revalidatePath("/facturas");
  return { error: null, success: true };
}
```

Why the `updateMany({ where: { saldoPendiente: { gte: monto } }, ... })` guard instead of a plain `factura.update`: this compiles to a single conditional `UPDATE ... WHERE saldo_pendiente >= $monto` at the Postgres level — two concurrent payment requests against the same factura can't both succeed past the balance, because the second one's `WHERE` clause will see the first one's already-committed decrement (or the transaction serializes them) and its `count` comes back `0`. This closes the exact class of race that Fase 3's final review flagged as a TOCTOU (there judged negligible for a warehouse mismatch); money handling gets the stronger guarantee.

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/pago-actions.test.ts`
Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Run `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/pago-actions.ts src/app/actions/pago-actions.test.ts
git commit -m "fase4-task 6: add pago-actions with atomic overpayment guard"
git push
```

---

### Task 7: UI — Factura detail page + Registrar pago form

**Files:**
- Create: `src/app/(dashboard)/facturas/[id]/page.tsx`
- Create: `src/app/(dashboard)/facturas/[id]/registrar-pago-form.tsx`

**Interfaces:**
- Consumes: `getFactura(id)`, `FacturaWithDetalle` (Task 3, `@/app/actions/factura-actions`); `registrarPagoAction`, `PagoFormState` (Task 6, `@/app/actions/pago-actions`).
- Produces: `/facturas/[id]` route — the redirect target of Task 5's `GenerarFacturaForm` and the final destination exercised by Task 8's e2e.

- [ ] **Step 1: Create `RegistrarPagoForm`**

Create `src/app/(dashboard)/facturas/[id]/registrar-pago-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { registrarPagoAction, type PagoFormState } from "@/app/actions/pago-actions";

const initialState: PagoFormState = { error: null, success: false };

export function RegistrarPagoForm({ facturaId }: { facturaId: string }) {
  const registrarPago = registrarPagoAction.bind(null, facturaId);
  const [state, formAction, isPending] = useActionState(registrarPago, initialState);

  return (
    <form noValidate action={formAction}>
      <label htmlFor="monto">Monto</label>
      <input id="monto" name="monto" type="number" min="0.01" step="0.01" required />

      <label htmlFor="metodoPago">Método de pago</label>
      <select id="metodoPago" name="metodoPago" defaultValue="EFECTIVO">
        <option value="EFECTIVO">Efectivo</option>
        <option value="TARJETA">Tarjeta</option>
        <option value="TRANSFERENCIA">Transferencia</option>
        <option value="OTRO">Otro</option>
      </select>

      <label htmlFor="referencia">Referencia (opcional)</label>
      <input id="referencia" name="referencia" />

      <button type="submit" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar pago"}
      </button>

      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.success ? <p role="status">Pago registrado</p> : null}
    </form>
  );
}
```

- [ ] **Step 2: Create the detail page**

Create `src/app/(dashboard)/facturas/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getFactura } from "@/app/actions/factura-actions";
import { RegistrarPagoForm } from "./registrar-pago-form";
import type { MetodoPago } from "@/generated/prisma-tenant";

const METODO_PAGO_LABELS: Record<MetodoPago, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

export default async function FacturaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const factura = await getFactura(id);

  if (!factura) {
    notFound();
  }

  return (
    <main>
      <h1>
        Factura #{factura.numero} — {factura.cliente.nombre}
      </h1>
      <p>Vehículo: {factura.orden.vehiculo.placa}</p>
      <p>Estado: {factura.estado === "PAGADA" ? "Pagada" : "Pendiente"}</p>

      <h2>Ítems</h2>
      <ul>
        {factura.orden.items.map((item) => (
          <li key={item.id}>
            {item.descripcion} — {item.cantidad} x {item.precioUnitario.toString()}
          </li>
        ))}
      </ul>

      <h2>Mano de obra</h2>
      <ul>
        {factura.orden.manoDeObra.map((linea) => (
          <li key={linea.id}>
            {linea.descripcion} — {linea.horas.toString()}h x {linea.precioHora.toString()}
          </li>
        ))}
      </ul>

      <p>Subtotal: {factura.subtotal.toString()}</p>
      <p>Descuento: {factura.descuento.toString()}</p>
      <p>IVA (19%): {factura.iva.toString()}</p>
      <p>Total: {factura.total.toString()}</p>
      <p>Saldo pendiente: {factura.saldoPendiente.toString()}</p>

      <h2>Pagos</h2>
      {factura.estado === "PENDIENTE" ? <RegistrarPagoForm facturaId={factura.id} /> : null}
      <ul>
        {factura.pagos.map((pago) => (
          <li key={pago.id}>
            {new Date(pago.createdAt).toLocaleDateString()} — {METODO_PAGO_LABELS[pago.metodoPago]} —{" "}
            {pago.monto.toString()}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Run `tsc --noEmit` and the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass (no new unit tests — matches the established precedent for detail pages composed from already-tested actions/forms, e.g. Fase 3 Task 13).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/facturas/[id]/page.tsx" "src/app/(dashboard)/facturas/[id]/registrar-pago-form.tsx"
git commit -m "fase4-task 7: add factura detail page with registrar-pago form"
git push
```

---

### Task 8: E2E — extend the smoke test through Facturación y Pagos

**Files:**
- Modify: `e2e/tenant-flow.spec.ts`

**Interfaces:**
- Consumes: the full Fase 4 UI/action stack (Tasks 3–7).
- Produces: nothing new — this is the terminal task of the plan.

- [ ] **Step 1: Insert the Fase 4 flow between the TERMINADA assertion and the ENTREGADA transition, and update the final stock assertion**

Edit `e2e/tenant-flow.spec.ts`. Replace this block (currently the last part of the test, right after the `TERMINADA` heading assertion):

```ts
  await page.getByLabel("Cambiar estado a").selectOption("ENTREGADA");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByText(/Estado actual: Entregada/)).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 20/)).toBeVisible();
});
```

with:

```ts
  // --- Fase 4: Facturación y pagos ---

  await page.getByLabel("Descuento").fill("10");
  await page.getByRole("button", { name: "Generar factura" }).click();
  await expect(page.getByRole("heading", { name: /Factura #1/ })).toBeVisible();
  await expect(page.getByText("Subtotal: 127.8")).toBeVisible();
  await expect(page.getByText("IVA (19%): 22.38")).toBeVisible();
  await expect(page.getByText("Total: 140.18")).toBeVisible();
  await expect(page.getByText("Saldo pendiente: 140.18")).toBeVisible();

  await page.getByLabel("Monto").fill("100");
  await page.getByLabel("Método de pago").selectOption("EFECTIVO");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByRole("status")).toHaveText("Pago registrado");
  await expect(page.getByText("Saldo pendiente: 40.18")).toBeVisible();
  await expect(page.getByText("Estado: Pendiente")).toBeVisible();

  await page.getByLabel("Monto").fill("40.18");
  await page.getByLabel("Método de pago").selectOption("TRANSFERENCIA");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByRole("status")).toHaveText("Pago registrado");
  await expect(page.getByText("Estado: Pagada")).toBeVisible();
  await expect(page.getByText("Saldo pendiente: 0")).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 18/)).toBeVisible();

  await page.goto("/ordenes");
  await page.getByRole("link", { name: /ABC123/ }).click();
  await expect(page.getByRole("link", { name: /Ver factura #1/ })).toBeVisible();

  await page.getByLabel("Cambiar estado a").selectOption("ENTREGADA");
  await page.getByRole("button", { name: "Cambiar estado" }).click();
  await expect(page.getByText(/Estado actual: Entregada/)).toBeVisible();

  await page.goto("/repuestos");
  await expect(page.getByText(/FRN-001.*stock: 18/)).toBeVisible();
});
```

Stock math: the order carries 2 catalog-linked units of `FRN-001` (added in the Fase 3 section of this same test, `Filtro de aceite — 2 x 18.9`), on top of the 20 units received earlier — so stock goes from 20 to 18 the moment the factura is generated, and must stay at 18 through the later `ENTREGADA` transition (proving invoicing decrements stock exactly once, not again on every subsequent state change). Totals math: items subtotal `4×15 + 2×18.9 = 97.8`, mano de obra `1.5×20 = 30`, subtotal `127.8`; discount `10` → base `117.8`; IVA `117.8×0.19 = 22.382` rounds to `22.38`; total `140.18`. First payment `100` leaves saldo `40.18`; second payment of exactly `40.18` brings it to `0` and flips the factura to `PAGADA`. All four of these figures were verified against the actual rounding implementation (`Math.round(value * 100) / 100` at each stage) before being written into this plan.

- [ ] **Step 2: Run the e2e suite**

Run: `npx playwright test`
Expected: PASS — 2/2 (this spec + the pre-existing `landing.spec.ts`).

- [ ] **Step 3: Run the full unit suite and `tsc --noEmit` one last time**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite passes.

- [ ] **Step 4: Commit**

```bash
git add e2e/tenant-flow.spec.ts
git commit -m "fase4-task 8: extend e2e smoke test through facturacion y pagos"
git push
```

---

## After all 8 tasks

Per this project's established convention (Fases 1–3), once all tasks are implemented, dispatch a **final whole-branch review** (opus) over the full Fase 4 diff before considering the phase done — looking specifically for cross-cutting issues no single task's scoped review could catch: the atomic stock-decrement transaction (Task 3) interacting correctly with Fase 3's existing stock-mutation code paths, the overpayment guard (Task 6) actually closing the race under concurrent load, `assertOrdenFacturable`/`assertOrdenMutable` not fighting each other on the same `estado` field, and any Decimal-into-Client-Component leak (the bug class that has already bitten this codebase twice — check every prop passed into `GenerarFacturaForm`/`RegistrarPagoForm`/the two new pages). Fix any Critical/Important findings, re-review, update `.superpowers/sdd/progress.md` with the final state once the verdict is "Ready to merge: Yes".
