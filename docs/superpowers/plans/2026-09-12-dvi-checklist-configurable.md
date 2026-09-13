# Checklist del DVI configurable por tenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 8-point DVI checklist with a per-tenant catalog of items: ADMIN can add new ítems and deactivate existing ones inline from the checklist itself, while a value already recorded against a deactivated ítem stays visible (read-only) instead of disappearing.

**Architecture:** A new tenant-scoped `DviChecklistItem` model (key/label/activo/orden) replaces the static array as the source of truth for which checklist rows exist. The 8 current items become seed defaults (new tenants via `provisionTenant`, existing tenants via a one-off backfill script). `updateDviChecklistAction` switches from full-replace to read-merge-write so an archived ítem's recorded value survives later saves. `DviChecklistForm` gains an inline "+ Agregar ítem" dialog and a per-row deactivate control, both ADMIN-only.

**Tech Stack:** Next.js Server Actions, Zod 4, Prisma 6.19.3 (tenant-scoped schema), React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-12-dvi-checklist-configurable-design.md`

## Global Constraints

- **Prisma pin**: `prisma`/`@prisma/client` stay at `6.19.3` exactly — this plan only extends `prisma/tenant/schema.prisma`, no version bump.
- **Remote Postgres only**: every `prisma migrate` command connects to the developer's remote server via `TENANT_DATABASE_URL`/`TENANT_DATABASE_BASE_URL` (from `.env`), same as every prior phase.
- **Auth roles**: `requireSession()` (any authenticated role) to list checklist items. `requireRole(["ADMIN"])` to create or (de)activate a checklist item. `requireRole(["ADMIN", "RECEPCION", "TECNICO"])` to fill in an item's status — unchanged from today.
- **Validation**: every Server Action that accepts `FormData` for a multi-field form parses it with a Zod `safeParse` schema first and returns `{ error, success }` — never throws for a validation failure. A single-argument action bound to one icon button (no form) throws a plain `Error` on failure instead, matching `deleteDviFotoAction`'s existing convention.
- **Data layer**: Server Actions for mutations, React Server Components for reads — no client-side data fetching. All new models live in `prisma/tenant/schema.prisma` (per-tenant schema), never in the global `public` schema.
- **Strict TDD**: write or update the failing test before touching implementation code, for every task below.
- **Commits**: one atomic commit per task, message prefixed `fase-dvi-checklist-task N: <breve descripción>`.
- **Language**: Spanish in domain identifiers, UI copy, and Zod error messages; English in code comments — matches the rest of the codebase.

---

### Task 1: `DviChecklistItem` Prisma model + migration

**Files:**
- Modify: `prisma/tenant/schema.prisma` (insert after the `DviFoto` model, before `model Bodega`)

**Interfaces:**
- Produces: `DviChecklistItem { id, key (unique), label, activo, orden, createdAt }`, exposed on the generated tenant client as `tenantDb.dviChecklistItem`.

- [ ] **Step 1: Add the model**

In `prisma/tenant/schema.prisma`, insert this block immediately after the closing `}` of `model DviFoto` (before `model Bodega`):

```prisma
model DviChecklistItem {
  id        String   @id @default(cuid())
  key       String   @unique
  label     String
  activo    Boolean  @default(true)
  orden     Int
  createdAt DateTime @default(now()) @map("created_at")

  @@map("dvi_checklist_items")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name add_dvi_checklist_items`
Expected: creates `prisma/tenant/migrations/<timestamp>_add_dvi_checklist_items/migration.sql`, applies it against the reference tenant schema (`TENANT_DATABASE_URL` from `.env`), regenerates the Prisma client at `src/generated/prisma-tenant` (so `DviChecklistItem` becomes an importable type from `@/generated/prisma-tenant`).

- [ ] **Step 3: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors (this task only adds a new, unused-so-far model).

- [ ] **Step 4: Commit**

```bash
git add prisma/tenant/schema.prisma prisma/tenant/migrations
git commit -m "fase-dvi-checklist-task 1: agregar modelo DviChecklistItem y su migración"
```

---

### Task 2: Rename `DVI_CHECKLIST_ITEMS` to `DEFAULT_DVI_CHECKLIST_ITEMS`, loosen `DviChecklist`'s key type

**Files:**
- Modify: `src/lib/dvi/checklist-items.ts`
- Test: `src/lib/dvi/checklist-items.test.ts`

**Interfaces:**
- Produces: `DEFAULT_DVI_CHECKLIST_ITEMS: readonly { key: string; label: string }[]` (same 8 entries, renamed). `DVI_CHECKLIST_STATUSES` and `DviChecklistStatus` unchanged. `DviChecklist = Partial<Record<string, DviChecklistStatus>>` (was `Partial<Record<DviChecklistKey, DviChecklistStatus>>`). `DviChecklistKey` removed — no consumer may import it after this task.

- [ ] **Step 1: Update the failing test**

Edit `src/lib/dvi/checklist-items.test.ts` — replace every `DVI_CHECKLIST_ITEMS` reference with `DEFAULT_DVI_CHECKLIST_ITEMS`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_DVI_CHECKLIST_ITEMS } from "./checklist-items";

describe("DEFAULT_DVI_CHECKLIST_ITEMS", () => {
  it("has a unique, non-empty key and label for every item", () => {
    expect(DEFAULT_DVI_CHECKLIST_ITEMS.length).toBeGreaterThan(0);

    const keys = DEFAULT_DVI_CHECKLIST_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);

    for (const item of DEFAULT_DVI_CHECKLIST_ITEMS) {
      expect(item.key.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("includes the frenos (brakes) checklist item, a legally required inspection point", () => {
    expect(DEFAULT_DVI_CHECKLIST_ITEMS.some((item) => item.key === "frenos")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/dvi/checklist-items.test.ts`
Expected: FAIL — `DEFAULT_DVI_CHECKLIST_ITEMS` is not exported yet.

- [ ] **Step 3: Rename the export and loosen the type**

Replace the full contents of `src/lib/dvi/checklist-items.ts`:

```ts
export const DEFAULT_DVI_CHECKLIST_ITEMS = [
  { key: "luces", label: "Luces (altas, bajas, direccionales)" },
  { key: "frenos", label: "Frenos" },
  { key: "llantas", label: "Llantas y presión" },
  { key: "niveles_fluidos", label: "Niveles de fluidos (aceite, refrigerante, frenos)" },
  { key: "bateria", label: "Batería" },
  { key: "suspension", label: "Suspensión" },
  { key: "correas_mangueras", label: "Correas y mangueras" },
  { key: "limpiaparabrisas", label: "Limpiaparabrisas" },
] as const;

export const DVI_CHECKLIST_STATUSES = ["OK", "ATENCION", "CRITICO", "NO_APLICA"] as const;

export type DviChecklistStatus = (typeof DVI_CHECKLIST_STATUSES)[number];

// Keys are no longer a fixed union: ADMIN can add DviChecklistItem rows at
// runtime (see dvi-checklist-item-actions.ts), so any string key is valid here.
export type DviChecklist = Partial<Record<string, DviChecklistStatus>>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/dvi/checklist-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm no other file still imports the removed `DVI_CHECKLIST_ITEMS`/`DviChecklistKey`**

Run: `npx tsc --noEmit`
Expected: FAILS at this point — `src/app/actions/dvi-actions.ts` and `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx` still import `DVI_CHECKLIST_ITEMS`. This is expected; Tasks 7 and 9 fix those two files. Confirm the only errors reported are in those two files before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dvi/checklist-items.ts src/lib/dvi/checklist-items.test.ts
git commit -m "fase-dvi-checklist-task 2: renombrar DVI_CHECKLIST_ITEMS a DEFAULT_DVI_CHECKLIST_ITEMS"
```

---

### Task 3: `dviChecklistItemInputSchema`

**Files:**
- Modify: `src/lib/validation/dvi.ts`

**Interfaces:**
- Produces: `dviChecklistItemInputSchema: ZodObject<{ label: ZodString }>`.

- [ ] **Step 1: Add the schema**

Append to `src/lib/validation/dvi.ts`:

```ts
export const dviChecklistItemInputSchema = z.object({
  label: z.string().min(1, "El nombre es obligatorio"),
});
```

Full resulting file:

```ts
import { z } from "zod";
import { DVI_CHECKLIST_STATUSES } from "@/lib/dvi/checklist-items";

export const dviChecklistStatusSchema = z.enum(DVI_CHECKLIST_STATUSES);
export const dviFotoMomentoSchema = z.enum(["ANTES", "DESPUES"]);

export const dviChecklistItemInputSchema = z.object({
  label: z.string().min(1, "El nombre es obligatorio"),
});
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: same two pre-existing errors from Task 2, Step 5 — no new ones.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation/dvi.ts
git commit -m "fase-dvi-checklist-task 3: agregar dviChecklistItemInputSchema"
```

---

### Task 4: `dvi-checklist-item-actions.ts` (list, create, toggle)

**Files:**
- Create: `src/app/actions/dvi-checklist-item-actions.ts`
- Test: `src/app/actions/dvi-checklist-item-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole`/`requireSession` (`@/lib/auth/guards`), `getTenantDb`/`TenantPrismaClient` (`@/lib/db/tenant-client`), `friendlyPrismaErrorMessage` (`@/lib/db/prisma-error-message`), `dviChecklistItemInputSchema` (`@/lib/validation/dvi`), `normalizeForSearch` (`@/lib/search`).
- Produces: `listDviChecklistItems(): Promise<DviChecklistItem[]>`; `DviChecklistItemFormState = { error: string | null; success: boolean; item?: DviChecklistItem }`; `crearDviChecklistItemAction(prevState: DviChecklistItemFormState, formData: FormData): Promise<DviChecklistItemFormState>`; `toggleDviChecklistItemActivoAction(itemId: string): Promise<void>` (throws on failure).

- [ ] **Step 1: Write the failing tests**

Create `src/app/actions/dvi-checklist-item-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockAggregate = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    dviChecklistItem: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      aggregate: mockAggregate,
    },
  }),
}));

import {
  crearDviChecklistItemAction,
  listDviChecklistItems,
  toggleDviChecklistItemActivoAction,
  type DviChecklistItemFormState,
} from "./dvi-checklist-item-actions";

const initialState: DviChecklistItemFormState = { error: null, success: false };

describe("listDviChecklistItems", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset();
  });

  it("lists every item ordered by orden", async () => {
    mockFindMany.mockResolvedValue([{ id: "i1", key: "frenos", label: "Frenos", activo: true, orden: 0 }]);

    const result = await listDviChecklistItems();

    expect(result).toEqual([{ id: "i1", key: "frenos", label: "Frenos", activo: true, orden: 0 }]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { orden: "asc" } });
  });
});

describe("crearDviChecklistItemAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset().mockResolvedValue(null);
    mockAggregate.mockReset().mockResolvedValue({ _max: { orden: 7 } });
    mockCreate.mockReset();
  });

  it("returns a validation error when label is missing", async () => {
    const formData = new FormData();

    const result = await crearDviChecklistItemAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("creates the item with a slugified key and the next available orden", async () => {
    mockCreate.mockResolvedValue({
      id: "i9",
      key: "aire_acondicionado",
      label: "Aire acondicionado",
      activo: true,
      orden: 8,
    });
    const formData = new FormData();
    formData.set("label", "Aire acondicionado");

    const result = await crearDviChecklistItemAction(initialState, formData);

    expect(result).toEqual({
      error: null,
      success: true,
      item: { id: "i9", key: "aire_acondicionado", label: "Aire acondicionado", activo: true, orden: 8 },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { key: "aire_acondicionado", label: "Aire acondicionado", orden: 8 },
    });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("appends a numeric suffix to the key when the slugified label already exists", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "i1", key: "frenos" }).mockResolvedValueOnce(null);
    mockCreate.mockResolvedValue({ id: "i10", key: "frenos_2", label: "Frenos", activo: true, orden: 8 });
    const formData = new FormData();
    formData.set("label", "Frenos");

    await crearDviChecklistItemAction(initialState, formData);

    expect(mockCreate).toHaveBeenCalledWith({
      data: { key: "frenos_2", label: "Frenos", orden: 8 },
    });
  });

  it("returns a friendly Spanish message instead of the raw Prisma error on a duplicate key race", async () => {
    mockCreate.mockRejectedValue({ code: "P2002", message: "Unique constraint failed on the fields: (`key`)" });
    const formData = new FormData();
    formData.set("label", "Frenos");

    const result = await crearDviChecklistItemAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ya existe un registro con ese valor.");
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (not ADMIN)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("label", "Frenos");

    await expect(crearDviChecklistItemAction(initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("toggleDviChecklistItemActivoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("flips activo from true to false", async () => {
    mockFindUnique.mockResolvedValue({ id: "i1", activo: true });
    mockUpdate.mockResolvedValue({ id: "i1", activo: false });

    await toggleDviChecklistItemActivoAction("i1");

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { activo: false } });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("flips activo from false back to true", async () => {
    mockFindUnique.mockResolvedValue({ id: "i1", activo: false });
    mockUpdate.mockResolvedValue({ id: "i1", activo: true });

    await toggleDviChecklistItemActivoAction("i1");

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { activo: true } });
  });

  it("throws when the item does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(toggleDviChecklistItemActivoAction("missing")).rejects.toThrow("Ítem no encontrado");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("propagates the redirect rejection when requireRole rejects (not ADMIN)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));

    await expect(toggleDviChecklistItemActivoAction("i1")).rejects.toThrow("REDIRECT:/login?error=forbidden");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/actions/dvi-checklist-item-actions.test.ts`
Expected: FAIL — `./dvi-checklist-item-actions` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/app/actions/dvi-checklist-item-actions.ts`:

```ts
"use server";

import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb, type TenantPrismaClient } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { dviChecklistItemInputSchema } from "@/lib/validation/dvi";
import { normalizeForSearch } from "@/lib/search";
import type { DviChecklistItem } from "@/generated/prisma-tenant";

export interface DviChecklistItemFormState {
  error: string | null;
  success: boolean;
  item?: DviChecklistItem;
}

export async function listDviChecklistItems(): Promise<DviChecklistItem[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.dviChecklistItem.findMany({ orderBy: { orden: "asc" } });
}

function slugifyChecklistLabel(label: string): string {
  return normalizeForSearch(label)
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function generarKeyUnica(tenantDb: TenantPrismaClient, base: string): Promise<string> {
  let key = base;
  let sufijo = 2;
  while (await tenantDb.dviChecklistItem.findUnique({ where: { key } })) {
    key = `${base}_${sufijo}`;
    sufijo++;
  }
  return key;
}

export async function crearDviChecklistItemAction(
  prevState: DviChecklistItemFormState,
  formData: FormData,
): Promise<DviChecklistItemFormState> {
  const parsed = dviChecklistItemInputSchema.safeParse({ label: formData.get("label") ?? "" });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const key = await generarKeyUnica(tenantDb, slugifyChecklistLabel(parsed.data.label));
    const { _max } = await tenantDb.dviChecklistItem.aggregate({ _max: { orden: true } });
    const item = await tenantDb.dviChecklistItem.create({
      data: { key, label: parsed.data.label, orden: (_max.orden ?? -1) + 1 },
    });
    return { error: null, success: true, item };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el ítem"), success: false };
  }
}

export async function toggleDviChecklistItemActivoAction(itemId: string): Promise<void> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const item = await tenantDb.dviChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) {
    throw new Error("Ítem no encontrado");
  }

  await tenantDb.dviChecklistItem.update({ where: { id: itemId }, data: { activo: !item.activo } });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/actions/dvi-checklist-item-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/dvi-checklist-item-actions.ts src/app/actions/dvi-checklist-item-actions.test.ts
git commit -m "fase-dvi-checklist-task 4: agregar acciones de servidor para listar/crear/desactivar ítems del checklist"
```

---

### Task 5: Seed the 8 defaults when provisioning a new tenant

**Files:**
- Modify: `scripts/provision-tenant.ts:55-58`
- Test: `scripts/provision-tenant.test.ts` (add one `it` block after the existing "creates one default Bodega..." test, around line 114)

**Interfaces:**
- Consumes: `DEFAULT_DVI_CHECKLIST_ITEMS` (`@/lib/dvi/checklist-items`, Task 2).

- [ ] **Step 1: Write the failing test**

Edit `scripts/provision-tenant.test.ts` — add this `it` block inside `describe("provisionTenant", ...)`, right after the "creates one default Bodega for the new tenant..." block (after line 114):

```ts
  it("seeds the 8 default DVI checklist items for the new tenant", async () => {
    await provisionTenant({ slug: SLUG, schemaName: SCHEMA });

    const tenantDb = getTenantDb(SCHEMA);
    const items = await tenantDb.dviChecklistItem.findMany({ orderBy: { orden: "asc" } });

    expect(items).toHaveLength(8);
    expect(items.every((item) => item.activo)).toBe(true);
    expect(items[0].key).toBe("luces");
    expect(items.map((item) => item.orden)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/provision-tenant.test.ts -t "seeds the 8 default"`
Expected: FAIL — `items` is empty (nothing seeds `DviChecklistItem` yet).

- [ ] **Step 3: Seed the defaults in `provisionTenant`**

In `scripts/provision-tenant.ts`, add the import:

```ts
import { DEFAULT_DVI_CHECKLIST_ITEMS } from "@/lib/dvi/checklist-items";
```

Then edit the block at lines 55-58 (inside the inner `try`, right after creating the Bodega):

```ts
    try {
      const tenantDb = getTenantDb(schemaName);
      const sede = await tenantDb.sede.create({ data: { nombre: "Sede principal" } });
      await tenantDb.bodega.create({ data: { nombre: "Bodega principal", sedeId: sede.id } });
      await tenantDb.dviChecklistItem.createMany({
        data: DEFAULT_DVI_CHECKLIST_ITEMS.map((item, index) => ({ key: item.key, label: item.label, orden: index })),
      });
    } catch (err) {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/provision-tenant.test.ts -t "seeds the 8 default"`
Expected: PASS.

- [ ] **Step 5: Run the full provision-tenant suite to confirm no regressions**

Run: `npx vitest run scripts/provision-tenant.test.ts`
Expected: all tests PASS (this change only adds rows, it doesn't alter any existing assertion).

- [ ] **Step 6: Commit**

```bash
git add scripts/provision-tenant.ts scripts/provision-tenant.test.ts
git commit -m "fase-dvi-checklist-task 5: sembrar los 8 ítems por defecto del checklist al aprovisionar un tenant"
```

---

### Task 6: Backfill script for existing tenants

**Files:**
- Create: `scripts/backfill-dvi-checklist-items.ts`
- Create: `scripts/backfill-dvi-checklist-items.test.ts`
- Create: `scripts/cli/backfill-dvi-checklist-items.ts`
- Modify: `package.json` (add a script entry)

**Interfaces:**
- Consumes: `publicDb` (`@/lib/db/public-client`), `getTenantDb` (`@/lib/db/tenant-client`), `DEFAULT_DVI_CHECKLIST_ITEMS` (`@/lib/dvi/checklist-items`).
- Produces: `BackfillDviChecklistItemsResult = { seeded: number; alreadySeeded: number }`; `backfillDviChecklistItems(): Promise<BackfillDviChecklistItemsResult>`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/backfill-dvi-checklist-items.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { provisionTenant } from "./provision-tenant";
import { backfillDviChecklistItems } from "./backfill-dvi-checklist-items";

const SLUG = "test-dvi-checklist-backfill";
const SCHEMA = "test_dvi_checklist_backfill";

async function dropTenant() {
  await publicDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await publicDb.tenant.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await provisionTenant({ slug: SLUG, schemaName: SCHEMA });
});

afterAll(dropTenant);

describe("backfillDviChecklistItems", () => {
  it("seeds the 8 defaults for a tenant that has none", async () => {
    const tenantDb = getTenantDb(SCHEMA);
    await tenantDb.dviChecklistItem.deleteMany();

    const result = await backfillDviChecklistItems();

    expect(result.seeded).toBeGreaterThanOrEqual(1);
    const items = await tenantDb.dviChecklistItem.findMany();
    expect(items).toHaveLength(8);
  });

  it("is idempotent: skips a tenant that already has items", async () => {
    await backfillDviChecklistItems();

    const result = await backfillDviChecklistItems();

    expect(result.alreadySeeded).toBeGreaterThanOrEqual(1);
    const tenantDb = getTenantDb(SCHEMA);
    expect(await tenantDb.dviChecklistItem.count()).toBe(8);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/backfill-dvi-checklist-items.test.ts`
Expected: FAIL — `./backfill-dvi-checklist-items` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `scripts/backfill-dvi-checklist-items.ts`:

```ts
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { DEFAULT_DVI_CHECKLIST_ITEMS } from "@/lib/dvi/checklist-items";

export interface BackfillDviChecklistItemsResult {
  seeded: number;
  alreadySeeded: number;
}

/**
 * One-off migration: seeds the 8 default DviChecklistItem rows for every
 * tenant provisioned before this feature shipped -- provisionTenant only
 * seeds them for tenants created from now on (see provision-tenant.ts).
 * Skips a tenant entirely if it already has any DviChecklistItem row, so
 * it's safe to re-run.
 */
export async function backfillDviChecklistItems(): Promise<BackfillDviChecklistItemsResult> {
  const tenants = await publicDb.tenant.findMany({ select: { schemaName: true } });

  const result: BackfillDviChecklistItemsResult = { seeded: 0, alreadySeeded: 0 };

  for (const tenant of tenants) {
    const tenantDb = getTenantDb(tenant.schemaName);
    const existingCount = await tenantDb.dviChecklistItem.count();
    if (existingCount > 0) {
      result.alreadySeeded++;
      continue;
    }
    await tenantDb.dviChecklistItem.createMany({
      data: DEFAULT_DVI_CHECKLIST_ITEMS.map((item, index) => ({ key: item.key, label: item.label, orden: index })),
    });
    result.seeded++;
  }

  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/backfill-dvi-checklist-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the CLI wrapper and package.json script**

Create `scripts/cli/backfill-dvi-checklist-items.ts`:

```ts
import "dotenv/config";
import { backfillDviChecklistItems } from "../backfill-dvi-checklist-items";

backfillDviChecklistItems()
  .then((result) => {
    console.log(`Seeded ${result.seeded} tenant(s), ${result.alreadySeeded} already had items.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

In `package.json`, add this line inside `"scripts"` (next to the other `tenant:*` entries):

```json
    "tenant:backfill-dvi-checklist-items": "tsx scripts/cli/backfill-dvi-checklist-items.ts",
```

- [ ] **Step 6: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: same two pre-existing errors from Task 2, Step 5 (dvi-actions.ts, dvi-checklist-form.tsx) — no new ones.

- [ ] **Step 7: Commit**

```bash
git add scripts/backfill-dvi-checklist-items.ts scripts/backfill-dvi-checklist-items.test.ts scripts/cli/backfill-dvi-checklist-items.ts package.json
git commit -m "fase-dvi-checklist-task 6: agregar script de backfill de ítems del checklist para tenants existentes"
```

---

### Task 7: `updateDviChecklistAction` reads active items dynamically and merges instead of replacing

**Files:**
- Modify: `src/app/actions/dvi-actions.ts:1-59`
- Test: `src/app/actions/dvi-actions.test.ts:1-101`

**Interfaces:**
- Consumes: `listDviChecklistItems` is NOT used here (this runs inside an already-resolved `tenantDb`, so it queries `tenantDb.dviChecklistItem.findMany({ where: { activo: true } })` directly rather than calling the Task 4 action).
- Produces: `updateDviChecklistAction`'s public signature is unchanged (`(ordenId, prevState, formData) => Promise<DviFormState>`); only its internal behavior changes.

- [ ] **Step 1: Update the mocks and write the new failing test**

Edit `src/app/actions/dvi-actions.test.ts` — replace the top mock block (lines 1-19) with:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpsert = vi.fn();
const mockDviFindUnique = vi.fn();
const mockChecklistItemFindMany = vi.fn();
const mockFotoCreate = vi.fn();
const mockFotoDeleteMany = vi.fn();
const mockOrdenFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    dvi: { upsert: mockUpsert, findUnique: mockDviFindUnique },
    dviChecklistItem: { findMany: mockChecklistItemFindMany },
    dviFoto: { create: mockFotoCreate, deleteMany: mockFotoDeleteMany },
    ordenTrabajo: { findFirst: mockOrdenFindFirst },
  }),
}));
```

Then replace the `describe("updateDviChecklistAction", ...)` block's `beforeEach` (lines 40-44) with:

```ts
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockUpsert.mockReset();
    mockDviFindUnique.mockReset().mockResolvedValue(null);
    mockChecklistItemFindMany.mockReset().mockResolvedValue([
      { key: "frenos", label: "Frenos" },
      { key: "luces", label: "Luces" },
      { key: "bateria", label: "Batería" },
    ]);
    mockOrdenFindFirst.mockReset().mockResolvedValue({ estado: "EN_PROCESO", factura: null });
  });
```

Then add this new test right after the existing "upserts only the recognized checklist keys with valid statuses" test (after line 62):

```ts
  it("merges into the existing checklist instead of replacing it, preserving a value saved against a now-inactive item", async () => {
    mockUpsert.mockResolvedValue({ id: "d1" });
    mockDviFindUnique.mockResolvedValue({ checklist: { correas_mangueras: "CRITICO", frenos: "ATENCION" } });
    mockChecklistItemFindMany.mockResolvedValue([{ key: "frenos", label: "Frenos" }]);
    const formData = new FormData();
    formData.set("frenos", "OK");

    const result = await updateDviChecklistAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ordenId: "o1" },
      create: { ordenId: "o1", checklist: { correas_mangueras: "CRITICO", frenos: "OK" }, creadoPorId: "u1" },
      update: { checklist: { correas_mangueras: "CRITICO", frenos: "OK" } },
    });
  });
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run src/app/actions/dvi-actions.test.ts -t "merges into the existing checklist"`
Expected: FAIL — the current implementation still builds `checklist` from the static `DVI_CHECKLIST_ITEMS` import and never reads/merges the existing `Dvi.checklist`.

- [ ] **Step 3: Update the implementation**

In `src/app/actions/dvi-actions.ts`, replace the import (line 8) and the whole `updateDviChecklistAction` function (lines 18-59):

```ts
import type { DviChecklist } from "@/lib/dvi/checklist-items";
```

```ts
export async function updateDviChecklistAction(
  ordenId: string,
  prevState: DviFormState,
  formData: FormData,
): Promise<DviFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { estado: true, factura: { select: { id: true } } },
  });
  if (!orden) {
    return { error: "Orden no encontrada", success: false };
  }
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false };
  }

  const [activeItems, existingDvi] = await Promise.all([
    tenantDb.dviChecklistItem.findMany({ where: { activo: true } }),
    tenantDb.dvi.findUnique({ where: { ordenId } }),
  ]);
  const existingChecklist = (existingDvi?.checklist as DviChecklist | undefined) ?? {};

  const checklist: DviChecklist = { ...existingChecklist };
  for (const item of activeItems) {
    const parsed = dviChecklistStatusSchema.safeParse(formData.get(item.key));
    if (parsed.success) {
      checklist[item.key] = parsed.data;
    }
  }

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
```

- [ ] **Step 4: Run the full file's tests to verify everything passes**

Run: `npx vitest run src/app/actions/dvi-actions.test.ts`
Expected: PASS — all `updateDviChecklistAction`, `addDviFotoAction`, and `deleteDviFotoAction` tests, including the new merge test.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/dvi-actions.ts src/app/actions/dvi-actions.test.ts
git commit -m "fase-dvi-checklist-task 7: leer ítems activos dinámicamente y fusionar el checklist en vez de reemplazarlo"
```

---

### Task 8: `NuevoDviChecklistItemDialog`

**Files:**
- Create: `src/app/(dashboard)/ordenes/[id]/nuevo-dvi-checklist-item-dialog.tsx`

**Interfaces:**
- Consumes: `crearDviChecklistItemAction`, `type DviChecklistItemFormState` (Task 4).
- Produces: `NuevoDviChecklistItemDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (item: DviChecklistItem) => void })` — controlled from the outside, no trigger of its own (same shape as `NuevaMarcaDialog`).

No dedicated test file for this task: `NuevaMarcaDialog` (the component this mirrors) has none either — its behavior is exercised through the form that renders it, same treatment `DviChecklistForm`'s test gives this dialog in Task 9.

- [ ] **Step 1: Write the component**

Create `src/app/(dashboard)/ordenes/[id]/nuevo-dvi-checklist-item-dialog.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  crearDviChecklistItemAction,
  type DviChecklistItemFormState,
} from "@/app/actions/dvi-checklist-item-actions";
import type { DviChecklistItem } from "@/generated/prisma-tenant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: DviChecklistItemFormState = { error: null, success: false };

/**
 * Controlled from the outside, no trigger of its own -- opened by the "+"
 * button in DviChecklistForm, same shape as NuevaMarcaDialog.
 */
export function NuevoDviChecklistItemDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: DviChecklistItem) => void;
}) {
  const [state, setState] = useState<DviChecklistItemFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      const result = await crearDviChecklistItemAction(initialState, formData);
      if (result.success && result.item) {
        onCreated(result.item);
        setState(initialState);
        formRef.current?.reset();
      } else {
        setState(result);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo ítem del checklist</DialogTitle>
          <DialogDescription>Se agrega al checklist DVI de todas las órdenes de este taller.</DialogDescription>
        </DialogHeader>
        <form noValidate ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-dvi-item-label">Nombre</Label>
            <Input id="nuevo-dvi-item-label" name="label" autoFocus />
          </div>

          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Agregar ítem"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: same one pre-existing error from Task 2, Step 5 (only `dvi-checklist-form.tsx` remains unfixed at this point — `dvi-actions.ts` was fixed in Task 7).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]/nuevo-dvi-checklist-item-dialog.tsx"
git commit -m "fase-dvi-checklist-task 8: agregar diálogo para crear un ítem del checklist"
```

---

### Task 9: `DviChecklistForm` — dynamic items, archived rows, ADMIN controls

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx` (full rewrite)
- Test: `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `updateDviChecklistAction` (`@/app/actions/dvi-actions`), `toggleDviChecklistItemActivoAction` (`@/app/actions/dvi-checklist-item-actions`, Task 4), `NuevoDviChecklistItemDialog` (Task 8), `type DviChecklistItem` (`@/generated/prisma-tenant`).
- Produces: `DviChecklistForm({ ordenId, checklist, items, esAdmin }: { ordenId: string; checklist: DviChecklist | null; items: DviChecklistItem[]; esAdmin?: boolean })` — `items` and `esAdmin` are new required/optional props (previously `DviChecklistForm` took only `ordenId`/`checklist` and imported the static item list itself).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateDviChecklistAction = vi.fn();
vi.mock("@/app/actions/dvi-actions", () => ({
  updateDviChecklistAction: (...args: unknown[]) => mockUpdateDviChecklistAction(...args),
}));

const mockToggleDviChecklistItemActivoAction = vi.fn();
vi.mock("@/app/actions/dvi-checklist-item-actions", () => ({
  toggleDviChecklistItemActivoAction: (...args: unknown[]) => mockToggleDviChecklistItemActivoAction(...args),
  crearDviChecklistItemAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { DviChecklistForm } from "./dvi-checklist-form";

const ITEMS = [
  { id: "i1", key: "frenos", label: "Frenos", activo: true, orden: 0, createdAt: new Date() },
  {
    id: "i2",
    key: "luces",
    label: "Luces (altas, bajas, direccionales)",
    activo: true,
    orden: 1,
    createdAt: new Date(),
  },
];

describe("DviChecklistForm", () => {
  beforeEach(() => {
    mockUpdateDviChecklistAction.mockReset().mockResolvedValue({ error: null, success: true });
    mockToggleDviChecklistItemActivoAction.mockReset().mockResolvedValue(undefined);
    mockRefresh.mockReset();
  });

  it("renders one select per active checklist item, defaulting to the saved status", () => {
    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "CRITICO" }} items={ITEMS} />);

    expect(screen.getByLabelText("Frenos")).toHaveTextContent("Crítico");
    expect(screen.getByLabelText("Luces (altas, bajas, direccionales)")).toHaveTextContent("OK");
  });

  it("submits the status the user actually picked for a given item, not just its default", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "OK" }} items={ITEMS} />);

    await userEvent.click(screen.getByLabelText("Frenos"));
    await userEvent.click(await screen.findByRole("option", { name: "Atención" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    expect(mockUpdateDviChecklistAction).toHaveBeenCalled();
    const formData = mockUpdateDviChecklistAction.mock.calls[0][2] as FormData;
    expect(formData.get("frenos")).toBe("ATENCION");
  });

  it("shows a success message after a successful submit", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Checklist guardado");
  });

  it("shows an inactive item with a saved status as a read-only 'Archivado' row instead of a select", () => {
    const itemsConArchivado = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(
      <DviChecklistForm ordenId="o1" checklist={{ frenos: "OK", bateria: "CRITICO" }} items={itemsConArchivado} />,
    );

    expect(screen.getByText("Archivado")).toBeInTheDocument();
    expect(screen.getByText("Batería")).toBeInTheDocument();
    expect(screen.queryByLabelText("Batería")).not.toBeInTheDocument();
  });

  it("hides the archived row for an inactive item that was never given a status", () => {
    const itemsConArchivadoSinValor = [
      ...ITEMS,
      { id: "i3", key: "bateria", label: "Batería", activo: false, orden: 2, createdAt: new Date() },
    ];

    render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "OK" }} items={itemsConArchivadoSinValor} />);

    expect(screen.queryByText("Batería")).not.toBeInTheDocument();
  });

  it("only shows the add-item button and the per-item deactivate control to an ADMIN", () => {
    const { rerender } = render(
      <DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} esAdmin={false} />,
    );

    expect(screen.queryByRole("button", { name: "Agregar ítem" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar Frenos" })).not.toBeInTheDocument();

    rerender(<DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} esAdmin />);

    expect(screen.getByRole("button", { name: "Agregar ítem" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desactivar Frenos" })).toBeInTheDocument();
  });

  it("deactivates an item and refreshes the page when an ADMIN clicks its deactivate control", async () => {
    render(<DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} esAdmin />);

    await userEvent.click(screen.getByRole("button", { name: "Desactivar Frenos" }));

    expect(mockToggleDviChecklistItemActivoAction).toHaveBeenCalledWith("i1");
    expect(mockRefresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx"`
Expected: FAIL — the current component neither accepts an `items` prop nor renders archived rows or ADMIN controls.

- [ ] **Step 3: Rewrite the component**

Replace the full contents of `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx`:

```tsx
"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeOff, Plus } from "lucide-react";
import { updateDviChecklistAction, type DviFormState } from "@/app/actions/dvi-actions";
import { toggleDviChecklistItemActivoAction } from "@/app/actions/dvi-checklist-item-actions";
import { DVI_CHECKLIST_STATUSES, type DviChecklist, type DviChecklistStatus } from "@/lib/dvi/checklist-items";
import type { DviChecklistItem } from "@/generated/prisma-tenant";
import { NuevoDviChecklistItemDialog } from "./nuevo-dvi-checklist-item-dialog";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

const initialState: DviFormState = { error: null, success: false };

const ESTADO_LABELS: Record<DviChecklistStatus, string> = {
  OK: "OK",
  ATENCION: "Atención",
  CRITICO: "Crítico",
  NO_APLICA: "No aplica",
};

// Same tones as the estado badges elsewhere in this page (green/amber/red),
// applied to a dot instead of a badge background.
const ESTADO_DOT_COLOR: Record<DviChecklistStatus, string> = {
  OK: "bg-[oklch(0.4_0.1_150)]",
  ATENCION: "bg-[oklch(0.55_0.15_60)]",
  CRITICO: "bg-[oklch(0.5_0.2_27)]",
  NO_APLICA: "bg-muted-foreground",
};

export function DviChecklistForm({
  ordenId,
  checklist,
  items: initialItems,
  esAdmin = false,
}: {
  ordenId: string;
  checklist: DviChecklist | null;
  items: DviChecklistItem[];
  esAdmin?: boolean;
}) {
  const current = checklist ?? {};
  const [items, setItems] = useState(initialItems);
  const [nuevoItemOpen, setNuevoItemOpen] = useState(false);
  const router = useRouter();
  const [isTogglePending, startToggleTransition] = useTransition();
  const saveChecklist = updateDviChecklistAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(saveChecklist, initialState);

  const itemsActivos = items.filter((item) => item.activo);
  // An item deactivated after it already recorded a finding must never
  // silently disappear -- it renders below, read-only, instead.
  const itemsArchivadosConValor = items.filter((item) => !item.activo && current[item.key] !== undefined);

  function toggleActivo(itemId: string) {
    startToggleTransition(async () => {
      try {
        await toggleDviChecklistItemActivoAction(itemId);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al actualizar el ítem");
      }
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormGroup label="Checklist">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {itemsActivos.map((item) => {
            const valor = current[item.key] ?? "OK";
            return (
              <div
                key={item.key}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", ESTADO_DOT_COLOR[valor])} />
                <Label htmlFor={item.key} className="flex-1 text-xs leading-tight font-normal">
                  {item.label}
                </Label>
                <SelectField
                  id={item.key}
                  name={item.key}
                  defaultValue={valor}
                  size="sm"
                  className="h-7 w-[90px] shrink-0 px-1.5 text-xs"
                  items={DVI_CHECKLIST_STATUSES.map((estado) => ({
                    value: estado,
                    label: ESTADO_LABELS[estado],
                  }))}
                />
                {esAdmin ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    disabled={isTogglePending}
                    onClick={() => toggleActivo(item.id)}
                    aria-label={`Desactivar ${item.label}`}
                    title="Desactivar este ítem del checklist"
                  >
                    <EyeOff className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            );
          })}

          {itemsArchivadosConValor.map((item) => {
            const valor = current[item.key] as DviChecklistStatus;
            return (
              <div
                key={item.key}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-1.5"
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", ESTADO_DOT_COLOR[valor])} />
                <span className="flex-1 text-xs leading-tight text-muted-foreground">{item.label}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  Archivado
                </Badge>
                <span className="w-[90px] shrink-0 text-right text-xs text-muted-foreground">
                  {ESTADO_LABELS[valor]}
                </span>
              </div>
            );
          })}
        </div>

        {esAdmin ? (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setNuevoItemOpen(true)}>
            <Plus className="size-3.5" />
            Agregar ítem
          </Button>
        ) : null}
      </FormGroup>

      <Button type="submit" disabled={isPending} className="self-end">
        {isPending ? "Guardando..." : "Guardar checklist"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {/* Alert hardcodes role="alert"; a status message must keep role="status" natively. */}
      {state.success ? <p role="status">Checklist guardado</p> : null}

      {esAdmin ? (
        <NuevoDviChecklistItemDialog
          open={nuevoItemOpen}
          onOpenChange={setNuevoItemOpen}
          onCreated={(item) => {
            setItems((prev) => [...prev, item]);
            setNuevoItemOpen(false);
          }}
        />
      ) : null}
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Verify the project type-checks with zero remaining errors**

Run: `npx tsc --noEmit`
Expected: no errors — this was the last of the two files flagged back in Task 2, Step 5.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx" "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx"
git commit -m "fase-dvi-checklist-task 9: DviChecklistForm usa ítems dinámicos, filas archivadas y controles de ADMIN"
```

---

### Task 10: Wire the orden detail page

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx:4` (imports), `:155-162` (`Promise.all`), `:342` (`<DviChecklistForm>` call)

**Interfaces:**
- Consumes: `listDviChecklistItems` (`@/app/actions/dvi-checklist-item-actions`, Task 4).

No test file exists for this page component today (only its sub-forms are unit-tested) — verify this task with `tsc` and a manual check instead of a new automated test.

- [ ] **Step 1: Add the import**

In `src/app/(dashboard)/ordenes/[id]/page.tsx`, add this import alongside the other action imports (near line 4):

```ts
import { listDviChecklistItems } from "@/app/actions/dvi-checklist-item-actions";
```

- [ ] **Step 2: Fetch the items alongside the rest of the page's data**

Replace the `Promise.all` block (lines 155-162):

```ts
  const [session, orden, repuestos, tecnicos, bodegas, proveedores, dviChecklistItems] = await Promise.all([
    requireSession(),
    getOrden(id),
    listRepuestoOptions(),
    listTecnicos(),
    listBodegas(),
    listProveedores(),
    listDviChecklistItems(),
  ]);
```

- [ ] **Step 3: Pass the new props to `DviChecklistForm`**

Replace the `<DviChecklistForm>` call (line 342):

```tsx
              <DviChecklistForm
                ordenId={orden.id}
                checklist={checklist}
                items={dviChecklistItems}
                esAdmin={session.user.role === "ADMIN"}
              />
```

- [ ] **Step 4: Verify the project type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite to confirm no regressions anywhere**

Run: `npx vitest run`
Expected: PASS (aside from the pre-existing DB-provisioning timeouts unrelated to this feature, if this environment has no reachable `TENANT_DATABASE_URL` — the same six files that already failed before this plan).

- [ ] **Step 6: Manual check**

Start the dev server (`npm run dev`), open an existing orden's detail page as ADMIN, and confirm: the checklist renders, "+ Agregar ítem" creates a new row immediately, the per-row eye-off button deactivates an item and the page refreshes without it, and logging in as TECNICO/RECEPCION shows neither control.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]/page.tsx"
git commit -m "fase-dvi-checklist-task 10: pasar los ítems del checklist y el rol ADMIN a DviChecklistForm"
```
