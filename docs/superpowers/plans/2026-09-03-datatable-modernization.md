# DataTable Modernization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Make every list-style table's whole row clickable using the already-proven `rowHref` "stretched link" pattern in `src/components/data-table.tsx`, instead of the current per-cell manual `<Link>` in 4 files. (2) Right-align numeric/monetary columns consistently across every `DataTable` consumer. (3) Add server-side, URL-driven column sorting to the two most-consulted list pages (Órdenes, Facturas).

**Architecture:** `DataTable`'s `rowHref?: (row: T) => string` prop already renders a `relative cursor-pointer` row with an absolutely-positioned `<Link inset-0>` inside the first column's cell, plus a `sr-only` "Ver detalle" label — proven correct today in `citas/page.tsx`, `vehiculos/[id]/page.tsx`, and `clientes/[id]/page.tsx`. Fase 1 converts the 4 remaining files that instead hand-roll a `<Link>` inside one column.

Fase 2 needs one small, additive change to `DataTable` itself: today `column.className` is applied only to `TableCell`, never to `TableHead`, so a right-aligned cell would sit under a left-aligned header. Task 6 fixes this (confirmed with the user — approved as the minimal necessary change, does not alter behavior for any column that doesn't set `className`).

Fase 3 (sorting) has an open design point flagged in its own section below — resolve it before starting Task 13.

**Tech Stack:** Next.js App Router (Server + Client Components), Prisma, Vitest + Testing Library, Playwright (e2e), Tailwind.

## Global Constraints

- Strict TDD Mode is active (CLAUDE.md): red-then-green for every behavioral change. `DataTable` itself has no dedicated test file today (confirmed by investigation) — if Task 6 changes its behavior, add one; if a task only changes a consumer page, that page's own existing test conventions apply (most list pages in this app have no dedicated unit test — do not invent one where the established precedent has none, per this session's own prior finding on `reportes/page.tsx`).
- RULES.md: commit + push immediately after each task, one task per commit, max 1 correction attempt per task before stopping and reporting. Fix any e2e locator broken by a task in the **same commit** as that task, per the user's explicit instruction.
- Every commit message in this plan MUST end with (per the active session-level override):
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NXXaNsNpy63Seos9ngJWjL
  ```
- Run `npx tsc --noEmit` and the task's own affected test file(s) at the end of every task. Run the full suite (`npx vitest run`) only at each phase's dedicated verification task.
- Do not touch `src/components/ui/table.tsx`, `src/components/ui/combobox.tsx`, `src/components/ui/select-field.tsx`, or any file not explicitly listed in a task below.
- Report status at the end of each Fase before starting the next one (per RULES.md).

---

## FASE 1 — Fila completa clicable (rowHref)

### Task 1: `ordenes/page.tsx` → rowHref

**File:** `src/app/(dashboard)/ordenes/page.tsx`

Current "Orden" column:
```tsx
{
  header: "Orden",
  cell: (orden) => (
    <Link href={`/ordenes/${orden.id}`} className="font-mono text-sm font-medium hover:underline">
      #{orden.id.slice(-8).toUpperCase()}
    </Link>
  ),
},
```
Change to a plain (non-link) cell, and add `rowHref` to the `<DataTable>` call:
```tsx
{
  header: "Orden",
  cell: (orden) => <span className="font-mono text-sm font-medium">#{orden.id.slice(-8).toUpperCase()}</span>,
},
```
```tsx
<DataTable
  columns={COLUMNS}
  rows={filtradas}
  getRowKey={(orden) => orden.id}
  emptyMessage="No hay órdenes de trabajo en este estado."
  rowHref={(orden) => `/ordenes/${orden.id}`}
/>
```
Remove the now-unused `Link` import if nothing else in the file uses it (check first — this file may use `Link` elsewhere, e.g. the kanban view; if so, keep the import). The kanban/tablero view (`vista=tablero`) is a separate hand-rolled card layout, not `DataTable` — do not touch it.

Reference precedent: `vehiculos/[id]/page.tsx`'s `ORDENES_COLUMNS` + `rowHref={(orden) => \`/ordenes/${orden.id}\`}` does exactly this shape already — read it for the exact doc-comment wording to mirror ("The whole row is clickable via DataTable's rowHref...").

- [ ] Task 1 complete

### Task 2: `facturas/page.tsx` → rowHref

**File:** `src/app/(dashboard)/facturas/page.tsx`

Same transformation as Task 1, applied to the "Factura" column:
```tsx
// before
{
  header: "Factura",
  cell: (factura) => (
    <Link href={`/facturas/${factura.id}`} className="font-mono text-sm font-medium hover:underline">
      #{factura.numero}
    </Link>
  ),
},
// after
{
  header: "Factura",
  cell: (factura) => <span className="font-mono text-sm font-medium">#{factura.numero}</span>,
},
```
Add `rowHref={(factura) => \`/facturas/${factura.id}\`}` to the `<DataTable>` call. Remove the `Link` import only if nothing else in the file needs it.

- [ ] Task 2 complete

### Task 3: `entradas-mercancia/page.tsx` → rowHref

**File:** `src/app/(dashboard)/entradas-mercancia/page.tsx`

Same transformation, applied to the "Entrada" column:
```tsx
// before
{
  header: "Entrada",
  cell: (entrada) => (
    <Link href={`/entradas-mercancia/${entrada.id}`} className="font-mono text-sm font-medium hover:underline">
      #{entrada.id.slice(-8).toUpperCase()}
    </Link>
  ),
},
// after
{
  header: "Entrada",
  cell: (entrada) => <span className="font-mono text-sm font-medium">#{entrada.id.slice(-8).toUpperCase()}</span>,
},
```
Add `rowHref={(entrada) => \`/entradas-mercancia/${entrada.id}\`}` to the `<DataTable>` call. Remove the `Link` import only if nothing else in the file needs it.

- [ ] Task 3 complete

### Task 4: `clientes/clientes-table.tsx` → rowHref + e2e locator fix

**File:** `src/app/(dashboard)/clientes/clientes-table.tsx` (Client Component — `rowHref` works identically here, it's just a plain `(row) => string` function, no serialization boundary issue).

Current "Cliente" column:
```tsx
{
  header: "Cliente",
  cell: (cliente) => (
    <Link href={`/clientes/${cliente.id}`} className="flex flex-col gap-0.5">
      <span className="font-medium">{cliente.nombre}</span>
      <span className="text-xs text-muted-foreground">{cliente.documento ?? "—"}</span>
    </Link>
  ),
},
```
Change to:
```tsx
{
  header: "Cliente",
  cell: (cliente) => (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{cliente.nombre}</span>
      <span className="text-xs text-muted-foreground">{cliente.documento ?? "—"}</span>
    </div>
  ),
},
```
Add `rowHref={(cliente) => \`/clientes/${cliente.id}\`}` to the `<DataTable>` call. Remove the `Link` import if nothing else in the file needs it.

**Same-commit e2e fix** (`e2e/tenant-flow.spec.ts`) — this column's accessible link name changes from "Juan Pérez —" (visible link text) to "Ver detalle" (the new sr-only text), so both of these break:
```
73:  await page.getByRole("link", { name: "Juan Pérez" }).click();
356: await expect(page.getByRole("link", { name: "Juan Pérez" })).toBeVisible();
```
Fix line 73 (a click that must still navigate to the client's detail page) to a row-scoped locator, e.g.:
```ts
await page.getByRole("row", { name: /Juan Pérez/ }).click();
```
Fix line 356 (an assertion that the client is visible in the list) to a text-based assertion instead of a link-role one, e.g.:
```ts
await expect(page.getByText("Juan Pérez")).toBeVisible();
```
Run the full `e2e/tenant-flow.spec.ts` file (not just these two lines) after the fix to confirm nothing else in that spec depends on this column's old link shape.

**Do not touch** these other lines flagged by investigation as already-ambiguous/pre-existing before this plan — they do not target any file in this plan's scope as currently written, so they're out of scope per RULES.md §7 (no backlog work outside the active task): lines 82, 98, 126 (`ABC123`/estado-name link locators against `ordenes/page.tsx`, which has no such visible link text), line 54 (`Repuestos El Motor` link locator against `entradas-mercancia/page.tsx`, which renders that as plain text, not a link). If the full e2e suite is run as part of this task's verification and these were already failing before this task's changes, note that in the report but do not fix them here.

- [ ] Task 4 complete

### Task 5: Fase 1 verification

No new commit unless verification surfaces a real defect (in which case, fix + commit + re-verify, still under the 1-correction-attempt rule).

1. `npx tsc --noEmit` — must be clean.
2. `npx vitest run` — full suite; only the long-documented pre-existing DB-provisioning-contention flake (variable membership run-to-run, always isolated-clean) is acceptable as a failure. Any other failure is a real regression from Tasks 1-4.
3. `npx playwright test e2e/tenant-flow.spec.ts` (or the project's actual e2e run command — check `package.json`) — confirm the Task 4 locator fix works and no other test in the file broke. If pre-existing unrelated failures exist (the 4 ambiguous lines noted in Task 4), confirm they were already failing before this plan's changes (e.g. via `git stash` + re-run, or by inspecting whether they reference files outside this plan's scope) rather than assuming.
4. Browser check (claude-in-chrome) against the dev server: visit `/ordenes`, `/facturas`, `/entradas-mercancia`, `/clientes` — confirm clicking anywhere in a row (not just the old link text) navigates to the detail page, the cursor shows a pointer over the whole row, and no other in-row interactive element (there are none in these 4 tables per the investigation, but re-confirm visually) is broken.

Report a summary of all 4 checks before starting Fase 2.

- [ ] Task 5 complete — Fase 1 done

---

## FASE 2 — Alineación de columnas numéricas/monetarias

**Rule:** right-align (`className: "text-right"` on the `DataTableColumn`) every column classified NUMERIC or MONETARY. Leave TEXT, DATE, and STATUS/BADGE columns left-aligned (their current default). Do not reformat values or change what's displayed — only alignment.

**Excluded from this Fase (flagged, not executed):** `facturas/[id]/page.tsx`'s `ITEMS_COLUMNS`/`MANO_OBRA_COLUMNS`/`PAGOS_COLUMNS` and `entradas-mercancia/[id]/page.tsx`'s `ITEMS_COLUMNS` each render a single composite string per row (e.g. `"{descripcion} — {cantidad} x {precio}"`) that embeds a monetary value inside free text. Right-aligning that whole column would not produce a sensible result — it would require first splitting the column into separate Cantidad/Precio/Importe columns, which is a structural redesign, not an alignment fix. Left as-is; a follow-up decision (split columns vs. leave as prose) is out of this plan's scope.

### Task 6: `DataTable` base — apply `column.className` to the header too

**File:** `src/components/data-table.tsx`

Change:
```tsx
{columns.map((column) => (
  <TableHead key={column.header}>{column.header}</TableHead>
))}
```
to:
```tsx
{columns.map((column) => (
  <TableHead key={column.header} className={column.className}>
    {column.header}
  </TableHead>
))}
```
This is purely additive: any column without `className` renders identically to today. Add a focused test if `data-table.tsx` gains a test file for the first time in this task (check `src/components/data-table.test.tsx` first — if it doesn't exist, a minimal new test covering "column className applies to both header and cell" is in scope for this task since it's the behavior being introduced; if it's genuinely disproportionate to add a whole new test file for one prop, use judgment and note the decision in the report rather than skipping silently).

- [ ] Task 6 complete

### Task 7: Right-align — Órdenes + Facturas list tables

**Files:** `src/app/(dashboard)/ordenes/page.tsx`, `src/app/(dashboard)/facturas/page.tsx`

- `ordenes/page.tsx`: add `className: "text-right"` to the `Ítems` and `Total` columns.
- `facturas/page.tsx`: add `className: "text-right"` to the `Total` and `Saldo` columns.

- [ ] Task 7 complete

### Task 8: Right-align — Inventario list tables

**Files:** `src/app/(dashboard)/entradas-mercancia/page.tsx`, `src/app/(dashboard)/repuestos/page.tsx`, `src/app/(dashboard)/proveedores/page.tsx`, `src/app/(dashboard)/bodegas/page.tsx`

- `entradas-mercancia/page.tsx`: `Ítems`, `Unidades`, `Costo total`.
- `repuestos/page.tsx`: `Stock`, `Mínimo`, `P. compra`, `P. venta`, `Margen`.
- `proveedores/page.tsx`: `Referencias`.
- `bodegas/page.tsx`: `Referencias`, `Unidades`, `Valor inventario`, `Stock bajo`.

- [ ] Task 8 complete

### Task 9: Right-align — Administración + Reportes

**Files:** `src/app/(dashboard)/usuarios/page.tsx`, `src/app/(dashboard)/sedes/page.tsx`, `src/app/(dashboard)/reportes/page.tsx`

- `usuarios/page.tsx`: `Órdenes activas`.
- `sedes/page.tsx`: `Usuarios asignados`, `Órdenes abiertas`.
- `reportes/page.tsx`: `Órdenes entregadas`, `Mano de obra` — these two currently have **zero** styling (no `font-mono`, no number/currency formatting, confirmed by investigation). In addition to `className: "text-right"`, apply the same formatting convention used elsewhere in the app: wrap the cell value in `<span className="font-mono">` for `Órdenes entregadas`, and `<span className="font-mono font-medium">{formatoMoneda.format(...)}</span>` for `Mano de obra` (reuse the `Intl.NumberFormat` money formatter already used in sibling files — check if `reportes/page.tsx` already has one before adding a duplicate).

- [ ] Task 9 complete

### Task 10: Right-align — Clientes + detail sub-tables

**Files:** `src/app/(dashboard)/clientes/clientes-table.tsx`, `src/app/(dashboard)/clientes/[id]/page.tsx`, `src/app/(dashboard)/vehiculos/[id]/page.tsx`

- `clientes/clientes-table.tsx`: `Órdenes`, `Saldo`.
- `clientes/[id]/page.tsx` (`HISTORIAL_COLUMNS`): `Total`.
- `vehiculos/[id]/page.tsx` (`ORDENES_COLUMNS`): `Total`.

(`citas/page.tsx` has no numeric/monetary columns — confirmed by investigation, not part of this task.)

- [ ] Task 10 complete

### Task 11: Right-align — `ordenes/[id]/page.tsx` sub-tables

**File:** `src/app/(dashboard)/ordenes/[id]/page.tsx`

- `ITEMS_COLUMNS`: `Cant.`, `Unitario`, `Importe`.
- `MANO_OBRA_COLUMNS`: `Valor`.

- [ ] Task 11 complete

### Task 12: Fase 2 verification

1. `npx tsc --noEmit` clean.
2. `npx vitest run` — full suite, same acceptance rule as Task 5 (only the documented DB flake).
3. Browser check: visit each of the 9 files touched in Tasks 7-11 and visually confirm every intended column's header AND its cell values are right-aligned together (not just the cell), and every left-aligned column is unaffected.

Report a summary before starting Fase 3.

- [ ] Task 12 complete — Fase 2 done

---

## FASE 3 — Ordenamiento por columna (headers clicables)

**Open design point — resolve with the user before starting Task 13:** `DataTableColumn.header` is typed `string` and rendered as plain text (`{column.header}`). Making a header clickable/sortable (a `<Link>` toggling `?sort=&order=`) requires `DataTable` to accept a `ReactNode` header, not just a `string` — a second, slightly larger change to the base component beyond Task 6's className passthrough. Confirm this specific change is approved (same reasoning as Task 6: additive, a column that keeps passing a plain string renders identically) before writing Task 13.

Per investigation: `ordenes/page.tsx` and `facturas/page.tsx` already read `searchParams` as an awaited `Promise<{...}>` and already do all filtering in-memory on an unfiltered fetch (`listOrdenes()`/`listFacturas()` with no args, then `.filter()`). Adding `.sort()` on the same already-fetched array, driven by validated `sort`/`order` query params (mirroring the existing `ESTADOS_VALIDOS.includes(...)` allow-list guard pattern), requires **no Prisma/server-action changes** — only page-level plumbing plus the clickable-header UI.

### Task 13: `DataTable` base — allow `ReactNode` headers *(pending approval above)*

**File:** `src/components/data-table.tsx`

Widen `DataTableColumn<T>.header` from `string` to `ReactNode`, and stop using `column.header` as the React `key` (a `ReactNode` isn't guaranteed unique/stable as a key) — switch to `columns.map((column, index) => ...)` with `index` as the key instead, matching the existing pattern already used for cells in the same component (`columns.map((column, index) => ...)` at line 53 already does this for cells — headers currently use `column.header` as key, which must change alongside the type widening).

- [ ] Task 13 complete

### Task 14: Sorting for `ordenes/page.tsx`

**File:** `src/app/(dashboard)/ordenes/page.tsx`

- Sortable columns: `Ingreso` (by `createdAt`), `Total`, `Estado`, `Cliente` (by `cliente.nombre`).
- Extend `searchParams` type with `sort?: string; order?: string`. Validate `sort` against an allow-list (`"fecha" | "total" | "estado" | "cliente"`) and `order` against `"asc" | "desc"`, defaulting to the current implicit behavior (`createdAt desc`, i.e. no sort applied) when absent/invalid.
- Apply the sort via `.sort()` on the already-filtered `filtradas` array, right before the `<DataTable>` call.
- Build a small header-link helper (mirroring whatever existing helper this file uses for the `estado` filter links) that toggles `order` when the same `sort` is clicked again, and defaults to `"desc"` when switching to a new column. Render it as the `header` for the 4 sortable columns (now possible after Task 13); show a simple visual indicator (e.g. an up/down chevron or arrow) for the currently-active sort column/direction — reuse an icon already imported elsewhere in the app (e.g. from `lucide-react`) rather than adding a new one-off.
- Non-sortable columns (`Orden`, `Vehículo`, `Mecánico`, `Ítems`) keep plain string headers, unchanged.

- [ ] Task 14 complete

### Task 15: Sorting for `facturas/page.tsx`

**File:** `src/app/(dashboard)/facturas/page.tsx`

Same pattern as Task 14, applied to this file's columns:
- Sortable columns: `Emitida` (by `createdAt`), `Total`, `Saldo`, `Estado`.
- Allow-list: `"fecha" | "total" | "saldo" | "estado"`.
- Non-sortable columns (`Factura`, `Cliente`, `Vehículo`) keep plain string headers.

- [ ] Task 15 complete

### Task 16: Fase 3 verification

1. `npx tsc --noEmit` clean.
2. `npx vitest run` full suite, same acceptance rule as Tasks 5/12.
3. Browser check: on `/ordenes` and `/facturas`, click each sortable header, confirm the URL updates with `?sort=&order=`, the row order changes correctly, clicking the same header again reverses direction, and the active-sort indicator shows on the right column/direction. Confirm non-sortable columns render as plain text with no link/hover affordance.
4. Confirm `rowHref` (Fase 1) and right-alignment (Fase 2) on these two files still work correctly with the new sortable headers in place.

Report a final summary: all 3 Fases complete, tsc/test/e2e state, any deferred/excluded items (the composite-string sub-tables from Fase 2, and anything else surfaced during execution).

- [ ] Task 16 complete — Fase 3 done, plan complete
