# TorqueFlow Fase 5 (Dashboard y Reportes básicos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the shop owner a single `/reportes` page that answers two questions over an explicit date range and an explicit sede: *how much money did we make and what was the margin* (rentabilidad) and *which técnico delivered how much work* (productividad).

**Architecture:** Same layered pattern as Fases 2/3/4, minus any new Prisma models — this phase is **read-only over the schema that Fases 2–4 already built**. Pure aggregation math in `src/lib/reportes/` (unit-tested in isolation from Prisma, mirroring `src/lib/factura/totales.ts`) → Zod filter validation in `src/lib/validation/reporte.ts` → read-only `"use server"` actions in `src/app/actions/reporte-actions.ts` → one plain React Server Component page at `src/app/(dashboard)/reportes/page.tsx` with a native GET `<form>` driving `searchParams`. No Prisma migration, no new npm dependency, no charting library, no `"use client"` component.

**Tech Stack:** Next.js 16 (App Router, Server Actions, RSC), Prisma 6.19.3 (per-tenant Postgres schema), Zod 4.4.3, Vitest, Playwright.

## Global Constraints

- Prisma pinned to exact 6.19.3 (not caret).
- Direct-to-main execution, no worktree/branch (explicit standing user consent from Fase 1 onward).
- Commit format: `fase5-task N: descripción breve` (see `RULES.md` at repo root — Fase 5 is the active phase, format must say "fase5" not "fase4" or generic "task").
- Max 1 fix/re-review loop per task (`RULES.md` #1).
- `tsc --noEmit` and full test suite only at the end of each task, not mid-development (`RULES.md` #4).
- Do not touch Fase 1-4 backlog/Minor findings while executing this phase (`RULES.md` #7) — several are listed at the end of the Fase 1/2/3/4 sections of `progress.md`; ignore them, do not fold any into this plan even if you notice related code while implementing.
- Reportes/dashboard actions are `requireRole(["ADMIN"])`-gated (see below) — do not silently loosen this to include RECEPCION/TECNICO.
- No new npm dependencies unless you find a compelling reason genuinely required by the scope (e.g. a date-math helper) — check `package.json` first; if you must add one, say so explicitly and justify it in the plan rather than silently assuming.

### Phase-specific decisions (established during investigation, binding for every task)

- **Role gate — `requireRole(["ADMIN"])` on both report actions, deliberately.** Rentabilidad exposes cost of goods and gross margin; productividad exposes peer-comparison performance data. Both are business-owner-sensitive, so `RECEPCION` and `TECNICO` get neither in v1. This is enforced in three places that must all agree: `getReporteRentabilidad`, `getReporteProductividad`, and the conditional nav link in `(dashboard)/layout.tsx`. The action-level guard is the real boundary (server actions are network endpoints); the nav link is cosmetic. A non-ADMIN who navigates to `/reportes` directly is redirected to `/login?error=forbidden` by the existing `requireRole` helper (`src/lib/auth/guards.ts`) — that error code already renders a Spanish message via `getLoginErrorMessage`, no new copy needed.
- **No new npm dependency.** `package.json` was checked: there is no charting library and no date library (`date-fns`, `dayjs`, `luxon` are all absent). Reports render as plain numbers and plain `<table>`s, matching the existing `/ordenes`, `/facturas`, `/bodegas` RSC-page precedent. Date math is a handful of lines over native `Date` in `src/lib/reportes/rango-fechas.ts` — a dependency would be pure overhead.
- **Date-range boundaries are UTC, and both endpoints are inclusive.** `buildRangoFechas("2026-08-01", "2026-08-21")` produces `{ gte: 2026-08-01T00:00:00.000Z, lt: 2026-08-22T00:00:00.000Z }` — a half-open interval whose upper bound is *the day after* `hasta` at midnight, so the whole of `hasta` is included. This app has no per-tenant timezone setting, so UTC is the only coherent v1 boundary. **Known limitation, documented deliberately, not a defect to fix in this phase:** for a Colombian shop (UTC-05:00) an invoice created after 19:00 local falls on the next UTC day. Revisit when a tenant timezone field exists.
- **Rentabilidad is anchored on `Factura.createdAt`** (the emission date — the only date field on `Factura`). Sede scoping goes through the relation (`orden: { sedeId }`) because `Factura` has no `sede_id` column of its own; `OrdenTrabajo.sedeId` is required and non-null, so every factura is reachable by exactly one sede.
- **No `ANULADA` filter is needed on the rentabilidad query, and adding one would be dead code.** Proof from the real schema/code: `assertOrdenFacturable` only allows invoicing a `TERMINADA` or `ENTREGADA` orden, and `ESTADO_ORDEN_TRANSITIONS` (`src/lib/orden/estado-transitions.ts`) has `TERMINADA: ["ENTREGADA"]` and `ENTREGADA: []` — neither can ever reach `ANULADA`. An invoiced orden is therefore permanently un-cancellable.
- **Productividad is anchored on `OrdenTrabajo.entregadaAt`** (stamped by `updateEstadoOrdenAction` on the `→ ENTREGADA` transition since Fase 2) with `estado: "ENTREGADA"`, scoped by `sedeId` directly. It measures *work delivered in the range*, not *money billed in the range* — a deliberately different anchor from the rentabilidad report, because an owner asking "who delivered what this month" is asking about delivery dates. All `ManoDeObra` lines on those órdenes count: an `ENTREGADA` orden is fully immutable (no valid outgoing transition, and `assertOrdenMutable` additionally rejects any orden that already has a `Factura` since the Fase 4 review fix `d515b52`), so those lines are exactly what was or will be billed.
- **Cost of parts uses `Repuesto.precioCompra`, the current catalog cost — an accepted v1 approximation.** `ItemOrden` stores `precioUnitario` (the *sale* price snapshot) but no cost snapshot, and there is no FIFO/lot linkage between `ItemOrden` and `EntradaMercanciaItem.precioCompraUnitario`. Editing a repuesto's `precioCompra` therefore retroactively shifts historical margin. Documented, not solved here (solving it means a new snapshot column + migration, which is out of this phase's read-only scope).
- **Every report action takes an explicit `sedeId` filter and applies it, even though each tenant has exactly one `Sede` today.** When `sedeId` is omitted the action resolves the tenant's oldest sede (`sede.findFirst({ orderBy: { createdAt: "asc" } })` — the same default-sede rule `createOrdenAction` already uses). This is the same "arquitectura preparada" principle as `sede_id` in the schema (design doc §5 módulo 12): Fase 6 activates the multi-sede UI without touching this module's query logic. **Do NOT build a sede selector dropdown or any multi-sede UX in this phase** — the page carries `sedeId` through as a hidden form input only.
- **Fase 5 targets the middle plan tier** from design doc §9 ("Reportes completos (1 sede)"). Cross-sede comparison is explicitly Fase 6+ and must not appear in this plan's code.
- **Tenant DB access is always `getTenantDb(session.user.tenantSchema)` from the already-validated session.** Never call `resolveTenant()` inside an action — that pattern was deliberately removed project-wide in Fase 1 backlog #21.
- **`select`-only projections everywhere.** No report query may `include` a whole `Usuario` row (`passwordHash` leak) or hand a Prisma `Decimal` to anything but a `Number(...)` conversion at the action boundary. This exact bug class has bitten this project twice (Fase 2's `listTecnicos`/`TecnicoOption` fix, Fase 3's `listRepuestoOptions` fix).
- **No new component tests for the plain RSC report page** — established precedent for simple list/report pages (`/ordenes`, `/facturas`, `/bodegas` have none). Coverage for the page comes from the e2e spec (Tasks 10–11).
- **A `"use server"` module may only export async functions and types.** Do not export a shared constant (e.g. a zeroed-totals object) from `reporte-actions.ts` — Next.js rejects it at build time. Use `computeRentabilidad([])` / `[]` for empty results instead.

---

### Task 1: Extract `roundMoney` into a shared `src/lib/money/round.ts`

Both new aggregation modules need the exact same 2-decimal rounding that `computeFacturaTotales` already uses, and it is currently a private function inside `src/lib/factura/totales.ts`. Extract it verbatim (behavior-preserving) so the reportes modules can import it instead of duplicating it — the same DRY relocation precedent as Fase 4 Task 2 moving `requiredMoney` into `src/lib/validation/money.ts`.

**Files:**
- Create: `src/lib/money/round.ts`
- Create: `src/lib/money/round.test.ts`
- Modify: `src/lib/factura/totales.ts` (remove the private copy, import the shared one)

**Interfaces:**
- Consumes: nothing.
- Produces: `roundMoney(value: number): number` from `@/lib/money/round` — used by Task 4 (`computeRentabilidad`), Task 5 (`computeProductividad`), and the existing `computeFacturaTotales`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/money/round.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roundMoney } from "./round";

describe("roundMoney", () => {
  it("rounds to two decimals", () => {
    expect(roundMoney(22.382)).toBe(22.38);
    expect(roundMoney(22.385)).toBe(22.39);
  });

  it("leaves values that already have at most two decimals untouched", () => {
    expect(roundMoney(127.8)).toBe(127.8);
    expect(roundMoney(30)).toBe(30);
    expect(roundMoney(0)).toBe(0);
  });

  it("rounds negative values away from zero at the .5 boundary", () => {
    expect(roundMoney(-124.185)).toBe(-124.18);
  });
});
```

Note on the third case: `Math.round(-12418.5)` is `-12418` in JavaScript (rounds toward `+Infinity` at the exact half), so `-124.18` is the correct expectation. This test pins the *existing* behavior being relocated — do not "fix" it here.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/money/round.test.ts`
Expected: FAIL — `Failed to resolve import "./round"`.

- [ ] **Step 3: Create the shared module**

Create `src/lib/money/round.ts`:

```ts
/**
 * Canonical 2-decimal money rounding for this codebase. Relocated verbatim
 * from src/lib/factura/totales.ts (Fase 4) so the reportes aggregation
 * modules can share it instead of duplicating the same three characters of
 * float arithmetic. Also used for hour totals, which are Decimal(5, 2) in
 * the schema and therefore carry the same two-decimal precision.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
```

- [ ] **Step 4: Rewire `totales.ts` to import it**

In `src/lib/factura/totales.ts`, delete the private `roundMoney` function and add the import. The file's top must become:

```ts
import { roundMoney } from "@/lib/money/round";

export const IVA_RATE = 0.19;

export interface FacturaTotalesInput {
```

Everything from `export interface FacturaTotalesInput` down stays exactly as it is — `computeFacturaTotales` keeps calling `roundMoney` with no other change.

- [ ] **Step 5: Run the new test plus the existing totales regression net**

Run: `npx vitest run src/lib/money/round.test.ts src/lib/factura/totales.test.ts`
Expected: PASS — 3 new tests plus the 4 pre-existing `computeFacturaTotales` tests, which are the proof that the relocation changed no behavior.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/money src/lib/factura/totales.ts
git commit -m "fase5-task 1: extract roundMoney into src/lib/money"
git push origin main
```

---

### Task 2: Date-range helpers (`src/lib/reportes/rango-fechas.ts`)

Turns the `YYYY-MM-DD` strings that arrive from the URL into the Prisma `{ gte, lt }` filter the report queries need, and computes the page's default range (current calendar month to date).

**Files:**
- Create: `src/lib/reportes/rango-fechas.ts`
- Create: `src/lib/reportes/rango-fechas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface RangoFechas { gte: Date; lt: Date }`
  - `buildRangoFechas(desde: string, hasta: string): RangoFechas` — both args are `YYYY-MM-DD`; used by Tasks 6 and 7.
  - `rangoMesActual(hoy: Date): { desde: string; hasta: string }` — used by Task 8's page for the default range.

- [ ] **Step 1: Write the failing test**

Create `src/lib/reportes/rango-fechas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRangoFechas, rangoMesActual } from "./rango-fechas";

describe("buildRangoFechas", () => {
  it("starts at UTC midnight of 'desde'", () => {
    const { gte } = buildRangoFechas("2026-08-01", "2026-08-21");

    expect(gte.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("ends exclusively at UTC midnight of the day after 'hasta', so 'hasta' is fully included", () => {
    const { lt } = buildRangoFechas("2026-08-01", "2026-08-21");

    expect(lt.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  it("supports a single-day range", () => {
    const { gte, lt } = buildRangoFechas("2026-08-21", "2026-08-21");

    expect(gte.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  it("rolls over month and year boundaries", () => {
    expect(buildRangoFechas("2026-12-31", "2026-12-31").lt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(buildRangoFechas("2028-02-28", "2028-02-29").lt.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });
});

describe("rangoMesActual", () => {
  it("returns the first day of the current UTC month through today", () => {
    expect(rangoMesActual(new Date("2026-08-21T18:30:00.000Z"))).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-21",
    });
  });

  it("zero-pads single-digit months and days", () => {
    expect(rangoMesActual(new Date("2026-01-05T00:00:00.000Z"))).toEqual({
      desde: "2026-01-01",
      hasta: "2026-01-05",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reportes/rango-fechas.test.ts`
Expected: FAIL — `Failed to resolve import "./rango-fechas"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/reportes/rango-fechas.ts`:

```ts
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Half-open date filter for Prisma: `{ createdAt: { gte, lt } }`.
 * `lt` is the day AFTER the requested end date at UTC midnight, which makes
 * the whole of that end date part of the range.
 */
export interface RangoFechas {
  gte: Date;
  lt: Date;
}

function medianocheUtc(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

function aFechaIso(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/**
 * Both arguments are `YYYY-MM-DD` strings already validated by
 * `reporteFiltrosSchema`. Boundaries are UTC — see the plan's Global
 * Constraints for why, and for the known local-timezone limitation.
 */
export function buildRangoFechas(desde: string, hasta: string): RangoFechas {
  return {
    gte: medianocheUtc(desde),
    lt: new Date(medianocheUtc(hasta).getTime() + UN_DIA_MS),
  };
}

/** Default range offered by the /reportes page: current UTC month to date. */
export function rangoMesActual(hoy: Date): { desde: string; hasta: string } {
  const primerDia = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  return { desde: aFechaIso(primerDia), hasta: aFechaIso(hoy) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reportes/rango-fechas.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reportes/rango-fechas.ts src/lib/reportes/rango-fechas.test.ts
git commit -m "fase5-task 2: add reportes date-range helpers"
git push origin main
```

---

### Task 3: Report filter validation schema (`src/lib/validation/reporte.ts`)

The date range is **obligatorio** — there is no "all time" mode. Both actions validate their own input because server actions are network endpoints, not just page helpers.

**Files:**
- Create: `src/lib/validation/reporte.ts`
- Create: `src/lib/validation/reporte.test.ts`

**Interfaces:**
- Consumes: nothing (Zod only — no `requiredMoney`, there is no money input in this phase).
- Produces:
  - `reporteFiltrosSchema` — a Zod object with `{ desde: string; hasta: string; sedeId?: string }`.
  - `type ReporteFiltrosInput = z.infer<typeof reporteFiltrosSchema>`.
  Both used by Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

Create `src/lib/validation/reporte.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reporteFiltrosSchema } from "./reporte";

describe("reporteFiltrosSchema", () => {
  it("accepts a valid range with an explicit sedeId", () => {
    const result = reporteFiltrosSchema.safeParse({
      desde: "2026-08-01",
      hasta: "2026-08-21",
      sedeId: "sede-1",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ desde: "2026-08-01", hasta: "2026-08-21", sedeId: "sede-1" });
  });

  it("accepts an empty sedeId (the caller will fall back to the tenant's default sede)", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-08-01", hasta: "2026-08-21", sedeId: "" });

    expect(result.success).toBe(true);
  });

  it("accepts an omitted sedeId", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-08-01", hasta: "2026-08-21" });

    expect(result.success).toBe(true);
  });

  it("rejects a missing date", () => {
    const result = reporteFiltrosSchema.safeParse({ hasta: "2026-08-21" });

    expect(result.success).toBe(false);
  });

  it("rejects a malformed date string", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "01/08/2026", hasta: "2026-08-21" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("La fecha debe tener el formato AAAA-MM-DD");
  });

  it("rejects a well-formatted but non-existent calendar date", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-02-31", hasta: "2026-03-01" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("La fecha no existe en el calendario");
  });

  it("rejects a range whose start is after its end", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-08-22", hasta: "2026-08-21" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("La fecha inicial no puede ser posterior a la final");
  });

  it("accepts a single-day range where start equals end", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-08-21", hasta: "2026-08-21" });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/validation/reporte.test.ts`
Expected: FAIL — `Failed to resolve import "./reporte"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/validation/reporte.ts`:

```ts
import { z } from "zod";

/**
 * Round-trip check instead of a bare `Number.isNaN(date.getTime())`: it holds
 * regardless of how lenient the host's Date parser is about out-of-range
 * components, so "2026-02-31" is rejected even if a runtime silently rolls it
 * over to March 3rd.
 */
function esFechaDeCalendario(valor: string): boolean {
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) return false;
  return fecha.toISOString().slice(0, 10) === valor;
}

const fechaSchema = z
  .string({ error: "La fecha es obligatoria" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato AAAA-MM-DD")
  .refine(esFechaDeCalendario, { message: "La fecha no existe en el calendario" });

/**
 * The date range is mandatory — there is no "all time" report in this phase.
 * `sedeId` is optional at the schema level only; the actions resolve the
 * tenant's default sede when it is absent, so the filter is always applied.
 */
export const reporteFiltrosSchema = z
  .object({
    desde: fechaSchema,
    hasta: fechaSchema,
    sedeId: z.string().optional().or(z.literal("")),
  })
  .refine((filtros) => filtros.desde <= filtros.hasta, {
    message: "La fecha inicial no puede ser posterior a la final",
    path: ["desde"],
  });

export type ReporteFiltrosInput = z.infer<typeof reporteFiltrosSchema>;
```

`desde <= hasta` is a plain string comparison, which is correct here because `YYYY-MM-DD` is lexicographically ordered — the regex has already guaranteed the shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/validation/reporte.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/reporte.ts src/lib/validation/reporte.test.ts
git commit -m "fase5-task 3: add reporte filtros validation schema"
git push origin main
```

---

### Task 4: `computeRentabilidad` (`src/lib/reportes/rentabilidad.ts`)

Pure aggregation, zero Prisma. The action (Task 6) converts Prisma `Decimal`s to `number` at the boundary and hands plain objects here.

**Files:**
- Create: `src/lib/reportes/rentabilidad.ts`
- Create: `src/lib/reportes/rentabilidad.test.ts`

**Interfaces:**
- Consumes: `roundMoney` from `@/lib/money/round` (Task 1).
- Produces:
  - `interface RentabilidadItem { cantidad: number; precioCompra: number | null }`
  - `interface RentabilidadManoDeObra { horas: number; precioHora: number }`
  - `interface RentabilidadFactura { total: number; items: RentabilidadItem[]; manoDeObra: RentabilidadManoDeObra[] }`
  - `interface RentabilidadTotales { facturasCount: number; totalFacturado: number; costoRepuestos: number; margen: number; margenPorcentaje: number; manoDeObraFacturada: number }`
  - `computeRentabilidad(facturas: RentabilidadFactura[]): RentabilidadTotales`
  All consumed by Task 6 and rendered by Task 8.

- [ ] **Step 1: Write the failing test**

Create `src/lib/reportes/rentabilidad.test.ts`. The single-factura case uses the exact numbers the e2e spec already produces (4 × 15 uncatalogued brake pads + 2 × 18.9 catalogued oil filters bought at 8 + 1.5h × 20 labour, 10 discount, 19% IVA → total 140.18), so the unit test and the e2e assert the same arithmetic:

```ts
import { describe, expect, it } from "vitest";
import { computeRentabilidad } from "./rentabilidad";

describe("computeRentabilidad", () => {
  it("returns zeroed totals for an empty range without dividing by zero", () => {
    expect(computeRentabilidad([])).toEqual({
      facturasCount: 0,
      totalFacturado: 0,
      costoRepuestos: 0,
      margen: 0,
      margenPorcentaje: 0,
      manoDeObraFacturada: 0,
    });
  });

  it("counts cost only for items linked to a catalog Repuesto", () => {
    const totales = computeRentabilidad([
      {
        total: 140.18,
        items: [
          { cantidad: 4, precioCompra: null },
          { cantidad: 2, precioCompra: 8 },
        ],
        manoDeObra: [{ horas: 1.5, precioHora: 20 }],
      },
    ]);

    expect(totales).toEqual({
      facturasCount: 1,
      totalFacturado: 140.18,
      costoRepuestos: 16,
      margen: 124.18,
      margenPorcentaje: 88.59,
      manoDeObraFacturada: 30,
    });
  });

  it("sums across several facturas", () => {
    const totales = computeRentabilidad([
      { total: 100, items: [{ cantidad: 1, precioCompra: 10 }], manoDeObra: [] },
      {
        total: 200,
        items: [{ cantidad: 2, precioCompra: 20 }],
        manoDeObra: [{ horas: 2, precioHora: 25 }],
      },
    ]);

    expect(totales).toEqual({
      facturasCount: 2,
      totalFacturado: 300,
      costoRepuestos: 50,
      margen: 250,
      margenPorcentaje: 83.33,
      manoDeObraFacturada: 50,
    });
  });

  it("reports a negative margin when parts cost more than the invoice total", () => {
    const totales = computeRentabilidad([
      { total: 50, items: [{ cantidad: 1, precioCompra: 80 }], manoDeObra: [] },
    ]);

    expect(totales.costoRepuestos).toBe(80);
    expect(totales.margen).toBe(-30);
    expect(totales.margenPorcentaje).toBe(-60);
  });

  it("rounds each aggregate to two decimals", () => {
    const totales = computeRentabilidad([
      { total: 10.005, items: [{ cantidad: 3, precioCompra: 0.335 }], manoDeObra: [{ horas: 0.333, precioHora: 3 }] },
    ]);

    expect(totales.totalFacturado).toBe(10.01);
    expect(totales.costoRepuestos).toBe(1.01);
    expect(totales.manoDeObraFacturada).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reportes/rentabilidad.test.ts`
Expected: FAIL — `Failed to resolve import "./rentabilidad"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/reportes/rentabilidad.ts`:

```ts
import { roundMoney } from "@/lib/money/round";

/** `precioCompra` is null for a free-text ItemOrden with no catalog Repuesto behind it. */
export interface RentabilidadItem {
  cantidad: number;
  precioCompra: number | null;
}

export interface RentabilidadManoDeObra {
  horas: number;
  precioHora: number;
}

export interface RentabilidadFactura {
  total: number;
  items: RentabilidadItem[];
  manoDeObra: RentabilidadManoDeObra[];
}

export interface RentabilidadTotales {
  facturasCount: number;
  /** Sum of Factura.total — already net of descuento and inclusive of IVA. */
  totalFacturado: number;
  costoRepuestos: number;
  margen: number;
  margenPorcentaje: number;
  manoDeObraFacturada: number;
}

export function computeRentabilidad(facturas: RentabilidadFactura[]): RentabilidadTotales {
  let facturado = 0;
  let costo = 0;
  let manoDeObra = 0;

  for (const factura of facturas) {
    facturado += factura.total;
    for (const item of factura.items) {
      if (item.precioCompra !== null) {
        costo += item.cantidad * item.precioCompra;
      }
    }
    for (const linea of factura.manoDeObra) {
      manoDeObra += linea.horas * linea.precioHora;
    }
  }

  const totalFacturado = roundMoney(facturado);
  const costoRepuestos = roundMoney(costo);
  const margen = roundMoney(totalFacturado - costoRepuestos);

  return {
    facturasCount: facturas.length,
    totalFacturado,
    costoRepuestos,
    margen,
    margenPorcentaje: totalFacturado === 0 ? 0 : roundMoney((margen / totalFacturado) * 100),
    manoDeObraFacturada: roundMoney(manoDeObra),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reportes/rentabilidad.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reportes/rentabilidad.ts src/lib/reportes/rentabilidad.test.ts
git commit -m "fase5-task 4: add computeRentabilidad aggregation"
git push origin main
```

---

### Task 5: `computeProductividad` (`src/lib/reportes/productividad.ts`)

Groups delivered órdenes by `mecanicoId`, including a "Sin asignar" bucket for órdenes with `mecanicoId: null` (the column is nullable in the schema and `NuevaOrdenForm` offers an explicit "Sin asignar" option, so unassigned work is a real, expected case — dropping it would silently hide delivered work from the totals).

**Files:**
- Create: `src/lib/reportes/productividad.ts`
- Create: `src/lib/reportes/productividad.test.ts`

**Interfaces:**
- Consumes: `roundMoney` from `@/lib/money/round` (Task 1).
- Produces:
  - `interface ProductividadManoDeObra { horas: number; precioHora: number }`
  - `interface ProductividadOrden { mecanicoId: string | null; mecanicoNombre: string | null; manoDeObra: ProductividadManoDeObra[] }`
  - `interface ProductividadFila { mecanicoId: string | null; mecanicoNombre: string; ordenesCompletadas: number; horasManoDeObra: number; montoManoDeObra: number }`
  - `const SIN_ASIGNAR_LABEL = "Sin asignar"`
  - `computeProductividad(ordenes: ProductividadOrden[]): ProductividadFila[]`
  All consumed by Task 7 and rendered by Task 9.

- [ ] **Step 1: Write the failing test**

Create `src/lib/reportes/productividad.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeProductividad, SIN_ASIGNAR_LABEL } from "./productividad";

describe("computeProductividad", () => {
  it("returns an empty list for an empty range", () => {
    expect(computeProductividad([])).toEqual([]);
  });

  it("groups several órdenes under the same técnico and sums hours and amount", () => {
    const filas = computeProductividad([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 1.5, precioHora: 20 }] },
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 2, precioHora: 20 }] },
    ]);

    expect(filas).toEqual([
      {
        mecanicoId: "t1",
        mecanicoNombre: "Ana",
        ordenesCompletadas: 2,
        horasManoDeObra: 3.5,
        montoManoDeObra: 70,
      },
    ]);
  });

  it("buckets órdenes with no mecánico under 'Sin asignar' instead of dropping them", () => {
    const filas = computeProductividad([
      { mecanicoId: null, mecanicoNombre: null, manoDeObra: [{ horas: 1, precioHora: 40 }] },
    ]);

    expect(filas).toEqual([
      {
        mecanicoId: null,
        mecanicoNombre: SIN_ASIGNAR_LABEL,
        ordenesCompletadas: 1,
        horasManoDeObra: 1,
        montoManoDeObra: 40,
      },
    ]);
  });

  it("counts an orden with no mano de obra lines as completed with zero hours", () => {
    const filas = computeProductividad([{ mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [] }]);

    expect(filas[0]).toEqual({
      mecanicoId: "t1",
      mecanicoNombre: "Ana",
      ordenesCompletadas: 1,
      horasManoDeObra: 0,
      montoManoDeObra: 0,
    });
  });

  it("sorts by billed amount descending", () => {
    const filas = computeProductividad([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 1, precioHora: 10 }] },
      { mecanicoId: "t2", mecanicoNombre: "Beto", manoDeObra: [{ horas: 1, precioHora: 30 }] },
      { mecanicoId: null, mecanicoNombre: null, manoDeObra: [] },
    ]);

    expect(filas.map((fila) => fila.mecanicoNombre)).toEqual(["Beto", "Ana", SIN_ASIGNAR_LABEL]);
  });

  it("breaks amount ties alphabetically by name", () => {
    const filas = computeProductividad([
      { mecanicoId: "t2", mecanicoNombre: "Zoe", manoDeObra: [{ horas: 1, precioHora: 10 }] },
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 1, precioHora: 10 }] },
    ]);

    expect(filas.map((fila) => fila.mecanicoNombre)).toEqual(["Ana", "Zoe"]);
  });

  it("rounds hours and amount to two decimals", () => {
    const filas = computeProductividad([
      { mecanicoId: "t1", mecanicoNombre: "Ana", manoDeObra: [{ horas: 0.333, precioHora: 3 }] },
    ]);

    expect(filas[0].horasManoDeObra).toBe(0.33);
    expect(filas[0].montoManoDeObra).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/reportes/productividad.test.ts`
Expected: FAIL — `Failed to resolve import "./productividad"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/reportes/productividad.ts`:

```ts
import { roundMoney } from "@/lib/money/round";

export const SIN_ASIGNAR_LABEL = "Sin asignar";

/** Map key for the null-mecánico bucket; a cuid can never collide with it. */
const SIN_ASIGNAR_KEY = "__sin_asignar__";

export interface ProductividadManoDeObra {
  horas: number;
  precioHora: number;
}

export interface ProductividadOrden {
  mecanicoId: string | null;
  mecanicoNombre: string | null;
  manoDeObra: ProductividadManoDeObra[];
}

export interface ProductividadFila {
  mecanicoId: string | null;
  mecanicoNombre: string;
  ordenesCompletadas: number;
  horasManoDeObra: number;
  montoManoDeObra: number;
}

export function computeProductividad(ordenes: ProductividadOrden[]): ProductividadFila[] {
  const acumulado = new Map<string, ProductividadFila>();

  for (const orden of ordenes) {
    const clave = orden.mecanicoId ?? SIN_ASIGNAR_KEY;
    let fila = acumulado.get(clave);
    if (!fila) {
      fila = {
        mecanicoId: orden.mecanicoId,
        mecanicoNombre: orden.mecanicoNombre ?? SIN_ASIGNAR_LABEL,
        ordenesCompletadas: 0,
        horasManoDeObra: 0,
        montoManoDeObra: 0,
      };
      acumulado.set(clave, fila);
    }

    fila.ordenesCompletadas += 1;
    for (const linea of orden.manoDeObra) {
      fila.horasManoDeObra += linea.horas;
      fila.montoManoDeObra += linea.horas * linea.precioHora;
    }
  }

  return [...acumulado.values()]
    .map((fila) => ({
      ...fila,
      horasManoDeObra: roundMoney(fila.horasManoDeObra),
      montoManoDeObra: roundMoney(fila.montoManoDeObra),
    }))
    .sort(
      (a, b) =>
        b.montoManoDeObra - a.montoManoDeObra || a.mecanicoNombre.localeCompare(b.mecanicoNombre, "es"),
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/reportes/productividad.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reportes/productividad.ts src/lib/reportes/productividad.test.ts
git commit -m "fase5-task 5: add computeProductividad aggregation"
git push origin main
```

---

### Task 6: `getReporteRentabilidad` server action

First half of `src/app/actions/reporte-actions.ts`. Read-only, ADMIN-only, tenant-scoped through the already-validated session.

**Files:**
- Create: `src/app/actions/reporte-actions.ts`
- Create: `src/app/actions/reporte-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole` (`@/lib/auth/guards`), `getTenantDb` + `type TenantPrismaClient` (`@/lib/db/tenant-client`), `reporteFiltrosSchema` (Task 3), `buildRangoFechas` (Task 2), `computeRentabilidad` + `type RentabilidadTotales` (Task 4).
- Produces:
  - `interface ReporteFiltros { desde: string; hasta: string; sedeId?: string }`
  - `interface ReporteFiltrosAplicados { desde: string; hasta: string; sedeId: string | null }`
  - `interface ReporteRentabilidadResult { filtros: ReporteFiltrosAplicados; error: string | null; totales: RentabilidadTotales }`
  - `getReporteRentabilidad(filtros: ReporteFiltros): Promise<ReporteRentabilidadResult>`
  Consumed by Task 7 (reuses `ReporteFiltros`/`ReporteFiltrosAplicados` and the private `resolveSedeId`) and Task 8 (the page).

- [ ] **Step 1: Write the failing test**

Create `src/app/actions/reporte-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockSedeFindFirst = vi.fn();
const mockFacturaFindMany = vi.fn();
const mockOrdenFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    sede: { findFirst: mockSedeFindFirst },
    factura: { findMany: mockFacturaFindMany },
    ordenTrabajo: { findMany: mockOrdenFindMany },
  }),
}));

import { getReporteRentabilidad } from "./reporte-actions";

const FILTROS_VALIDOS = { desde: "2026-08-01", hasta: "2026-08-21" };

describe("getReporteRentabilidad", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockSedeFindFirst.mockReset().mockResolvedValue({ id: "sede-default" });
    mockFacturaFindMany.mockReset().mockResolvedValue([]);
  });

  it("is gated to ADMIN only", async () => {
    await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects an invalid range before touching the database", async () => {
    const result = await getReporteRentabilidad({ desde: "2026-08-22", hasta: "2026-08-21" });

    expect(result.error).toBe("La fecha inicial no puede ser posterior a la final");
    expect(result.totales.totalFacturado).toBe(0);
    expect(mockFacturaFindMany).not.toHaveBeenCalled();
  });

  it("falls back to the tenant's oldest sede when no sedeId is supplied", async () => {
    const result = await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockSedeFindFirst).toHaveBeenCalledWith({ orderBy: { createdAt: "asc" }, select: { id: true } });
    expect(result.filtros.sedeId).toBe("sede-default");
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: { gte: new Date("2026-08-01T00:00:00.000Z"), lt: new Date("2026-08-22T00:00:00.000Z") },
          orden: { sedeId: "sede-default" },
        },
      }),
    );
  });

  it("uses the explicit sedeId when supplied and does not look up a default", async () => {
    await getReporteRentabilidad({ ...FILTROS_VALIDOS, sedeId: "sede-norte" });

    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orden: { sedeId: "sede-norte" } }) }),
    );
  });

  it("returns zeroed totals without querying facturas when the tenant has no sede", async () => {
    mockSedeFindFirst.mockResolvedValue(null);

    const result = await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(result).toEqual({
      filtros: { desde: "2026-08-01", hasta: "2026-08-21", sedeId: null },
      error: null,
      totales: {
        facturasCount: 0,
        totalFacturado: 0,
        costoRepuestos: 0,
        margen: 0,
        margenPorcentaje: 0,
        manoDeObraFacturada: 0,
      },
    });
    expect(mockFacturaFindMany).not.toHaveBeenCalled();
  });

  it("converts Prisma Decimals to numbers and aggregates them", async () => {
    mockFacturaFindMany.mockResolvedValue([
      {
        total: "140.18",
        orden: {
          items: [
            { cantidad: 4, repuesto: null },
            { cantidad: 2, repuesto: { precioCompra: "8" } },
          ],
          manoDeObra: [{ horas: "1.5", precioHora: "20" }],
        },
      },
    ]);

    const result = await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(result.error).toBeNull();
    expect(result.totales).toEqual({
      facturasCount: 1,
      totalFacturado: 140.18,
      costoRepuestos: 16,
      margen: 124.18,
      margenPorcentaje: 88.59,
      manoDeObraFacturada: 30,
    });
  });

  it("projects only the columns it needs, never a whole Usuario or a bare include", async () => {
    await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockFacturaFindMany).toHaveBeenCalledWith({
      where: expect.anything(),
      select: {
        total: true,
        orden: {
          select: {
            items: { select: { cantidad: true, repuesto: { select: { precioCompra: true } } } },
            manoDeObra: { select: { horas: true, precioHora: true } },
          },
        },
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/actions/reporte-actions.test.ts`
Expected: FAIL — `Failed to resolve import "./reporte-actions"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/actions/reporte-actions.ts`:

```ts
"use server";

import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import type { TenantPrismaClient } from "@/lib/db/tenant-client";
import { reporteFiltrosSchema } from "@/lib/validation/reporte";
import { buildRangoFechas } from "@/lib/reportes/rango-fechas";
import { computeRentabilidad, type RentabilidadTotales } from "@/lib/reportes/rentabilidad";

/** Raw filters as they arrive from the URL. The date range is mandatory. */
export interface ReporteFiltros {
  desde: string;
  hasta: string;
  sedeId?: string;
}

/** Filters actually applied, with the default sede already resolved. */
export interface ReporteFiltrosAplicados {
  desde: string;
  hasta: string;
  sedeId: string | null;
}

export interface ReporteRentabilidadResult {
  filtros: ReporteFiltrosAplicados;
  error: string | null;
  totales: RentabilidadTotales;
}

/**
 * Fase 5 ships with a single Sede per tenant, but every report query applies
 * an explicit sedeId so Fase 6 can activate the multi-sede selector without
 * touching this module. Same default-sede rule as createOrdenAction.
 */
async function resolveSedeId(tenantDb: TenantPrismaClient, sedeId?: string): Promise<string | null> {
  if (sedeId) return sedeId;
  const sede = await tenantDb.sede.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return sede?.id ?? null;
}

export async function getReporteRentabilidad(filtros: ReporteFiltros): Promise<ReporteRentabilidadResult> {
  // Guard first: this is a read-only endpoint, there is nothing to parse for
  // an unauthorized caller. Rentabilidad exposes cost and margin — ADMIN only.
  const session = await requireRole(["ADMIN"]);

  const parsed = reporteFiltrosSchema.safeParse({
    desde: filtros.desde,
    hasta: filtros.hasta,
    sedeId: filtros.sedeId ?? "",
  });
  if (!parsed.success) {
    return {
      filtros: { desde: filtros.desde, hasta: filtros.hasta, sedeId: filtros.sedeId ?? null },
      error: parsed.error.issues[0]?.message ?? "Filtros inválidos",
      totales: computeRentabilidad([]),
    };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = await resolveSedeId(tenantDb, parsed.data.sedeId || undefined);
  const aplicados: ReporteFiltrosAplicados = {
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    sedeId,
  };

  // No sede means the tenant has no órdenes at all (OrdenTrabajo.sedeId is
  // required), so zeroes are the correct answer, not an error.
  if (!sedeId) {
    return { filtros: aplicados, error: null, totales: computeRentabilidad([]) };
  }

  const rango = buildRangoFechas(parsed.data.desde, parsed.data.hasta);
  const facturas = await tenantDb.factura.findMany({
    where: {
      createdAt: { gte: rango.gte, lt: rango.lt },
      orden: { sedeId },
    },
    select: {
      total: true,
      orden: {
        select: {
          items: { select: { cantidad: true, repuesto: { select: { precioCompra: true } } } },
          manoDeObra: { select: { horas: true, precioHora: true } },
        },
      },
    },
  });

  const totales = computeRentabilidad(
    facturas.map((factura) => ({
      total: Number(factura.total),
      items: factura.orden.items.map((item) => ({
        cantidad: item.cantidad,
        precioCompra: item.repuesto ? Number(item.repuesto.precioCompra) : null,
      })),
      manoDeObra: factura.orden.manoDeObra.map((linea) => ({
        horas: Number(linea.horas),
        precioHora: Number(linea.precioHora),
      })),
    })),
  );

  return { filtros: aplicados, error: null, totales };
}
```

Note the `import type { TenantPrismaClient }` on its own line: a `"use server"` module may only *export* async functions, and a type-only import is erased at compile time so the `vi.mock` factory in the test does not need to provide it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/actions/reporte-actions.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/reporte-actions.ts src/app/actions/reporte-actions.test.ts
git commit -m "fase5-task 6: add getReporteRentabilidad action"
git push origin main
```

---

### Task 7: `getReporteProductividad` server action

Second half of the same file, reusing `ReporteFiltros`, `ReporteFiltrosAplicados`, and the private `resolveSedeId` helper defined in Task 6.

**Files:**
- Modify: `src/app/actions/reporte-actions.ts`
- Modify: `src/app/actions/reporte-actions.test.ts`

**Interfaces:**
- Consumes: everything Task 6 produced, plus `computeProductividad` + `type ProductividadFila` (Task 5).
- Produces:
  - `interface ReporteProductividadResult { filtros: ReporteFiltrosAplicados; error: string | null; filas: ProductividadFila[] }`
  - `getReporteProductividad(filtros: ReporteFiltros): Promise<ReporteProductividadResult>`
  Consumed by Task 9 (the page).

- [ ] **Step 1: Write the failing test**

Append to `src/app/actions/reporte-actions.test.ts`. Also widen the existing import line at the top of that file from

```ts
import { getReporteRentabilidad } from "./reporte-actions";
```

to

```ts
import { getReporteRentabilidad, getReporteProductividad } from "./reporte-actions";
```

then append this block at the end of the file:

```ts
describe("getReporteProductividad", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockSedeFindFirst.mockReset().mockResolvedValue({ id: "sede-default" });
    mockOrdenFindMany.mockReset().mockResolvedValue([]);
  });

  it("is gated to ADMIN only", async () => {
    await getReporteProductividad(FILTROS_VALIDOS);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects an invalid range before touching the database", async () => {
    const result = await getReporteProductividad({ desde: "2026-13-01", hasta: "2026-08-21" });

    expect(result.error).toBe("La fecha debe tener el formato AAAA-MM-DD");
    expect(result.filas).toEqual([]);
    expect(mockOrdenFindMany).not.toHaveBeenCalled();
  });

  it("queries only ENTREGADA órdenes delivered inside the range for the resolved sede", async () => {
    await getReporteProductividad(FILTROS_VALIDOS);

    expect(mockOrdenFindMany).toHaveBeenCalledWith({
      where: {
        sedeId: "sede-default",
        estado: "ENTREGADA",
        entregadaAt: { gte: new Date("2026-08-01T00:00:00.000Z"), lt: new Date("2026-08-22T00:00:00.000Z") },
      },
      select: {
        mecanicoId: true,
        mecanico: { select: { nombre: true } },
        manoDeObra: { select: { horas: true, precioHora: true } },
      },
    });
  });

  it("uses the explicit sedeId when supplied", async () => {
    await getReporteProductividad({ ...FILTROS_VALIDOS, sedeId: "sede-norte" });

    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockOrdenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sedeId: "sede-norte" }) }),
    );
  });

  it("returns an empty list without querying órdenes when the tenant has no sede", async () => {
    mockSedeFindFirst.mockResolvedValue(null);

    const result = await getReporteProductividad(FILTROS_VALIDOS);

    expect(result).toEqual({
      filtros: { desde: "2026-08-01", hasta: "2026-08-21", sedeId: null },
      error: null,
      filas: [],
    });
    expect(mockOrdenFindMany).not.toHaveBeenCalled();
  });

  it("converts Decimals to numbers and groups by técnico, keeping unassigned work visible", async () => {
    mockOrdenFindMany.mockResolvedValue([
      { mecanicoId: "t1", mecanico: { nombre: "Ana" }, manoDeObra: [{ horas: "1.5", precioHora: "20" }] },
      { mecanicoId: "t1", mecanico: { nombre: "Ana" }, manoDeObra: [{ horas: "2", precioHora: "20" }] },
      { mecanicoId: null, mecanico: null, manoDeObra: [] },
    ]);

    const result = await getReporteProductividad(FILTROS_VALIDOS);

    expect(result.error).toBeNull();
    expect(result.filas).toEqual([
      {
        mecanicoId: "t1",
        mecanicoNombre: "Ana",
        ordenesCompletadas: 2,
        horasManoDeObra: 3.5,
        montoManoDeObra: 70,
      },
      {
        mecanicoId: null,
        mecanicoNombre: "Sin asignar",
        ordenesCompletadas: 1,
        horasManoDeObra: 0,
        montoManoDeObra: 0,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/actions/reporte-actions.test.ts`
Expected: FAIL — `getReporteProductividad is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/app/actions/reporte-actions.ts`, extend the import block with the productividad module:

```ts
import { computeRentabilidad, type RentabilidadTotales } from "@/lib/reportes/rentabilidad";
import { computeProductividad, type ProductividadFila } from "@/lib/reportes/productividad";
```

Then append at the end of the file:

```ts
export interface ReporteProductividadResult {
  filtros: ReporteFiltrosAplicados;
  error: string | null;
  filas: ProductividadFila[];
}

/**
 * Anchored on entregadaAt (stamped by updateEstadoOrdenAction on the
 * TERMINADA -> ENTREGADA transition), deliberately NOT on Factura.createdAt:
 * this report answers "who delivered what in this window". An ENTREGADA orden
 * has no outgoing transition and cannot be mutated once invoiced, so its
 * ManoDeObra lines are final.
 */
export async function getReporteProductividad(filtros: ReporteFiltros): Promise<ReporteProductividadResult> {
  const session = await requireRole(["ADMIN"]);

  const parsed = reporteFiltrosSchema.safeParse({
    desde: filtros.desde,
    hasta: filtros.hasta,
    sedeId: filtros.sedeId ?? "",
  });
  if (!parsed.success) {
    return {
      filtros: { desde: filtros.desde, hasta: filtros.hasta, sedeId: filtros.sedeId ?? null },
      error: parsed.error.issues[0]?.message ?? "Filtros inválidos",
      filas: [],
    };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = await resolveSedeId(tenantDb, parsed.data.sedeId || undefined);
  const aplicados: ReporteFiltrosAplicados = {
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    sedeId,
  };

  if (!sedeId) {
    return { filtros: aplicados, error: null, filas: [] };
  }

  const rango = buildRangoFechas(parsed.data.desde, parsed.data.hasta);
  const ordenes = await tenantDb.ordenTrabajo.findMany({
    where: {
      sedeId,
      estado: "ENTREGADA",
      entregadaAt: { gte: rango.gte, lt: rango.lt },
    },
    select: {
      mecanicoId: true,
      // select-only: never pull the whole Usuario row (passwordHash leak class).
      mecanico: { select: { nombre: true } },
      manoDeObra: { select: { horas: true, precioHora: true } },
    },
  });

  const filas = computeProductividad(
    ordenes.map((orden) => ({
      mecanicoId: orden.mecanicoId,
      mecanicoNombre: orden.mecanico?.nombre ?? null,
      manoDeObra: orden.manoDeObra.map((linea) => ({
        horas: Number(linea.horas),
        precioHora: Number(linea.precioHora),
      })),
    })),
  );

  return { filtros: aplicados, error: null, filas };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/actions/reporte-actions.test.ts`
Expected: PASS — 13 tests (7 from Task 6 + 6 new).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/reporte-actions.ts src/app/actions/reporte-actions.test.ts
git commit -m "fase5-task 7: add getReporteProductividad action"
git push origin main
```

---

### Task 8: `/reportes` page — date-range form, rentabilidad section, nav link

Plain RSC page, no `"use client"` component and therefore no component test (established precedent: `/ordenes`, `/facturas`, `/bodegas`). The filter is a native GET `<form>` writing to `searchParams` — the same query-param filtering approach `/ordenes` and `/facturas` already use with `<Link>`, extended to a form because a date range needs two inputs rather than a fixed set of links.

**Files:**
- Create: `src/app/(dashboard)/reportes/page.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `getReporteRentabilidad` + `type ReporteFiltros` (Task 6), `rangoMesActual` (Task 2).
- Produces: the `/reportes` route and the ADMIN-only nav link. Task 9 extends the same page file.

- [ ] **Step 1: Create the page**

Create `src/app/(dashboard)/reportes/page.tsx`:

```tsx
import { getReporteRentabilidad, type ReporteFiltros } from "@/app/actions/reporte-actions";
import { rangoMesActual } from "@/lib/reportes/rango-fechas";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sedeId?: string }>;
}) {
  const { desde, hasta, sedeId } = await searchParams;
  const porDefecto = rangoMesActual(new Date());
  const filtros: ReporteFiltros = {
    desde: desde || porDefecto.desde,
    hasta: hasta || porDefecto.hasta,
    sedeId: sedeId || undefined,
  };

  const rentabilidad = await getReporteRentabilidad(filtros);

  return (
    <main>
      <h1>Reportes</h1>

      <form method="get" action="/reportes">
        <label htmlFor="desde">Desde</label>
        <input id="desde" name="desde" type="date" defaultValue={filtros.desde} required />

        <label htmlFor="hasta">Hasta</label>
        <input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} required />

        {/*
          Fase 5 has no sede selector on purpose (that is Fase 6). The hidden
          input keeps an explicit sedeId in the URL round-tripping through the
          form so the query-param plumbing is already complete end to end.
        */}
        {filtros.sedeId ? <input type="hidden" name="sedeId" value={filtros.sedeId} /> : null}

        <button type="submit">Aplicar</button>
      </form>

      {rentabilidad.error ? <p role="alert">{rentabilidad.error}</p> : null}

      <h2>Rentabilidad</h2>
      <p>
        Rango: {rentabilidad.filtros.desde} a {rentabilidad.filtros.hasta}
      </p>
      <p>Facturas emitidas: {rentabilidad.totales.facturasCount}</p>
      <p>Total facturado: {rentabilidad.totales.totalFacturado}</p>
      <p>Costo de repuestos: {rentabilidad.totales.costoRepuestos}</p>
      <p>Margen bruto: {rentabilidad.totales.margen}</p>
      <p>Margen bruto (%): {rentabilidad.totales.margenPorcentaje}</p>
      <p>Mano de obra facturada: {rentabilidad.totales.manoDeObraFacturada}</p>
    </main>
  );
}
```

`Margen bruto:` and `Margen bruto (%):` are deliberately distinct label prefixes so the e2e (Task 11) can target each with an unambiguous substring.

- [ ] **Step 2: Add the ADMIN-only nav link**

In `src/app/(dashboard)/layout.tsx`, add one entry at the end of the existing `<nav>` block. The nav must become:

```tsx
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/clientes">Clientes</Link>
          <Link href="/ordenes">Órdenes</Link>
          <Link href="/bodegas">Bodegas</Link>
          <Link href="/proveedores">Proveedores</Link>
          <Link href="/repuestos">Repuestos</Link>
          <Link href="/entradas-mercancia">Entradas</Link>
          <Link href="/facturas">Facturas</Link>
          {session.user.role === "ADMIN" ? <Link href="/reportes">Reportes</Link> : null}
        </nav>
```

`session` is already in scope from the existing `const session = await requireSession();` at the top of the layout — no other change to that file. The link is cosmetic; the real boundary is `requireRole(["ADMIN"])` inside the actions.

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green (no new unit tests in this task — plain RSC page precedent; coverage arrives in Task 11's e2e).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/reportes/page.tsx" "src/app/(dashboard)/layout.tsx"
git commit -m "fase5-task 8: add /reportes page with rentabilidad and nav link"
git push origin main
```

---

### Task 9: Productividad table on `/reportes`

**Files:**
- Modify: `src/app/(dashboard)/reportes/page.tsx`

**Interfaces:**
- Consumes: `getReporteProductividad` (Task 7), whose `filas` are `ProductividadFila[]` (Task 5).
- Produces: the rendered productividad `<table>` that Task 11's e2e asserts against.

- [ ] **Step 1: Extend the page**

In `src/app/(dashboard)/reportes/page.tsx`, widen the import to include the productividad action:

```tsx
import {
  getReporteProductividad,
  getReporteRentabilidad,
  type ReporteFiltros,
} from "@/app/actions/reporte-actions";
```

Then add a second sequential `await` right after the rentabilidad one:

```tsx
  const rentabilidad = await getReporteRentabilidad(filtros);
  const productividad = await getReporteProductividad(filtros);
```

Sequential rather than `Promise.all` on purpose: both actions call `requireRole`, which calls `redirect()` on failure, and `redirect()` works by throwing a control-flow error — running them concurrently would leave the second rejection unhandled.

Finally, append this block just before the closing `</main>`, after the `Mano de obra facturada` line:

```tsx
      <h2>Productividad por técnico</h2>
      {productividad.filas.length === 0 ? (
        <p>No hay órdenes entregadas en este rango.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Técnico</th>
              <th scope="col">Órdenes entregadas</th>
              <th scope="col">Horas</th>
              <th scope="col">Mano de obra</th>
            </tr>
          </thead>
          <tbody>
            {productividad.filas.map((fila) => (
              <tr key={fila.mecanicoId ?? "sin-asignar"}>
                <td>{fila.mecanicoNombre}</td>
                <td>{fila.ordenesCompletadas}</td>
                <td>{fila.horasManoDeObra}</td>
                <td>{fila.montoManoDeObra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
```

- [ ] **Step 2: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/reportes/page.tsx"
git commit -m "fase5-task 9: add productividad table to /reportes"
git push origin main
```

---

### Task 10: Seed a TECNICO user for e2e and assign a mecánico to the smoke-test orden

The existing e2e provisions exactly one `ADMIN` user, and the smoke-test orden is created with no mecánico. Task 11 needs both a real técnico (so productividad has a named row) and a non-ADMIN login (for the role-gate assertion). This task adds them **without changing any existing assertion**, so a failure here is unambiguously a seeding problem rather than a reporting one.

**Files:**
- Modify: `e2e/global-setup.ts`
- Modify: `e2e/tenant-flow.spec.ts:99-103` (the "Crear orden" block)

**Interfaces:**
- Consumes: `seedTenantUser` (already supports a `role` argument: `scripts/seed-tenant-user.ts`).
- Produces: `E2E_TECNICO_EMAIL`, `E2E_TECNICO_PASSWORD`, `E2E_TECNICO_NOMBRE` exported from `e2e/global-setup.ts`, plus a smoke-test orden whose `mecanicoId` points at that técnico. All consumed by Task 11.

- [ ] **Step 1: Seed the TECNICO user**

In `e2e/global-setup.ts`, add three exported constants next to the existing admin ones:

```ts
export const E2E_ADMIN_EMAIL = "admin@e2e-smoke.test";
export const E2E_ADMIN_PASSWORD = "SmokeTest123!";
export const E2E_TECNICO_EMAIL = "tecnico@e2e-smoke.test";
export const E2E_TECNICO_PASSWORD = "SmokeTest123!";
export const E2E_TECNICO_NOMBRE = "Tec E2E";
```

and a second `seedTenantUser` call right after the existing one, inside `globalSetup`:

```ts
  await seedTenantUser({
    schemaName: E2E_SCHEMA,
    email: E2E_ADMIN_EMAIL,
    password: E2E_ADMIN_PASSWORD,
    nombre: "Admin E2E",
    role: "ADMIN",
  });
  await seedTenantUser({
    schemaName: E2E_SCHEMA,
    email: E2E_TECNICO_EMAIL,
    password: E2E_TECNICO_PASSWORD,
    nombre: E2E_TECNICO_NOMBRE,
    role: "TECNICO",
  });
```

- [ ] **Step 2: Assign the mecánico when creating the smoke-test orden**

In `e2e/tenant-flow.spec.ts`, find the existing block:

```ts
  await page.getByLabel("Kilometraje de ingreso").fill("45000");
  await page.getByLabel("Síntomas reportados").fill("Ruido al frenar");
  await page.getByRole("button", { name: "Crear orden" }).click();
```

and insert one line before the click so the orden gets a real `mecanicoId` (the select is `NuevaOrdenForm`'s "Mecánico asignado", populated by `listTecnicos()`, which returns exactly the `role: "TECNICO"` users):

```ts
  await page.getByLabel("Kilometraje de ingreso").fill("45000");
  await page.getByLabel("Síntomas reportados").fill("Ruido al frenar");
  await page.getByLabel("Mecánico asignado").selectOption({ label: "Tec E2E" });
  await page.getByRole("button", { name: "Crear orden" }).click();
```

- [ ] **Step 3: Run the e2e suite to confirm nothing regressed**

Run: `npx playwright test`
Expected: 2/2 passing — the same two specs as before, with the orden now carrying a mecánico. If this fails, the cause is the new seed or the new `selectOption`, nothing else changed.

- [ ] **Step 4: Commit**

```bash
git add e2e/global-setup.ts e2e/tenant-flow.spec.ts
git commit -m "fase5-task 10: seed e2e TECNICO user and assign mecanico"
git push origin main
```

---

### Task 11: Extend the e2e through `/reportes` and the ADMIN role gate

Appended to the end of the existing `e2e/tenant-flow.spec.ts` flow, right after the final `ENTREGADA` transition and stock re-check. It reuses the fixture amounts that spec already produced — no new numbers are invented:

| Source | Value |
| --- | --- |
| `Factura.total` (subtotal 127.8 − descuento 10 → base 117.8 + IVA 22.38) | `140.18` |
| Catalog part cost: 2 × `FRN-001` at `precioCompra` 8 | `16` |
| Margen: 140.18 − 16 | `124.18` |
| Mano de obra: 1.5 h × 20 | `30` |
| Órdenes entregadas by "Tec E2E" | `1` |

**Files:**
- Modify: `e2e/tenant-flow.spec.ts` (append at the end of the existing test)

**Interfaces:**
- Consumes: `E2E_TECNICO_EMAIL`, `E2E_TECNICO_PASSWORD` (Task 10), the `/reportes` page (Tasks 8–9), the ADMIN nav link (Task 8), and `getLoginErrorMessage`'s existing `"forbidden"` copy.
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Widen the import at the top of the spec**

`e2e/tenant-flow.spec.ts` currently starts with:

```ts
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";
```

Change it to:

```ts
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_TECNICO_EMAIL, E2E_TECNICO_PASSWORD } from "./global-setup";
```

- [ ] **Step 2: Append the reportes segment**

Add this at the very end of the existing test body, after the last `await expect(page.getByText(/FRN-001.*stock: 18/)).toBeVisible();`:

```ts
  // --- Fase 5: Dashboard y reportes básicos ---

  // The ADMIN sees the nav entry; the default range is the current month to
  // date, which covers everything this spec just created.
  await expect(page.getByRole("link", { name: "Reportes" })).toBeVisible();
  await page.getByRole("link", { name: "Reportes" }).click();
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();

  await expect(page.getByText("Facturas emitidas: 1")).toBeVisible();
  await expect(page.getByText("Total facturado: 140.18")).toBeVisible();
  await expect(page.getByText("Costo de repuestos: 16")).toBeVisible();
  await expect(page.getByText("Margen bruto: 124.18")).toBeVisible();
  await expect(page.getByText("Mano de obra facturada: 30")).toBeVisible();

  const filaTecnico = page.getByRole("row").filter({ hasText: "Tec E2E" });
  await expect(filaTecnico).toContainText("1.5");
  await expect(filaTecnico).toContainText("30");

  // An explicit range that still contains today's fixtures must produce the
  // same numbers — proves the GET form actually round-trips through searchParams.
  const hoy = new Date();
  const aIso = (fecha: Date) => fecha.toISOString().slice(0, 10);
  const primerDiaDelMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));

  await page.getByLabel("Desde").fill(aIso(primerDiaDelMes));
  await page.getByLabel("Hasta").fill(aIso(hoy));
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/\/reportes\?desde=/);
  await expect(page.getByText("Total facturado: 140.18")).toBeVisible();

  // A range that excludes today's fixtures must zero out — proves the date
  // filter really filters instead of always returning every row.
  await page.getByLabel("Desde").fill("2020-01-01");
  await page.getByLabel("Hasta").fill("2020-01-31");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText("Facturas emitidas: 0")).toBeVisible();
  await expect(page.getByText("Total facturado: 0")).toBeVisible();
  await expect(page.getByText("No hay órdenes entregadas en este rango.")).toBeVisible();

  // An inverted range is rejected by the schema, not silently swapped.
  await page.getByLabel("Desde").fill("2026-08-22");
  await page.getByLabel("Hasta").fill("2026-08-21");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("alert")).toHaveText("La fecha inicial no puede ser posterior a la final");

  // --- Fase 5: role gate — reportes son solo para ADMIN ---

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Correo").fill(E2E_TECNICO_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_TECNICO_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/clientes$/);

  await expect(page.getByRole("link", { name: "Reportes" })).toHaveCount(0);

  await page.goto("/reportes");
  await expect(page).toHaveURL(/\/login\?error=forbidden/);
  await expect(page.getByRole("alert")).toHaveText("No tienes permiso para acceder a esa sección.");
```

- [ ] **Step 3: Run the e2e suite**

Run: `npx playwright test`
Expected: 2/2 passing.

- [ ] **Step 4: Full verification pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full unit suite green.

Per `RULES.md` #1, if any of the three commands fails, make at most one correction attempt and then stop and report. Per `RULES.md` #2, do not sit waiting on the Playwright dev server — if it does not come up promptly, report and ask.

- [ ] **Step 5: Commit**

```bash
git add e2e/tenant-flow.spec.ts
git commit -m "fase5-task 11: extend e2e through reportes and ADMIN role gate"
git push origin main
```

---

## Self-Review

**Spec coverage**

| Scope item | Task(s) |
| --- | --- |
| Total facturado (sum of `Factura.total` in range) | 4, 6, 8 |
| Costo de repuestos vendidos (`precioCompra` × `cantidad` for catalog-linked `ItemOrden`) | 4, 6, 8 |
| Margen (facturado − costo) | 4, 6, 8 |
| Mano de obra facturada in range | 4, 6, 8 |
| Productividad: órdenes ENTREGADA per técnico via `OrdenTrabajo.mecanicoId` | 5, 7, 9 |
| Productividad: horas / monto de mano de obra per técnico | 5, 7, 9 |
| `sedeId` filter accepted and applied by every report action | 3, 6, 7 (+ hidden input in 8) |
| Date-range filter, obligatorio | 2, 3, 6, 7, 8 |
| Field-name verification against the real schema | Done during investigation: `OrdenTrabajo.mecanicoId` (`String?`, `@map("mecanico_id")`), `OrdenTrabajo.entregadaAt`/`anuladaAt` (`DateTime?`), `Factura.createdAt`, `Repuesto.precioCompra` (`Decimal(10,2)`), `ManoDeObra.horas`/`precioHora` (`Decimal(5,2)`/`Decimal(10,2)`), `Usuario.role` enum `ADMIN|TECNICO|RECEPCION` — all reflected verbatim in Tasks 6/7 |
| Explicit ADMIN role gate, documented as a decision | Global Constraints + Tasks 6, 7, 8, 11 |
| `/reportes` URL under the `(dashboard)` route group | 8 |
| No charting/date dependency added | Global Constraints (verified against `package.json`) |
| Nav link | 8 |
| e2e extension reusing existing fixture amounts + negative-role assertion | 10, 11 |

**Placeholder scan:** no TBD/TODO, no "add validation here", no "similar to Task N". Every code step carries the literal content to write; every command carries its expected output.

**Type consistency:** `roundMoney` (T1) is the single rounding function used by T4 and T5. `RangoFechas`/`buildRangoFechas`/`rangoMesActual` (T2) are consumed with those exact names in T6, T7, T8. `reporteFiltrosSchema` (T3) is used identically in T6 and T7, and its three error strings (`"La fecha debe tener el formato AAAA-MM-DD"`, `"La fecha no existe en el calendario"`, `"La fecha inicial no puede ser posterior a la final"`) are asserted verbatim in T3, T7, and T11. `RentabilidadTotales`'s six field names (T4) match the six `<p>` lines in T8 and the six-key `toEqual` in T6. `ProductividadFila`'s five field names (T5) match the four `<td>`s plus the key in T9 and the `toEqual` in T7. `ReporteFiltros`/`ReporteFiltrosAplicados`/`resolveSedeId` are defined once in T6 and reused (not redefined) in T7. `SIN_ASIGNAR_LABEL` is `"Sin asignar"` in T5 and asserted as that literal string in T7.

**Cross-check of the e2e numbers against this plan's own math:** `computeRentabilidad([{ total: 140.18, items: [{4, null}, {2, 8}], manoDeObra: [{1.5, 20}] }])` in T4's test returns exactly the five values T11 asserts in the browser, and `computeProductividad` with one Ana-shaped orden returns the `1.5` / `30` T11 asserts in the table row.
