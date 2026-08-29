# TorqueFlow — Fase 3 (Inventario): Editar y Eliminar en Bodegas, Proveedores y Repuestos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire "Editar" and "Eliminar" into the UI for Bodegas, Proveedores and Repuestos — the backend (`updateXAction`/`deleteXAction`) already exists and is fully unit-tested for all three; today the `/bodegas`, `/proveedores` and `/repuestos` pages only offer create + list.

**Architecture:** Each entity gets an `Editar{X}Dialog` (client, opens a `Dialog`) wrapping an `Editar{X}Form` (client) that contains two independent `<form>`s: an update form (`react-hook-form` + `zodResolver` + `useActionState` bound to the existing `updateXAction`) and a delete form (a plain `<form action={deleteXFormAction}>` with a destructive submit button). This is not a new pattern — it is the exact shape already used for `Sede` (`EditarSedeDialog`/`EditarSedeForm`, `src/app/(dashboard)/sedes/`) and `Usuario` (`EditarUsuarioForm`, `src/app/(dashboard)/usuarios/[id]/`). Each `delete{X}Action` currently `throw`s on failure instead of returning `{error,success}`, so each entity gets a small `delete{X}FormAction(id, prevState)` adapter (mirrors `deleteSedeFormAction`, `src/app/actions/sede-actions.ts:195`) that catches the throw so the delete form's `useActionState` can show the error inline. Each `Editar{X}Dialog` is wired into its list page's existing `DataTable` via a new "Acciones" column, matching `sedes/page.tsx`'s precedent exactly.

**Tech Stack:** Next.js 16 App Router (Server Actions, RSC + Client Components) + Prisma 6.19.3 + Zod 4 + react-hook-form + `@hookform/resolvers/zod` + Vitest/React Testing Library. No new npm dependencies, no new shared UI primitives.

## Global Constraints

- **No confirmation modal for delete**: the two existing precedents (`Sede`, `Usuario`) use a plain destructive-styled `Button type="submit"` with zero confirm step — no `alert-dialog.tsx`/`AlertDialog` exists anywhere in this codebase. Do not introduce one; match the existing pattern exactly.
- **Reuse backend as-is**: `updateXAction`/`deleteXAction` for all three entities are already implemented, role-gated (`requireRole(["ADMIN", "RECEPCION"])`) and unit-tested. This plan does not modify their behavior — only adds one new `delete{X}FormAction` adapter per entity and new UI.
- **Serialize only plain data across the server/client boundary**: a `RepuestoWithDetalle`/`BodegaConInventario` row carries Prisma `Decimal` fields (`precioCompra`/`precioVenta`, nested in `Bodega.repuestos`) that Next.js rejects as Client Component props. Build a small `{X}Editable` plain object (`Number(...)` for every Decimal field) before passing a row into `Editar{X}Dialog` — same fix already applied to `EditarClienteDialog`'s `clienteEditable`.
- **No dedicated component test** for the new `Editar{X}Dialog`/`Editar{X}Form` files — matches the established precedent (`EditarSedeDialog`, `EditarSedeForm`, `EditarUsuarioForm` have none; covered by the existing e2e smoke test only). A new unit test IS added for each `delete{X}FormAction` adapter, keeping the action-layer coverage complete like every other exported function in these three files.
- **Repuesto edit never touches `stockActual`**: the edit form has no stock field at all, matching `updateRepuestoAction`'s existing "write-once" contract (stock only changes via `createRepuestoAction`'s initial value or `addEntradaItemAction`'s atomic increment).
- **Commits**: one per task, message format `fase3-task X: <description>` (RULES.md §3), pushed immediately after each task's tests pass.
- **Verification**: `npx tsc --noEmit` and the touched `vitest run` file(s) only at the end of each task (RULES.md §4) — not after every step.

---

### Task 1: Bodega — editar y eliminar

**Files:**
- Modify: `src/app/actions/bodega-actions.ts`
- Modify: `src/app/actions/bodega-actions.test.ts`
- Create: `src/app/(dashboard)/bodegas/editar-bodega-form.tsx`
- Create: `src/app/(dashboard)/bodegas/editar-bodega-dialog.tsx`
- Modify: `src/app/(dashboard)/bodegas/page.tsx`

**Interfaces:**
- Consumes: `updateBodegaAction`, `deleteBodegaAction`, `bodegaInputSchema` (all pre-existing).
- Produces: `deleteBodegaFormAction(id, prevState)` (`@/app/actions/bodega-actions`); `BodegaEditable`, `EditarBodegaForm({ bodega })` (`./editar-bodega-form`); `EditarBodegaDialog({ bodega })` (`./editar-bodega-dialog`) — consumed by `bodegas/page.tsx`'s new "Acciones" column.

- [ ] **Step 1: Write the failing test for `deleteBodegaFormAction`**

Edit `src/app/actions/bodega-actions.test.ts` — add `deleteBodegaFormAction` to the existing import block (line 34):

```ts
import {
  createBodegaAction,
  updateBodegaAction,
  deleteBodegaAction,
  deleteBodegaFormAction,
  listBodegas,
  listBodegasConInventario,
  getBodega,
  type BodegaFormState,
} from "./bodega-actions";
```

Then insert this new `describe` block right after the `describe("deleteBodegaAction", ...)` block closes (after line 137, before `describe("listBodegas", ...)`):

```ts
describe("deleteBodegaFormAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
  });

  it("returns success after deleting the bodega", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteBodegaFormAction("b1", initialState);

    expect(result).toEqual({ error: null, success: true });
  });

  it("returns the thrown error message instead of throwing", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteBodegaFormAction("b-otra-sede", initialState);

    expect(result).toEqual({ error: "Bodega no encontrada en tu sede activa.", success: false });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/bodega-actions.test.ts`
Expected: FAIL — `deleteBodegaFormAction` is not exported from `./bodega-actions`.

- [ ] **Step 3: Implement `deleteBodegaFormAction`**

Edit `src/app/actions/bodega-actions.ts` — append at the end of the file, after `deleteBodegaAction`:

```ts
/**
 * useActionState-compatible wrapper for deleteBodegaAction, which throws on
 * every refusal (wrong sede, or the FK-restrict error when the bodega still
 * has repuestos) -- same adapter shape as deleteSedeFormAction
 * (src/app/actions/sede-actions.ts).
 */
export async function deleteBodegaFormAction(
  id: string,
  prevState: BodegaFormState,
): Promise<BodegaFormState> {
  try {
    await deleteBodegaAction(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al eliminar la bodega", success: false };
  }
  return { error: null, success: true };
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/bodega-actions.test.ts`
Expected: PASS — all tests pass, including the two new ones.

- [ ] **Step 5: Create `EditarBodegaForm`**

Create `src/app/(dashboard)/bodegas/editar-bodega-form.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateBodegaAction, deleteBodegaFormAction, type BodegaFormState } from "@/app/actions/bodega-actions";
import { bodegaInputSchema, type BodegaInput } from "@/lib/validation/inventario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: BodegaFormState = { error: null, success: false };

export interface BodegaEditable {
  id: string;
  nombre: string;
}

export function EditarBodegaForm({ bodega }: { bodega: BodegaEditable }) {
  const [state, formAction, isPending] = useActionState(
    updateBodegaAction.bind(null, bodega.id),
    initialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteBodegaFormAction.bind(null, bodega.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BodegaInput>({
    resolver: zodResolver(bodegaInputSchema),
    defaultValues: { nombre: bodega.nombre },
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
        className="flex flex-col gap-4"
      >
        <FormGroup label="Datos">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`nombre-${bodega.id}`}>Nombre</Label>
            <Input
              id={`nombre-${bodega.id}`}
              required
              aria-invalid={errors.nombre ? true : undefined}
              aria-describedby={errors.nombre ? `nombre-${bodega.id}-error` : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p id={`nombre-${bodega.id}-error`}>{errors.nombre.message}</p> : null}
          </div>
        </FormGroup>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar bodega"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Bodega actualizada</p> : null}
      </form>

      <form action={deleteFormAction} className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Button type="submit" variant="destructive" disabled={isDeletePending}>
          Eliminar {bodega.nombre}
        </Button>
        {deleteState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Create `EditarBodegaDialog`**

Create `src/app/(dashboard)/bodegas/editar-bodega-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { EditarBodegaForm, type BodegaEditable } from "./editar-bodega-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditarBodegaDialog({ bodega }: { bodega: BodegaEditable }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {bodega.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a esta bodega.</DialogDescription>
        </DialogHeader>
        <EditarBodegaForm bodega={bodega} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Wire the "Acciones" column into `/bodegas`**

Edit `src/app/(dashboard)/bodegas/page.tsx` — add the import (after the `DataTable` import):

```tsx
import { EditarBodegaDialog } from "./editar-bodega-dialog";
```

Then add a new column at the end of the `COLUMNS` array (after the `"Stock bajo"` column, before the closing `];`):

```tsx
  {
    header: "Acciones",
    cell: (bodega) => <EditarBodegaDialog bodega={{ id: bodega.id, nombre: bodega.nombre }} />,
  },
```

(`BodegaConInventario`'s nested `repuestos` carry `Decimal precioCompra`, so only the two plain scalar fields the dialog needs — `id`/`nombre` — are passed, never the row itself.)

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run src/app/actions/bodega-actions.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/actions/bodega-actions.ts src/app/actions/bodega-actions.test.ts "src/app/(dashboard)/bodegas"
git commit -m "fase3-task X: editar y eliminar bodegas"
git push
```

---

### Task 2: Proveedor — editar y eliminar

**Files:**
- Modify: `src/app/actions/proveedor-actions.ts`
- Modify: `src/app/actions/proveedor-actions.test.ts`
- Create: `src/app/(dashboard)/proveedores/editar-proveedor-form.tsx`
- Create: `src/app/(dashboard)/proveedores/editar-proveedor-dialog.tsx`
- Modify: `src/app/(dashboard)/proveedores/page.tsx`

**Interfaces:**
- Consumes: `updateProveedorAction`, `deleteProveedorAction`, `proveedorInputSchema` (all pre-existing).
- Produces: `deleteProveedorFormAction(id, prevState)` (`@/app/actions/proveedor-actions`); `ProveedorEditable`, `EditarProveedorForm({ proveedor })` (`./editar-proveedor-form`); `EditarProveedorDialog({ proveedor })` (`./editar-proveedor-dialog`) — consumed by `proveedores/page.tsx`'s new "Acciones" column.

- [ ] **Step 1: Write the failing test for `deleteProveedorFormAction`**

Edit `src/app/actions/proveedor-actions.test.ts` — add `deleteProveedorFormAction` to the existing import block (line ~29):

```ts
import {
  createProveedorAction,
  updateProveedorAction,
  deleteProveedorAction,
  deleteProveedorFormAction,
  listProveedores,
  listProveedoresConInventario,
  type ProveedorFormState,
} from "./proveedor-actions";
```

Then insert this new `describe` block right after the `describe("deleteProveedorAction", ...)` block closes (after line 91, before `describe("listProveedores", ...)`):

```ts
describe("deleteProveedorFormAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();
  });

  it("returns success after deleting the proveedor", async () => {
    mockDelete.mockResolvedValue({ id: "p1" });

    const result = await deleteProveedorFormAction("p1", initialState);

    expect(result).toEqual({ error: null, success: true });
  });

  it("returns the thrown error message instead of throwing", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));

    const result = await deleteProveedorFormAction("p1", initialState);

    expect(result).toEqual({ error: "Error al eliminar el proveedor", success: false });
  });
});
```

(`deleteProveedorAction` always wraps its catch through `friendlyPrismaErrorMessage(err, "Error al eliminar el proveedor")`, which returns that fixed fallback string for any error object without a Prisma `.code` — so a plain `Error("boom")` resolves to exactly `"Error al eliminar el proveedor"`, not `"boom"`.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/proveedor-actions.test.ts`
Expected: FAIL — `deleteProveedorFormAction` is not exported from `./proveedor-actions`.

- [ ] **Step 3: Implement `deleteProveedorFormAction`**

Edit `src/app/actions/proveedor-actions.ts` — append at the end of the file, after `deleteProveedorAction`:

```ts
/**
 * useActionState-compatible wrapper for deleteProveedorAction, which throws
 * on any underlying Prisma error -- same adapter shape as
 * deleteSedeFormAction/deleteBodegaFormAction.
 */
export async function deleteProveedorFormAction(
  id: string,
  prevState: ProveedorFormState,
): Promise<ProveedorFormState> {
  try {
    await deleteProveedorAction(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al eliminar el proveedor", success: false };
  }
  return { error: null, success: true };
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/proveedor-actions.test.ts`
Expected: PASS — all tests pass, including the two new ones.

- [ ] **Step 5: Create `EditarProveedorForm`**

Create `src/app/(dashboard)/proveedores/editar-proveedor-form.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateProveedorAction,
  deleteProveedorFormAction,
  type ProveedorFormState,
} from "@/app/actions/proveedor-actions";
import { proveedorInputSchema, type ProveedorInput } from "@/lib/validation/inventario";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ProveedorFormState = { error: null, success: false };

export interface ProveedorEditable {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
}

export function EditarProveedorForm({ proveedor }: { proveedor: ProveedorEditable }) {
  const [state, formAction, isPending] = useActionState(
    updateProveedorAction.bind(null, proveedor.id),
    initialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteProveedorFormAction.bind(null, proveedor.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProveedorInput>({
    resolver: zodResolver(proveedorInputSchema),
    defaultValues: {
      nombre: proveedor.nombre,
      contacto: proveedor.contacto ?? "",
      telefono: proveedor.telefono ?? "",
      email: proveedor.email ?? "",
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
        className="flex flex-col gap-4"
      >
        <FormGroup label="Datos">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`nombre-${proveedor.id}`}>Nombre</Label>
              <Input
                id={`nombre-${proveedor.id}`}
                required
                aria-invalid={errors.nombre ? true : undefined}
                aria-describedby={errors.nombre ? `nombre-${proveedor.id}-error` : undefined}
                {...register("nombre")}
              />
              {errors.nombre ? <p id={`nombre-${proveedor.id}-error`}>{errors.nombre.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`contacto-${proveedor.id}`}>Contacto</Label>
              <Input id={`contacto-${proveedor.id}`} {...register("contacto")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`telefono-${proveedor.id}`}>Teléfono</Label>
              <Input id={`telefono-${proveedor.id}`} className="font-mono" {...register("telefono")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`email-${proveedor.id}`}>Correo</Label>
              <Input
                id={`email-${proveedor.id}`}
                type="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? `email-${proveedor.id}-error` : undefined}
                {...register("email")}
              />
              {errors.email ? <p id={`email-${proveedor.id}-error`}>{errors.email.message}</p> : null}
            </div>
          </div>
        </FormGroup>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar proveedor"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Proveedor actualizado</p> : null}
      </form>

      <form action={deleteFormAction} className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Button type="submit" variant="destructive" disabled={isDeletePending}>
          Eliminar {proveedor.nombre}
        </Button>
        {deleteState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Create `EditarProveedorDialog`**

Create `src/app/(dashboard)/proveedores/editar-proveedor-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { EditarProveedorForm, type ProveedorEditable } from "./editar-proveedor-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditarProveedorDialog({ proveedor }: { proveedor: ProveedorEditable }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {proveedor.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a este proveedor.</DialogDescription>
        </DialogHeader>
        <EditarProveedorForm proveedor={proveedor} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Wire the "Acciones" column into `/proveedores`**

Edit `src/app/(dashboard)/proveedores/page.tsx` — add the import (after the `DataTable` import):

```tsx
import { EditarProveedorDialog } from "./editar-proveedor-dialog";
```

Then add a new column at the end of the `COLUMNS` array (after the `"Última entrada"` column, before the closing `];`):

```tsx
  {
    header: "Acciones",
    cell: (proveedor) => (
      <EditarProveedorDialog
        proveedor={{
          id: proveedor.id,
          nombre: proveedor.nombre,
          contacto: proveedor.contacto,
          telefono: proveedor.telefono,
          email: proveedor.email,
        }}
      />
    ),
  },
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run src/app/actions/proveedor-actions.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/actions/proveedor-actions.ts src/app/actions/proveedor-actions.test.ts "src/app/(dashboard)/proveedores"
git commit -m "fase3-task X: editar y eliminar proveedores"
git push
```

---

### Task 3: Repuesto — editar y eliminar

**Files:**
- Modify: `src/app/actions/repuesto-actions.ts`
- Modify: `src/app/actions/repuesto-actions.test.ts`
- Create: `src/app/(dashboard)/repuestos/editar-repuesto-form.tsx`
- Create: `src/app/(dashboard)/repuestos/editar-repuesto-dialog.tsx`
- Modify: `src/app/(dashboard)/repuestos/page.tsx`

**Interfaces:**
- Consumes: `updateRepuestoAction`, `deleteRepuestoAction`, `repuestoInputSchema`, `listBodegas` (`@/app/actions/bodega-actions`), `listProveedores` (`@/app/actions/proveedor-actions`) (all pre-existing).
- Produces: `deleteRepuestoFormAction(id, prevState)` (`@/app/actions/repuesto-actions`); `RepuestoEditable`, `EditarRepuestoForm({ repuesto, bodegas, proveedores })` (`./editar-repuesto-form`); `EditarRepuestoDialog({ repuesto, bodegas, proveedores })` (`./editar-repuesto-dialog`) — consumed by `repuestos/page.tsx`'s new "Acciones" column.

- [ ] **Step 1: Write the failing test for `deleteRepuestoFormAction`**

Edit `src/app/actions/repuesto-actions.test.ts` — add `deleteRepuestoFormAction` to the existing import block (line 24-31):

```ts
import {
  createRepuestoAction,
  updateRepuestoAction,
  deleteRepuestoAction,
  deleteRepuestoFormAction,
  listRepuestos,
  listRepuestoOptions,
  type RepuestoFormState,
} from "./repuesto-actions";
```

Then insert this new `describe` block right after the `describe("deleteRepuestoAction", ...)` block closes (after line 205, before `describe("listRepuestos", ...)`):

```ts
describe("deleteRepuestoFormAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
  });

  it("returns success after deleting the repuesto", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteRepuestoFormAction("r1", initialState);

    expect(result).toEqual({ error: null, success: true });
  });

  it("returns the thrown error message instead of throwing", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteRepuestoFormAction("r-otra-sede", initialState);

    expect(result).toEqual({ error: "Repuesto no encontrado en tu sede activa.", success: false });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: FAIL — `deleteRepuestoFormAction` is not exported from `./repuesto-actions`.

- [ ] **Step 3: Implement `deleteRepuestoFormAction`**

Edit `src/app/actions/repuesto-actions.ts` — append at the end of the file, after `deleteRepuestoAction`:

```ts
/**
 * useActionState-compatible wrapper for deleteRepuestoAction, which throws
 * both on a wrong-sede id and on any underlying Prisma error -- same adapter
 * shape as deleteSedeFormAction/deleteBodegaFormAction.
 */
export async function deleteRepuestoFormAction(
  id: string,
  prevState: RepuestoFormState,
): Promise<RepuestoFormState> {
  try {
    await deleteRepuestoAction(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al eliminar el repuesto", success: false };
  }
  return { error: null, success: true };
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: PASS — all tests pass, including the two new ones.

- [ ] **Step 5: Create `EditarRepuestoForm`**

Create `src/app/(dashboard)/repuestos/editar-repuesto-form.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useMemo, useRef } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateRepuestoAction,
  deleteRepuestoFormAction,
  type RepuestoFormState,
} from "@/app/actions/repuesto-actions";
import { repuestoInputSchema, type RepuestoInput } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: RepuestoFormState = { error: null, success: false };

export interface RepuestoEditable {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  precioCompra: number;
  precioVenta: number;
  stockMinimo: number;
  bodegaId: string;
  proveedorId: string | null;
}

export function EditarRepuestoForm({
  repuesto,
  bodegas,
  proveedores,
}: {
  repuesto: RepuestoEditable;
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const [state, formAction, isPending] = useActionState(
    updateRepuestoAction.bind(null, repuesto.id),
    initialState,
  );
  const [deleteState, deleteFormAction, isDeletePending] = useActionState(
    deleteRepuestoFormAction.bind(null, repuesto.id),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RepuestoInput>({
    resolver: zodResolver(repuestoInputSchema),
    defaultValues: {
      codigo: repuesto.codigo,
      nombre: repuesto.nombre,
      descripcion: repuesto.descripcion ?? "",
      precioCompra: repuesto.precioCompra,
      precioVenta: repuesto.precioVenta,
      stockMinimo: repuesto.stockMinimo,
      bodegaId: repuesto.bodegaId,
      proveedorId: repuesto.proveedorId ?? "",
    },
  });
  const { field: proveedorIdField } = useController({ name: "proveedorId", control });

  const proveedorOptions: ComboboxOption[] = useMemo(
    () => proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre })),
    [proveedores],
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit((data) =>
          startTransition(() => {
            const formData = new FormData(formRef.current!);
            formData.set("proveedorId", data.proveedorId ?? "");
            formAction(formData);
          }),
        )}
        className="flex flex-col gap-4"
      >
        <FormGroup label="Identificación">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`codigo-${repuesto.id}`}>Código</Label>
              <Input
                id={`codigo-${repuesto.id}`}
                className="font-mono"
                aria-invalid={errors.codigo ? true : undefined}
                aria-describedby={errors.codigo ? `codigo-${repuesto.id}-error` : undefined}
                {...register("codigo")}
              />
              {errors.codigo ? <p id={`codigo-${repuesto.id}-error`}>{errors.codigo.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`nombre-${repuesto.id}`}>Nombre</Label>
              <Input
                id={`nombre-${repuesto.id}`}
                aria-invalid={errors.nombre ? true : undefined}
                aria-describedby={errors.nombre ? `nombre-${repuesto.id}-error` : undefined}
                {...register("nombre")}
              />
              {errors.nombre ? <p id={`nombre-${repuesto.id}-error`}>{errors.nombre.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`descripcion-${repuesto.id}`}>Descripción</Label>
              <Textarea
                id={`descripcion-${repuesto.id}`}
                aria-invalid={errors.descripcion ? true : undefined}
                aria-describedby={errors.descripcion ? `descripcion-${repuesto.id}-error` : undefined}
                {...register("descripcion")}
              />
              {errors.descripcion ? (
                <p id={`descripcion-${repuesto.id}-error`}>{errors.descripcion.message}</p>
              ) : null}
            </div>
          </div>
        </FormGroup>

        <FormGroup label="Ubicación">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`bodegaId-${repuesto.id}`}>Bodega</Label>
              <select
                id={`bodegaId-${repuesto.id}`}
                aria-invalid={errors.bodegaId ? true : undefined}
                aria-describedby={errors.bodegaId ? `bodegaId-${repuesto.id}-error` : undefined}
                className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                {...register("bodegaId")}
              >
                {bodegas.map((bodega) => (
                  <option key={bodega.id} value={bodega.id}>
                    {bodega.nombre}
                  </option>
                ))}
              </select>
              {errors.bodegaId ? <p id={`bodegaId-${repuesto.id}-error`}>{errors.bodegaId.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`proveedorId-${repuesto.id}`}>Proveedor</Label>
              <Combobox
                id={`proveedorId-${repuesto.id}`}
                items={proveedorOptions}
                value={proveedorIdField.value ?? ""}
                onValueChange={proveedorIdField.onChange}
                placeholder="Sin proveedor asignado"
                emptyMessage="Ningún proveedor coincide"
                aria-invalid={errors.proveedorId ? true : undefined}
                aria-describedby={errors.proveedorId ? `proveedorId-${repuesto.id}-error` : undefined}
              />
              {errors.proveedorId ? (
                <p id={`proveedorId-${repuesto.id}-error`}>{errors.proveedorId.message}</p>
              ) : null}
            </div>
          </div>
        </FormGroup>

        <FormGroup label="Precios">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`precioCompra-${repuesto.id}`}>Precio de compra</Label>
              <Input
                id={`precioCompra-${repuesto.id}`}
                type="number"
                min="0"
                step="0.01"
                className="font-mono"
                aria-invalid={errors.precioCompra ? true : undefined}
                aria-describedby={errors.precioCompra ? `precioCompra-${repuesto.id}-error` : undefined}
                {...register("precioCompra")}
              />
              {errors.precioCompra ? (
                <p id={`precioCompra-${repuesto.id}-error`}>{errors.precioCompra.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`precioVenta-${repuesto.id}`}>Precio de venta</Label>
              <Input
                id={`precioVenta-${repuesto.id}`}
                type="number"
                min="0"
                step="0.01"
                className="font-mono"
                aria-invalid={errors.precioVenta ? true : undefined}
                aria-describedby={errors.precioVenta ? `precioVenta-${repuesto.id}-error` : undefined}
                {...register("precioVenta")}
              />
              {errors.precioVenta ? (
                <p id={`precioVenta-${repuesto.id}-error`}>{errors.precioVenta.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`stockMinimo-${repuesto.id}`}>Stock mínimo</Label>
              <Input
                id={`stockMinimo-${repuesto.id}`}
                type="number"
                min="0"
                className="font-mono"
                aria-invalid={errors.stockMinimo ? true : undefined}
                aria-describedby={errors.stockMinimo ? `stockMinimo-${repuesto.id}-error` : undefined}
                {...register("stockMinimo")}
              />
              {errors.stockMinimo ? (
                <p id={`stockMinimo-${repuesto.id}-error`}>{errors.stockMinimo.message}</p>
              ) : null}
            </div>
          </div>
        </FormGroup>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar repuesto"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Repuesto actualizado</p> : null}
      </form>

      <form action={deleteFormAction} className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Button type="submit" variant="destructive" disabled={isDeletePending}>
          Eliminar {repuesto.nombre}
        </Button>
        {deleteState.error ? (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.error}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Create `EditarRepuestoDialog`**

Create `src/app/(dashboard)/repuestos/editar-repuesto-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { EditarRepuestoForm, type RepuestoEditable } from "./editar-repuesto-form";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditarRepuestoDialog({
  repuesto,
  bodegas,
  proveedores,
}: {
  repuesto: RepuestoEditable;
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Editar</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {repuesto.nombre}</DialogTitle>
          <DialogDescription>Los cambios aplican de inmediato a este repuesto.</DialogDescription>
        </DialogHeader>
        <EditarRepuestoForm repuesto={repuesto} bodegas={bodegas} proveedores={proveedores} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Wire the "Acciones" column into `/repuestos`**

`repuestos/page.tsx`'s `COLUMNS` is a module-level constant today, but the new "Acciones" cell needs the `bodegas`/`proveedores` lists that only exist inside the async page component — so `COLUMNS` becomes a `buildColumns(bodegas, proveedores)` function, and the page also fetches those two lists (same `Promise.all` pattern `repuestos/nuevo/page.tsx` already uses).

Replace the entire contents of `src/app/(dashboard)/repuestos/page.tsx` with:

```tsx
import Link from "next/link";
import { listRepuestos, type RepuestoWithDetalle } from "@/app/actions/repuesto-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
import { EditarRepuestoDialog } from "./editar-repuesto-dialog";
import type { RepuestoEditable } from "./editar-repuesto-form";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";

const FILTROS_VALIDOS = ["stock-bajo", "sin-existencias"] as const;
type Filtro = (typeof FILTROS_VALIDOS)[number];

const FILTRO_LABELS: Record<Filtro, string> = {
  "stock-bajo": "Stock bajo",
  "sin-existencias": "Sin existencias",
};

const formatoMoneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const formatoPorcentaje = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 0 });

function esStockBajo(repuesto: RepuestoWithDetalle): boolean {
  return repuesto.stockActual <= repuesto.stockMinimo;
}

function calcularMargen(repuesto: RepuestoWithDetalle): number | null {
  const precioVenta = Number(repuesto.precioVenta);
  if (precioVenta === 0) return null;
  return (precioVenta - Number(repuesto.precioCompra)) / precioVenta;
}

function toEditable(repuesto: RepuestoWithDetalle): RepuestoEditable {
  return {
    id: repuesto.id,
    codigo: repuesto.codigo,
    nombre: repuesto.nombre,
    descripcion: repuesto.descripcion,
    precioCompra: Number(repuesto.precioCompra),
    precioVenta: Number(repuesto.precioVenta),
    stockMinimo: repuesto.stockMinimo,
    bodegaId: repuesto.bodegaId,
    proveedorId: repuesto.proveedorId,
  };
}

function buildColumns(bodegas: Bodega[], proveedores: Proveedor[]): DataTableColumn<RepuestoWithDetalle>[] {
  return [
    {
      header: "Código",
      cell: (repuesto) => <span className="font-mono text-sm">{repuesto.codigo}</span>,
    },
    {
      header: "Repuesto",
      cell: (repuesto) => <span className="font-medium">{repuesto.nombre}</span>,
    },
    {
      header: "Bodega",
      cell: (repuesto) => <span className="text-muted-foreground">{repuesto.bodega.nombre}</span>,
    },
    {
      header: "Stock",
      cell: (repuesto) => <span className="font-mono">{repuesto.stockActual}</span>,
    },
    {
      header: "Mínimo",
      cell: (repuesto) => (
        <span className={cn("font-mono", esStockBajo(repuesto) && "font-medium text-[oklch(0.5_0.2_27)]")}>
          {repuesto.stockMinimo}
        </span>
      ),
    },
    {
      header: "P. compra",
      cell: (repuesto) => <span className="font-mono">{formatoMoneda.format(Number(repuesto.precioCompra))}</span>,
    },
    {
      header: "P. venta",
      cell: (repuesto) => <span className="font-mono">{formatoMoneda.format(Number(repuesto.precioVenta))}</span>,
    },
    {
      header: "Margen",
      cell: (repuesto) => {
        const margen = calcularMargen(repuesto);
        return margen !== null ? (
          <span className="font-mono text-sm">{formatoPorcentaje.format(margen)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      header: "Acciones",
      cell: (repuesto) => (
        <EditarRepuestoDialog repuesto={toEditable(repuesto)} bodegas={bodegas} proveedores={proveedores} />
      ),
    },
  ];
}

export default async function RepuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { filtro } = await searchParams;
  const filtroActivo = FILTROS_VALIDOS.includes(filtro as Filtro) ? (filtro as Filtro) : undefined;

  // Fetched once, unfiltered: the KPI cards summarize every repuesto of la
  // sede regardless of which filtro the list below is currently applying.
  const [repuestos, bodegas, proveedores] = await Promise.all([listRepuestos(), listBodegas(), listProveedores()]);
  const filtrados =
    filtroActivo === "stock-bajo"
      ? repuestos.filter(esStockBajo)
      : filtroActivo === "sin-existencias"
        ? repuestos.filter((repuesto) => repuesto.stockActual === 0)
        : repuestos;

  const valorInventario = repuestos.reduce(
    (suma, repuesto) => suma + repuesto.stockActual * Number(repuesto.precioCompra),
    0,
  );
  const stockBajo = repuestos.filter(esStockBajo);
  const sinExistencias = repuestos.filter((repuesto) => repuesto.stockActual === 0).length;
  const columns = buildColumns(bodegas, proveedores);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Repuestos</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Referencias</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{repuestos.length}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor inventario</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-2xl font-semibold">{formatoMoneda.format(valorInventario)}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock bajo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="font-mono text-2xl font-semibold text-[oklch(0.55_0.15_60)]">{stockBajo.length}</span>
            {sinExistencias > 0 ? (
              <span className="text-xs text-muted-foreground">{sinExistencias} sin existencias</span>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Listado</CardTitle>
          <Link href="/repuestos/nuevo" className={buttonVariants({})}>
            Nuevo repuesto
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav aria-label="Filtrar por stock" className="flex flex-wrap gap-2">
            <Link
              href="/repuestos"
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                filtroActivo === undefined
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
              )}
            >
              Todas
            </Link>
            {FILTROS_VALIDOS.map((value) => (
              <Link
                key={value}
                href={`/repuestos?filtro=${value}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  filtroActivo === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {FILTRO_LABELS[value]}
              </Link>
            ))}
          </nav>

          <DataTable
            columns={columns}
            rows={filtrados}
            getRowKey={(repuesto) => repuesto.id}
            emptyMessage="No hay repuestos en este filtro."
          />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: PASS.

Run: `npx vitest run` (full suite)
Expected: PASS — no regressions in `bodegas`/`proveedores`/`repuestos` pages from Tasks 1-3.

- [ ] **Step 9: Commit**

```bash
git add src/app/actions/repuesto-actions.ts src/app/actions/repuesto-actions.test.ts "src/app/(dashboard)/repuestos"
git commit -m "fase3-task X: editar y eliminar repuestos"
git push
```

---

## Out of scope (not part of this plan)

- A confirmation modal before delete — deliberately excluded to match the existing `Sede`/`Usuario` precedent (see Global Constraints).
- Any change to `updateXAction`/`deleteXAction` business logic, roles, or the sede-scoping guards — all pre-existing and untouched.
- A dedicated e2e smoke-test step for the three new "Editar" dialogs — the existing `fase3-task 16` smoke test already exercises create+list for these three entities; extending it is backlog, not this plan.
