# DataTable Pagination + Search Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side pagination and opt-in search to the shared `DataTable` component so every one of its ~17 consumer pages inherits pagination automatically, without touching each page's data-fetching logic. Migrate `clientes-table.tsx`'s hand-rolled pagination/search (the only duplicate implementation in the codebase) onto the new built-in mechanism. Enable search on the 7 unbounded list tables that don't already have their own server-side search.

**Architecture — the central design decision:** `src/components/data-table.tsx` has no `"use client"` directive on purpose: 16 of its 17 consumers are Server Components passing plain functions (`cell`, `getRowKey`) as props, which cannot cross a Server→Client boundary (not serializable). Adding `useState` for page/search directly into `DataTable` would force it to become a Client Component and break those 16 callers.

The fix is a two-file split:
- **`src/components/data-table.tsx`** (unchanged directive, still Server-safe) keeps its exact current public signature (`columns`, `rows`, `getRowKey`, `rowHref`, `emptyMessage`) plus new optional `pageSize?` (default 20) and `searchable?`/`searchPlaceholder?`. It pre-renders every row to a `<TableRow>` React element (calling `cell`/`rowHref` itself, in whichever context it executes — this is unchanged from today) and computes a per-row search string from any column's new optional `searchValue?: (row: T) => string`. It then renders `<DataTableInteractive>`, passing the pre-rendered header cells, the pre-rendered row elements, and the parallel search-string array. A pre-rendered React element is serializable across the RSC boundary (this is the same mechanism Next.js already uses whenever a Server Component is passed as `children` into a Client Component) — plain functions are not, pre-rendered JSX is.
- **`src/components/data-table-interactive.tsx`** (new, `"use client"`) owns the `page`/`pageSize`/`query` state, filters the search-string array, slices the corresponding pre-rendered row elements for the current page, and renders the `<Table>` shell, the search `<Input>` (when `searchable`), and the new `Pagination` component.

**rowHref is unaffected by the split**: the stretched-link `<Link inset-0>` is baked into a row's pre-rendered JSX exactly as it is today (nothing about *how* a row is rendered changes — only *when/where* the resulting elements are sliced for display changes). Task 2's reviewer must independently confirm this, not just trust the implementer's claim.

**Server-side migration path (why this doesn't need a rewrite later):** `Pagination`'s props (`page`, `pageCount`, `onPageChange`, etc.) are state-source-agnostic. A future server-side phase would have `data-table-interactive.tsx` accept `page`/`onPageChange` as controlled props from the parent page (backed by a `?page=` URL param) instead of owning `useState` internally, and `data-table.tsx` would receive an already-paginated `rows` slice instead of pre-rendering everything — `Pagination` itself doesn't change. Not part of this plan; do not implement it now.

**Tech Stack:** Next.js App Router (Server + Client Components), React, Vitest + Testing Library, Tailwind, `lucide-react` (`ChevronLeft`/`ChevronRight` for pagination controls), existing `SelectField` (page-size dropdown) and `Button` (`icon-sm` variant) components — no new UI dependencies.

## Global Constraints

- Strict TDD Mode is active (CLAUDE.md): red-then-green for every behavioral change.
- RULES.md: commit + push immediately after each task, one task per commit, max 1 correction attempt per task before stopping and reporting.
- Every commit message in this plan MUST end with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NXXaNsNpy63Seos9ngJWjL
  ```
- Run `npx tsc --noEmit` and the task's own affected test file(s) at the end of every task. Run the full suite (`npx vitest run`) only at each phase's dedicated verification task.
- **rowHref must keep working after every task that touches `data-table.tsx`/`data-table-interactive.tsx`** — verify this explicitly (test + manual browser check at the Fase B verification task), not just "no tsc errors."
- Do not touch `facturas/page.tsx` or `citas/page.tsx` in Fase E — they already have their own server-side `?q=` search; adding the new client `searchable` there would create two competing search boxes. Leave them exactly as they are.
- Do not touch `src/components/ui/table.tsx` (the underlying primitive) unless a task explicitly says so.

---

## FASE A — Componente `Pagination` reutilizable (standalone, bajo riesgo)

### Task 1: `src/components/ui/pagination.tsx`

Create a new reusable, presentational `"use client"` component, following the established conventions in `src/components/ui/select-field.tsx` and `src/components/ui/combobox.tsx` (read both first): named export at the bottom (not default), props typed inline in the destructured function signature, JSDoc comment above the function explaining *why* (not what), `cn()` used only if merging a caller `className`.

**Props** (English names, matching `select-field.tsx`/`combobox.tsx` convention, not the Spanish app-layer naming):
```tsx
{
  page: number;              // 1-indexed current page
  pageCount: number;         // total number of pages (>= 1)
  pageSize: number;
  total: number;             // total row count (post-filter, pre-pagination)
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;  // omit prop entirely to hide the size selector
  pageSizeOptions?: number[]; // default [10, 20, 50]
  className?: string;
}
```

**Behavior:**
- Renders "Mostrando {start}-{end} de {total} registros" (Spanish, matching the rest of the app's UI copy — this is the one piece of app-facing copy in an otherwise English-API component, matching how `select-field.tsx`'s `placeholder` prop carries Spanish text passed in by callers). Compute `start`/`end` from `page`/`pageSize`/`total` (e.g. `total === 0` → "Mostrando 0 de 0 registros", no "0-0"; otherwise `start = (page-1)*pageSize+1`, `end = Math.min(page*pageSize, total)`).
- Prev/Next buttons: `<Button variant="outline" size="icon-sm">` wrapping `<ChevronLeft />`/`<ChevronRight />` from `lucide-react` (mirror the icon-button pattern already established in `src/components/ui/button.tsx`'s `size="icon-sm"` variant). Disabled at `page <= 1` / `page >= pageCount`. Add an accessible label (`aria-label="Página anterior"` / `aria-label="Página siguiente"`) since the buttons carry only an icon, no text.
- Page-size selector: only rendered when `onPageSizeChange` is provided. Use the existing `SelectField` component (`src/components/ui/select-field.tsx`) with `items` built from `pageSizeOptions`, each labeled e.g. `"10 por página"`. `size="sm"` to match the compact controls around it.
- When `pageCount <= 1`: still show the "Mostrando X de Y" line, but do not render the Prev/Next buttons (matching the existing precedent in `clientes-table.tsx`, which only shows pagination controls when `totalPaginas > 1`). The page-size selector (if provided) still renders regardless of `pageCount`.
- Layout: `flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground` on the root, matching `clientes-table.tsx`'s current pagination footer styling exactly (read it — commit `87d052f` or later — for the precise classes to reuse).

**TDD:** Write `src/components/ui/pagination.test.tsx` first (RED then GREEN). Cover at minimum: renders the "Mostrando X-Y de Z" text correctly for a middle page; Prev disabled on page 1; Next disabled on the last page; clicking Prev/Next calls `onPageChange` with the correct value; page-size selector absent when `onPageSizeChange` omitted, present and functional when provided; `pageCount <= 1` hides Prev/Next but keeps the count line.

- [ ] Task 1 complete

### Task 2: Fase A verification

No new commit unless verification surfaces a defect.

1. `npx tsc --noEmit` — clean.
2. Run `src/components/ui/pagination.test.tsx` — all green, pristine output (no warnings).
3. This component is not wired into anything yet (Fase B does that) — no browser check needed at this stage.

- [ ] Task 2 complete — Fase A done

---

## FASE B — Integrar paginación en `DataTable` (afecta las 17 tablas automáticamente)

### Task 3: `data-table-interactive.tsx` + adapt `data-table.tsx`

**File 1 (new):** `src/components/data-table-interactive.tsx`, `"use client"`.

```tsx
{
  headerCells: ReactNode[];      // one pre-rendered <TableHead> per column, in order
  rowElements: ReactNode[];      // one pre-rendered <TableRow> per row, in order (rowHref already baked in)
  searchTexts: string[];         // parallel array to rowElements, "" if not searchable
  rowCount: number;              // rowElements.length, passed explicitly for clarity
  pageSize: number;
  searchable: boolean;
  searchPlaceholder?: string;
  emptyMessage: string;          // for the "no results after filtering" case, distinct from the zero-rows case data-table.tsx already handles
}
```
Owns `page`/`query` state (`useState`). When `searchable`, filters `rowElements` by matching `query` (case-insensitive substring) against the parallel `searchTexts` entry, resetting to page 1 on every query change. Slices the (possibly filtered) `rowElements` array for the current page (`pageSize` from the prop, not hardcoded). Renders: the search `<Input>` (only when `searchable`) above the table, the `<Table><TableHeader><TableRow>{headerCells}</TableRow></TableHeader><TableBody>{visible row elements}</TableBody></Table>`, and the new `Pagination` component below (from Task 1), wired to the local `page` state. If the filtered set is empty (search active, no matches), show `emptyMessage` instead of an empty table body — reuse the same `emptyMessage` text `data-table.tsx` already receives, OR a distinct one if you judge the "zero rows ever" and "zero rows after search" cases deserve different copy (your call, note the decision in your report).

**File 2 (modified):** `src/components/data-table.tsx`. Keep the existing `rows.length === 0` early-return exactly as today (skip `DataTableInteractive` entirely for a genuinely empty table — no point rendering search/pagination furniture around nothing). Otherwise: pre-render `columns.map(...)` into `headerCells` (identical `<TableHead key={index} className={column.className}>{column.header}</TableHead>` as today), pre-render `rows.map(...)` into `rowElements` using the EXACT same per-row JSX structure as today (same `<TableRow key={getRowKey(row)} className={cn(...)}>`, same rowHref stretched-link `<Link>` in the first cell, same `<TableCell key={index} className={column.className}>{column.cell(row)}</TableCell>` for every column) — this is a pure refactor of the existing render logic into an array-building pass, not a behavior change. Compute `searchTexts` as `rows.map((row) => columns.map((c) => c.searchValue?.(row) ?? "").join(" ").toLowerCase())` — note this references `column.searchValue`, which does not exist yet (that's Task 5's job); for THIS task, add `searchValue?: (row: T) => string` to the `DataTableColumn<T>` type now (empty/unused until Task 5 wires `searchable` through), so `searchTexts` compiles and is ready, but do not add a `searchable` prop to `DataTable` yet — every column's `searchValue` will be `undefined` for now, so `searchTexts` will just be `[""]`-per-row, harmless. Add `pageSize?: number` to `DataTable`'s own props (default `20` when omitted), pass it straight through to `DataTableInteractive`. Do NOT add `searchable`/`searchPlaceholder` to `DataTable` yet (Task 5's job) — pass `searchable={false}` as a hardcoded literal to `DataTableInteractive` for now.

**TDD:** Update `src/components/data-table.test.tsx`. The 3 existing tests (no-className regression, className-on-header-and-cell, ReactNode-header) must still pass — their fixtures use fewer than 20 rows, so no pagination UI should appear and the DOM structure they assert on should be unaffected, but VERIFY this rather than assume it; fix the tests if the new wrapper changes something incidental (e.g. an added wrapping `<div>`). Add new tests: (a) more than `pageSize` rows only renders `pageSize` of them; (b) a custom `pageSize` prop is honored; (c) **`rowHref` still produces a working stretched-link on a rendered (visible, first-page) row** — this is the single most important new test in this task, given the plan's explicit rowHref-preservation requirement.

**Global constraint reminder:** run `npx tsc --noEmit` — this MUST stay clean including at least one Server Component consumer (e.g. spot-check that `src/app/(dashboard)/ordenes/page.tsx`, which is unmodified, still compiles with the new `data-table.tsx` — a type error there would mean the split broke Server-Component compatibility).

- [ ] Task 3 complete

### Task 4: Fase B verification

No new commit unless verification surfaces a defect.

1. `npx tsc --noEmit` — clean.
2. `npx vitest run` — full suite; only the documented pre-existing DB-provisioning-contention flake is acceptable.
3. Browser check (claude-in-chrome) against the dev server, logged in to `taller-dev`:
   - `/repuestos` (152 rows, unbounded) — confirm pagination controls appear and page 2/3 show different rows.
   - `/ordenes` (table view) — confirm clicking anywhere in a row still navigates to `/ordenes/[id]` (rowHref regression check on a REAL page, not just the unit test) — this page also has its own `?sort=`/`?estado=` state from the prior DataTable modernization plan; confirm sorting still works and coexists with the new default pagination without conflict.
   - `/ordenes/[id]` (small, bounded sub-table, well under 20 rows) — confirm NO pagination controls render (no `pageCount > 1`).

- [ ] Task 4 complete — Fase B done

---

## FASE C — API de búsqueda opcional en `DataTable`

### Task 5: `searchable`/`searchPlaceholder` props + wire `searchValue` through

**File:** `src/components/data-table.tsx` (and `data-table-interactive.tsx` if the `searchable`/`searchPlaceholder` plumbing needs adjusting there too — it already accepts these props per Task 3's shape, just always received `searchable={false}` before now).

Add `searchable?: boolean` (default `false`) and `searchPlaceholder?: string` (default something sensible, e.g. `"Buscar..."`) to `DataTable`'s props. Pass them straight through to `DataTableInteractive` instead of the Task 3 hardcoded `searchable={false}`. `searchTexts` (already computed in Task 3 from `column.searchValue`) now actually matters once a caller sets `searchable={true}` AND at least one column defines `searchValue`.

No consumer page is changed in this task — `searchable` defaults to `false`, so this task alone produces zero visible change anywhere. It only makes the capability available for Tasks 6 and 7 to opt into.

**TDD:** Add tests to `data-table.test.tsx` covering: `searchable={false}` (default) — no search `<Input>` renders even if `searchValue` is set on a column; `searchable={true}` with a column `searchValue` — typing a query that matches a subset of rows filters the visible rows correctly; typing a query matching nothing shows the empty-results message instead of the table.

- [ ] Task 5 complete

---

## FASE D — Migrar `clientes-table.tsx` (obligatorio)

### Task 6: Migrate `clientes-table.tsx` to the built-in pagination + search

**File:** `src/app/(dashboard)/clientes/clientes-table.tsx`.

Remove: the `useState` for `busqueda`/`pagina`, the `useMemo` filtering, the manual `PAGE_SIZE` constant, the manual `<Input>` search box, the manual "Mostrando X de Y" + Prev/Next `<Button>` footer, the `coincide()` helper function, the `cn` import if it becomes unused.

Add: `searchValue` to exactly the 3 columns whose fields `coincide()` currently searches (Cliente → `cliente.nombre` + `cliente.documento` concatenated; Teléfono → `cliente.telefono`) — mirror today's exact searchable-field set, don't expand or shrink it. Pass `searchable={true}`, `searchPlaceholder="Buscar por nombre, documento o teléfono..."` (the exact current placeholder text), and `pageSize={20}` (matching today's `PAGE_SIZE`) to `<DataTable>`. `rows={clientes}` directly now (the raw prop, not a locally-paginated `visibles` slice — `DataTable` does the slicing internally now).

The component keeps rendering `<DataTable columns={COLUMNS} rows={clientes} getRowKey={...} rowHref={...} emptyMessage={...} searchable searchPlaceholder="..." pageSize={20} />` and nothing else — no local pagination/search UI of its own remains in this file.

**TDD:** No `clientes-table.test.tsx` exists today (confirmed by investigation) — do not invent one where the established precedent has none, UNLESS you judge the migration's behavioral risk (removing hand-rolled logic wholesale) warrants a first test file for this specific file; if you add one, keep it proportionate (a handful of focused tests, not exhaustive). Note your decision and reasoning in your report either way.

- [ ] Task 6 complete

### Task 7: Fase D verification

No new commit unless verification surfaces a defect.

1. `npx tsc --noEmit` — clean.
2. `npx vitest run` — full suite, same acceptance rule as Task 4.
3. Browser check: `/clientes` — confirm search (try "Alejandro" or a known seeded name/document/phone fragment) filters correctly, pagination still works with the seeded ~22 clients, and clicking a row still navigates to `/clientes/[id]` (rowHref).

- [ ] Task 7 complete — Fase D done

---

## FASE E — Activar `searchable` en las tablas grandes sin buscador propio

**Scope:** exactly these 7 files, each getting `searchable={true}` + `searchPlaceholder` + `searchValue` on its identifying text column(s). Do NOT touch `facturas/page.tsx` or `citas/page.tsx` (per Global Constraints — they already have server-side `?q=` search).

For each file below, read its current `COLUMNS`/equivalent array first (don't assume field names from memory — confirm against the real current file) and add `searchValue` to the column(s) that hold the row's primary identifying text (names/codes a user would actually type to find a row), matching the same "don't expand beyond what a reasonable search box should match" judgment used in Task 6.

### Task 8: `bodegas/page.tsx` + `proveedores/page.tsx`

- `bodegas/page.tsx`: `searchValue` on the Bodega name and Sede name columns (the two identifying text fields). `searchPlaceholder`, e.g. `"Buscar por bodega o sede..."`.
- `proveedores/page.tsx`: `searchValue` on Proveedor (name), Contacto, Teléfono, Correo. `searchPlaceholder` matching those fields.

Both get `pageSize={10}` (small tables per the user's explicit instruction — "tablas pequeñas pueden usar pageSize=10").

- [ ] Task 8 complete

### Task 9: `repuestos/page.tsx` + `usuarios/page.tsx`

- `repuestos/page.tsx`: `searchValue` on Código, Repuesto (name), Bodega. `pageSize={50}` (152 seeded rows today — a large table per the user's explicit instruction — "tablas grandes pageSize=50").
- `usuarios/page.tsx`: `searchValue` on the Usuario column (name/email). `pageSize={10}`.

This file already has its own `?rol=` URL filter pills — confirm `searchable` (client-side) coexists without conflict (it filters the already-role-filtered rows further, same relationship the Fase-modernization sort feature already established between URL filters and in-table refinement).

- [ ] Task 9 complete

### Task 10: `sedes/page.tsx` + `entradas-mercancia/page.tsx` + `superadmin/page.tsx`

- `sedes/page.tsx`: `searchValue` on Sede name. `pageSize={10}`.
- `entradas-mercancia/page.tsx`: `searchValue` on Proveedor and Bodega. `pageSize={20}` (default — no strong signal either way from the user's small/large split).
- `superadmin/page.tsx`: `searchValue` on Taller (tenant name). `pageSize={10}`.

- [ ] Task 10 complete

### Task 11: Fase E verification (and final plan verification)

No new commit unless verification surfaces a defect.

1. `npx tsc --noEmit` — clean.
2. `npx vitest run` — full suite, same acceptance rule as prior verification tasks.
3. Browser check: visit all 7 files touched in Tasks 8-10, confirm each shows a search box that actually filters, confirm the configured `pageSize` (10 vs 20 vs 50) is visibly honored (count rows per page), and spot-check `rowHref` still works on at least 2 of them (e.g. `repuestos` has no rowHref today — confirm via the plan's earlier consumer survey which of these 7 actually use `rowHref` before asserting on it; do not assume all 7 do).
4. Confirm `facturas/page.tsx` and `citas/page.tsx` are untouched (`git diff` against the pre-Fase-E commit shows zero changes to either file).

Report a final summary: all 5 Fases complete, tsc/test/browser state, any deferred items.

- [ ] Task 11 complete — Fase E done, plan complete
