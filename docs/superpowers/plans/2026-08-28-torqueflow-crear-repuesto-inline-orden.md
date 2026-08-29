# TorqueFlow — Crear repuesto nuevo desde el ítem de orden — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In "Agregar item" (detalle de orden), el combo de repuesto gana una opción fija "+ Crear repuesto nuevo" que abre el formulario de creación de repuestos en un diálogo embebido; al guardar, el repuesto recién creado queda seleccionado automáticamente en el ítem, sin que el usuario tenga que salir del flujo ni volver a buscarlo.

**Architecture:** `createRepuestoAction`'s `RepuestoFormState` gana `repuestoId: string | null` (mismo patrón que `crearFacturaAction` ya usa con `facturaId`) para poder devolver el id recién creado. `NuevoRepuestoForm` pasa de `useActionState` a una llamada manual `useTransition` + `await createRepuestoAction(...)`, exactamente el mismo patrón ya establecido en `GenerarFacturaForm` y `NuevaCitaForm` — porque este codebase ya resolvió "avisar al padre justo cuando la acción resuelve, sin arriesgar una carrera con un efecto" de esa forma dos veces, y una tercera variante (`useActionState` + `useEffect`) introduciría un patrón nuevo sin necesidad. Un nuevo `NuevoRepuestoDialog` envuelve ese form en un `Dialog` controlado desde afuera (sin `DialogTrigger` propio), porque quien lo abre es una opción del combo, no un botón. `AgregarItemForm` agrega esa opción a la lista del `Combobox` (fijada con un `filter` propio para que nunca desaparezca al escribir una búsqueda), intercepta su selección para abrir el diálogo en vez de setear el campo, y al recibir el id creado lo selecciona, cierra el diálogo y llama a `router.refresh()` (primer uso de este hook en el proyecto) para que la lista de repuestos de la página se actualice con el nuevo ítem.

**Tech Stack:** Next.js 16 App Router (Server Actions, RSC + Client Components) + Prisma 6.19.3 + Zod 4 + react-hook-form + `@hookform/resolvers/zod` + Vitest/React Testing Library. No new npm dependencies.

## Global Constraints

- **`RepuestoFormState.repuestoId` es obligatorio en el tipo** (no opcional): toda función que lo devuelve —`createRepuestoAction`, `updateRepuestoAction`, `deleteRepuestoFormAction`— debe incluirlo en cada `return`, con `null` salvo en el único camino de éxito de `createRepuestoAction`.
- **No se toca `AgregarEntradaItemForm`**: su combo de repuesto sigue siendo obligatorio y sin opción de creación inline — fuera de alcance de este plan.
- **No se toca el componente compartido `Combobox`** (`src/components/ui/combobox.tsx`): la opción "+ Crear repuesto nuevo" y su comportamiento de "nunca se filtra" viven enteramente en `AgregarItemForm`, vía la lista de `items` que le pasa y un `filter` propio — el componente compartido no sabe nada de esto.
- **`NuevoRepuestoForm` sigue funcionando igual en `/repuestos/nuevo`**: la prop `onCreated` es opcional; sin ella, el comportamiento (mensajes inline `role="status"`/`role="alert"`) es idéntico al actual.
- **Verificación**: `npx tsc --noEmit` y los tests de los archivos tocados, solo al final de cada tarea (RULES.md §4).
- **Commits**: uno por tarea, formato `fase3-task X: <descripción>` (RULES.md §3), push inmediato tras pasar los tests de esa tarea.

---

### Task 1: `RepuestoFormState.repuestoId` + `NuevoRepuestoForm` con `onCreated` + `NuevoRepuestoDialog`

**Files:**
- Modify: `src/app/actions/repuesto-actions.ts`
- Modify: `src/app/actions/repuesto-actions.test.ts`
- Modify: `src/app/(dashboard)/repuestos/nuevo-repuesto-form.tsx`
- Create: `src/app/(dashboard)/repuestos/nuevo-repuesto-dialog.tsx`

**Interfaces:**
- Consumes: nada nuevo — reutiliza `bodegaInputSchema`/`repuestoInputSchema`, `Bodega`/`Proveedor` de `@/generated/prisma-tenant`.
- Produces: `RepuestoFormState` con `repuestoId: string | null` (`@/app/actions/repuesto-actions`); `NuevoRepuestoForm({ bodegas, proveedores, onCreated? })` con el nuevo prop opcional; `NuevoRepuestoDialog({ open, onOpenChange, bodegas, proveedores, onCreated })` (`./nuevo-repuesto-dialog`) — consumido por la Tarea 2's `AgregarItemForm`.

- [ ] **Step 1: Actualizar `repuesto-actions.test.ts` con las aserciones que exigen `repuestoId`**

Reemplazar el contenido completo de `src/app/actions/repuesto-actions.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockUpdateMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();
const mockBodegaFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    repuesto: { create: mockCreate, updateMany: mockUpdateMany, deleteMany: mockDeleteMany, findMany: mockFindMany },
    bodega: { findFirst: mockBodegaFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createRepuestoAction,
  updateRepuestoAction,
  deleteRepuestoAction,
  deleteRepuestoFormAction,
  listRepuestos,
  listRepuestoOptions,
  type RepuestoFormState,
} from "./repuesto-actions";

const initialState: RepuestoFormState = { error: null, success: false, repuestoId: null };
const SESSION_ADMIN = { user: { role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_RECEPCION = { user: { role: "RECEPCION", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_TECNICO = { user: { role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

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
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockCreate.mockReset();
    mockBodegaFindFirst.mockReset().mockResolvedValue({ id: "b1" });
  });

  it("returns a validation error when codigo is missing", async () => {
    const formData = baseFormData();
    formData.delete("codigo");

    const result = await createRepuestoAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El código es obligatorio");
    expect(result.repuestoId).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when precioVenta is left blank, instead of silently defaulting to 0", async () => {
    const formData = baseFormData();
    formData.set("precioVenta", "");

    const result = await createRepuestoAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El precio de venta es obligatorio");
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

  it("creates the repuesto with the given initial stock on valid input, returning the created id", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    const formData = baseFormData();
    formData.set("stockActual", "20");
    formData.set("proveedorId", "p1");

    const result = await createRepuestoAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true, repuestoId: "r1" });
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

  it("refuses to create a repuesto in a bodega from another sede", async () => {
    mockBodegaFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("codigo", "FRN-001");
    formData.set("nombre", "Filtro de aceite");
    formData.set("precioCompra", "8");
    formData.set("precioVenta", "18.9");
    formData.set("stockActual", "0");
    formData.set("stockMinimo", "5");
    formData.set("bodegaId", "b-otra-sede");

    const result = await createRepuestoAction(initialState, formData);

    expect(result).toEqual({
      error: "La bodega seleccionada no pertenece a tu sede activa.",
      success: false,
      repuestoId: null,
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockBodegaFindFirst).toHaveBeenCalledWith({
      where: { id: "b-otra-sede", sedeId: "sede-1" },
      select: { id: true },
    });
  });
});

describe("updateRepuestoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_RECEPCION);
    mockUpdateMany.mockReset();
    mockBodegaFindFirst.mockReset().mockResolvedValue({ id: "b1" });
  });

  it("updates the repuesto WITHOUT touching stockActual, even if the form somehow includes it, and reports no repuestoId", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const formData = baseFormData();
    formData.set("stockActual", "9999");

    const result = await updateRepuestoAction("r1", initialState, formData);

    expect(result).toEqual({ error: null, success: true, repuestoId: null });
    const callArg = mockUpdateMany.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("stockActual");
    expect(callArg).toEqual({
      where: { id: "r1", bodega: { sedeId: "sede-1" } },
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
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
  });

  it("requires ADMIN/RECEPCION and deletes a repuesto of the sede activa", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteRepuestoAction("r1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "r1", bodega: { sedeId: "sede-1" } } });
  });

  it("refuses to delete a repuesto from another sede", async () => {
    mockDeleteMany.mockReset().mockResolvedValue({ count: 0 });

    await expect(deleteRepuestoAction("r-otra-sede")).rejects.toThrow(
      "Repuesto no encontrado en tu sede activa.",
    );
  });
});

describe("deleteRepuestoFormAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
  });

  it("returns success after deleting the repuesto", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteRepuestoFormAction("r1", initialState);

    expect(result).toEqual({ error: null, success: true, repuestoId: null });
  });

  it("returns the thrown error message instead of throwing", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteRepuestoFormAction("r-otra-sede", initialState);

    expect(result).toEqual({ error: "Repuesto no encontrado en tu sede activa.", success: false, repuestoId: null });
  });
});

describe("listRepuestos", () => {
  it("lists only repuestos whose bodega is in the sede activa", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockFindMany.mockReset().mockResolvedValue([]);

    await listRepuestos();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      include: expect.anything(),
      orderBy: { nombre: "asc" },
    });
  });
});

describe("listRepuestoOptions", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockFindMany.mockReset().mockResolvedValue([]);
  });

  it("combines an explicit bodegaId with the sede filter in listRepuestoOptions", async () => {
    await listRepuestoOptions("b1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodegaId: "b1", bodega: { sedeId: "sede-1" } },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });

  it("still applies the sede filter when no bodegaId is given", async () => {
    await listRepuestoOptions();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: FAIL — `result.repuestoId` is `undefined`, not matching `toEqual`/`toBeNull` assertions (the source doesn't have the field yet).

- [ ] **Step 3: Implement `repuestoId` in `repuesto-actions.ts`**

Replace the entire contents of `src/app/actions/repuesto-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { repuestoInputSchema, repuestoStockInicialSchema as stockInicialSchema } from "@/lib/validation/inventario";
import { scopeBodega, scopeRepuesto } from "@/lib/sede/scope";
import type { Prisma } from "@/generated/prisma-tenant";

export interface RepuestoFormState {
  error: string | null;
  success: boolean;
  repuestoId: string | null;
}

const REPUESTO_DETAIL_INCLUDE = {
  bodega: true,
  proveedor: true,
} satisfies Prisma.RepuestoInclude;

export type RepuestoWithDetalle = Prisma.RepuestoGetPayload<{ include: typeof REPUESTO_DETAIL_INCLUDE }>;

export interface RepuestoOption {
  id: string;
  codigo: string;
  nombre: string;
}

const BODEGA_AJENA = "La bodega seleccionada no pertenece a tu sede activa.";
const REPUESTO_NO_ENCONTRADO = "Repuesto no encontrado en tu sede activa.";

function parseRepuestoFormData(formData: FormData) {
  return repuestoInputSchema.safeParse({
    codigo: formData.get("codigo") ?? "",
    nombre: formData.get("nombre") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    precioCompra: formData.get("precioCompra"),
    precioVenta: formData.get("precioVenta"),
    stockMinimo: formData.get("stockMinimo"),
    bodegaId: formData.get("bodegaId") ?? "",
    proveedorId: formData.get("proveedorId") ?? "",
  });
}

export async function listRepuestos(): Promise<RepuestoWithDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findMany({
    where: { ...scopeRepuesto(session.user.sedeActivaId) },
    include: REPUESTO_DETAIL_INCLUDE,
    orderBy: { nombre: "asc" },
  });
}

export async function listRepuestoOptions(bodegaId?: string): Promise<RepuestoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findMany({
    where: {
      ...(bodegaId ? { bodegaId } : {}),
      ...scopeRepuesto(session.user.sedeActivaId),
    },
    select: { id: true, codigo: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}

export async function getRepuesto(id: string): Promise<RepuestoWithDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.repuesto.findFirst({
    where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
    include: REPUESTO_DETAIL_INCLUDE,
  });
}

export async function createRepuestoAction(
  prevState: RepuestoFormState,
  formData: FormData,
): Promise<RepuestoFormState> {
  const parsed = parseRepuestoFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, repuestoId: null };
  }

  const parsedStock = stockInicialSchema.safeParse(formData.get("stockActual"));
  if (!parsedStock.success) {
    return { error: parsedStock.error.issues[0]?.message ?? "Datos inválidos", success: false, repuestoId: null };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bodega = await tenantDb.bodega.findFirst({
    where: { id: parsed.data.bodegaId, ...scopeBodega(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!bodega) {
    return { error: BODEGA_AJENA, success: false, repuestoId: null };
  }

  let creado: { id: string };
  try {
    creado = await tenantDb.repuesto.create({
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
    return { error: friendlyPrismaErrorMessage(err, "Error al crear el repuesto"), success: false, repuestoId: null };
  }

  revalidatePath("/repuestos");
  return { error: null, success: true, repuestoId: creado.id };
}

export async function updateRepuestoAction(
  id: string,
  prevState: RepuestoFormState,
  formData: FormData,
): Promise<RepuestoFormState> {
  const parsed = parseRepuestoFormData(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, repuestoId: null };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bodega = await tenantDb.bodega.findFirst({
    where: { id: parsed.data.bodegaId, ...scopeBodega(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!bodega) {
    return { error: BODEGA_AJENA, success: false, repuestoId: null };
  }

  try {
    const { count } = await tenantDb.repuesto.updateMany({
      where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
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
    if (count === 0) {
      return { error: REPUESTO_NO_ENCONTRADO, success: false, repuestoId: null };
    }
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el repuesto"), success: false, repuestoId: null };
  }

  revalidatePath("/repuestos");
  return { error: null, success: true, repuestoId: null };
}

export async function deleteRepuestoAction(id: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  let count: number;
  try {
    ({ count } = await tenantDb.repuesto.deleteMany({
      where: { id, ...scopeRepuesto(session.user.sedeActivaId) },
    }));
  } catch (err) {
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el repuesto"));
  }
  if (count === 0) {
    throw new Error(REPUESTO_NO_ENCONTRADO);
  }
  revalidatePath("/repuestos");
}

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
    if (typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Error al eliminar el repuesto", success: false, repuestoId: null };
  }
  return { error: null, success: true, repuestoId: null };
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts`
Expected: PASS — all tests pass.

- [ ] **Step 5: Convert `NuevoRepuestoForm` to the manual-transition pattern with an optional `onCreated` prop**

Replace the entire contents of `src/app/(dashboard)/repuestos/nuevo-repuesto-form.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createRepuestoAction, type RepuestoFormState } from "@/app/actions/repuesto-actions";
import { repuestoInputSchema, repuestoStockInicialSchema } from "@/lib/validation/inventario";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: RepuestoFormState = { error: null, success: false, repuestoId: null };

const repuestoFormSchema = repuestoInputSchema.extend({ stockActual: repuestoStockInicialSchema });
type RepuestoFormInput = z.input<typeof repuestoFormSchema>;

export function NuevoRepuestoForm({
  bodegas,
  proveedores,
  onCreated,
}: {
  bodegas: Bodega[];
  proveedores: Proveedor[];
  /**
   * When provided (embedded in NuevoRepuestoDialog from AgregarItemForm),
   * called with the created repuesto's id instead of showing the inline
   * "Repuesto creado" status -- the caller closes the dialog and selects it.
   * Manual useTransition + await, not useActionState + useEffect: same
   * pattern as GenerarFacturaForm/NuevaCitaForm, so the callback fires
   * synchronously with the action's result instead of racing a
   * state-driven effect against a parent re-render.
   */
  onCreated?: (repuestoId: string) => void;
}) {
  const [state, setState] = useState<RepuestoFormState>(initialState);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RepuestoFormInput>({
    resolver: zodResolver(repuestoFormSchema),
    defaultValues: {
      codigo: "",
      nombre: "",
      descripcion: "",
      precioCompra: "",
      precioVenta: "",
      stockActual: 0,
      stockMinimo: 0,
      bodegaId: "",
      proveedorId: "",
    },
  });
  const { field: proveedorIdField } = useController({ name: "proveedorId", control });

  const proveedorOptions: ComboboxOption[] = useMemo(
    () => proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre })),
    [proveedores],
  );

  function onValid(data: { proveedorId?: string }) {
    startTransition(async () => {
      const formData = new FormData(formRef.current!);
      // proveedorId is a Combobox (react-hook-form-controlled, not a
      // native <select name="..."> register()) -- it doesn't populate
      // FormData on its own, so it must be set explicitly here.
      formData.set("proveedorId", data.proveedorId ?? "");
      const result = await createRepuestoAction(initialState, formData);
      if (result.success && result.repuestoId) {
        if (onCreated) onCreated(result.repuestoId);
        else setState(result);
      } else {
        setState(result);
      }
    });
  }

  return (
    <form noValidate ref={formRef} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
      <FormGroup label="Identificación">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codigo">Código</Label>
            <Input
              id="codigo"
              className="font-mono"
              aria-invalid={errors.codigo ? true : undefined}
              aria-describedby={errors.codigo ? "codigo-error" : undefined}
              {...register("codigo")}
            />
            {errors.codigo ? <p id="codigo-error">{errors.codigo.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              aria-invalid={errors.nombre ? true : undefined}
              aria-describedby={errors.nombre ? "nombre-error" : undefined}
              {...register("nombre")}
            />
            {errors.nombre ? <p id="nombre-error">{errors.nombre.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Textarea
              id="descripcion"
              aria-invalid={errors.descripcion ? true : undefined}
              aria-describedby={errors.descripcion ? "descripcion-error" : undefined}
              {...register("descripcion")}
            />
            {errors.descripcion ? <p id="descripcion-error">{errors.descripcion.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Ubicación">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bodegaId">Bodega</Label>
            {/*
              Native <select>, not shadcn's Select (Base UI, no DOM <option>s
              while closed) -- userEvent.selectOptions()/getByRole("option")
              in the existing tests need real <select>/<option> elements.
              Styled by hand to match the shadcn select trigger look.
            */}
            <select
              id="bodegaId"
              aria-invalid={errors.bodegaId ? true : undefined}
              aria-describedby={errors.bodegaId ? "bodegaId-error" : undefined}
              className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              {...register("bodegaId")}
            >
              <option value="" disabled>
                Selecciona una bodega
              </option>
              {bodegas.map((bodega) => (
                <option key={bodega.id} value={bodega.id}>
                  {bodega.nombre}
                </option>
              ))}
            </select>
            {errors.bodegaId ? <p id="bodegaId-error">{errors.bodegaId.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proveedorId">Proveedor</Label>
            <Combobox
              id="proveedorId"
              items={proveedorOptions}
              value={proveedorIdField.value ?? ""}
              onValueChange={proveedorIdField.onChange}
              placeholder="Sin proveedor asignado"
              emptyMessage="Ningún proveedor coincide"
              aria-invalid={errors.proveedorId ? true : undefined}
              aria-describedby={errors.proveedorId ? "proveedorId-error" : undefined}
            />
            {errors.proveedorId ? <p id="proveedorId-error">{errors.proveedorId.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <FormGroup label="Precios y stock">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precioCompra">Precio de compra</Label>
            <Input
              id="precioCompra"
              type="number"
              min="0"
              step="0.01"
              className="font-mono"
              aria-invalid={errors.precioCompra ? true : undefined}
              aria-describedby={errors.precioCompra ? "precioCompra-error" : undefined}
              {...register("precioCompra")}
            />
            {errors.precioCompra ? <p id="precioCompra-error">{errors.precioCompra.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="precioVenta">Precio de venta</Label>
            <Input
              id="precioVenta"
              type="number"
              min="0"
              step="0.01"
              className="font-mono"
              aria-invalid={errors.precioVenta ? true : undefined}
              aria-describedby={errors.precioVenta ? "precioVenta-error" : undefined}
              {...register("precioVenta")}
            />
            {errors.precioVenta ? <p id="precioVenta-error">{errors.precioVenta.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stockActual">Stock inicial</Label>
            <Input
              id="stockActual"
              type="number"
              min="0"
              className="font-mono"
              aria-invalid={errors.stockActual ? true : undefined}
              aria-describedby={errors.stockActual ? "stockActual-error" : undefined}
              {...register("stockActual")}
            />
            {errors.stockActual ? <p id="stockActual-error">{errors.stockActual.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stockMinimo">Stock mínimo</Label>
            <Input
              id="stockMinimo"
              type="number"
              min="0"
              className="font-mono"
              aria-invalid={errors.stockMinimo ? true : undefined}
              aria-describedby={errors.stockMinimo ? "stockMinimo-error" : undefined}
              {...register("stockMinimo")}
            />
            {errors.stockMinimo ? <p id="stockMinimo-error">{errors.stockMinimo.message}</p> : null}
          </div>
        </div>
      </FormGroup>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Crear repuesto"}
      </Button>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p role="status">Repuesto creado</p> : null}
    </form>
  );
}
```

- [ ] **Step 6: Run the existing form tests to confirm no regressions**

Run: `npx vitest run "src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx"`
Expected: PASS — all 4 existing tests still pass unmodified (they mock `createRepuestoAction` at the module level and only assert on rendered output, not on the internal state mechanism).

- [ ] **Step 7: Create `NuevoRepuestoDialog`**

Create `src/app/(dashboard)/repuestos/nuevo-repuesto-dialog.tsx`:

```tsx
"use client";

import { NuevoRepuestoForm } from "./nuevo-repuesto-form";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Controlled from the outside (open/onOpenChange), with no DialogTrigger of
 * its own -- unlike NuevoVehiculoDialog, this one is opened programmatically
 * by AgregarItemForm's Combobox ("+ Crear repuesto nuevo"), not by a button
 * that lives next to it.
 */
export function NuevoRepuestoDialog({
  open,
  onOpenChange,
  bodegas,
  proveedores,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bodegas: Bodega[];
  proveedores: Proveedor[];
  onCreated: (repuestoId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo repuesto</DialogTitle>
          <DialogDescription>Se agrega al inventario y queda seleccionado en este ítem.</DialogDescription>
        </DialogHeader>
        <NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run src/app/actions/repuesto-actions.test.ts "src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/actions/repuesto-actions.ts src/app/actions/repuesto-actions.test.ts "src/app/(dashboard)/repuestos/nuevo-repuesto-form.tsx" "src/app/(dashboard)/repuestos/nuevo-repuesto-dialog.tsx"
git commit -m "fase3-task X: RepuestoFormState devuelve repuestoId, NuevoRepuestoForm admite onCreated"
git push
```

---

### Task 2: "+ Crear repuesto nuevo" en el combo de `AgregarItemForm`

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx`

**Interfaces:**
- Consumes: `NuevoRepuestoDialog` (Task 1); `listBodegas` (`@/app/actions/bodega-actions`), `listProveedores` (`@/app/actions/proveedor-actions`) — both pre-existing.
- Produces: `AgregarItemForm({ ordenId, repuestos, bodegas, proveedores })` — `bodegas`/`proveedores` are new required props, consumed by `ordenes/[id]/page.tsx`.

- [ ] **Step 1: Update `agregar-item-form.test.tsx` for the new props and the create-option flow**

Replace the entire contents of `src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockAddItemOrdenAction = vi.fn();
vi.mock("@/app/actions/item-orden-actions", () => ({
  addItemOrdenAction: (...args: unknown[]) => mockAddItemOrdenAction(...args),
}));

const mockCreateRepuestoAction = vi.fn();
vi.mock("@/app/actions/repuesto-actions", () => ({
  createRepuestoAction: (...args: unknown[]) => mockCreateRepuestoAction(...args),
}));

import { AgregarItemForm } from "./agregar-item-form";

const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }] as never;
const bodegas = [{ id: "b1", nombre: "Bodega principal" }] as never;
const proveedores = [{ id: "p1", nombre: "Repuestos El Motor" }] as never;

describe("AgregarItemForm", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockAddItemOrdenAction.mockReset();
    mockAddItemOrdenAction.mockResolvedValue({ error: null, success: true });
    mockCreateRepuestoAction.mockReset();
  });

  it("renders the repuesto select alongside the manual fields", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    expect(screen.getByLabelText("Repuesto del inventario (opcional)")).toBeInTheDocument();
    // Repuesto is a Combobox now (search-as-you-type), not a native <select>
    // -- options only mount in the DOM once the popup is open.
    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    expect(await screen.findByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit with manual fields", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem agregado");
  });

  it("blocks submission and shows the cross-field error when neither a repuesto nor manual descripcion+precio is given", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(
      await screen.findByText("Selecciona un repuesto del inventario o completa descripción y precio manualmente"),
    ).toBeInTheDocument();
    expect(mockAddItemOrdenAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockAddItemOrdenAction.mockResolvedValue({ error: "El repuesto seleccionado no tiene stock suficiente.", success: false });
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El repuesto seleccionado no tiene stock suficiente.");
  });

  it("shows a '+ Crear repuesto nuevo' option in the combo, which opens the create dialog instead of selecting it as a repuestoId", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "+ Crear repuesto nuevo" }));

    expect(await screen.findByRole("heading", { name: "Nuevo repuesto" })).toBeInTheDocument();
  });

  it("selects the newly created repuesto, closes the dialog, and refreshes the route after creating one inline", async () => {
    mockCreateRepuestoAction.mockResolvedValue({ error: null, success: true, repuestoId: "r2" });
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "+ Crear repuesto nuevo" }));
    await userEvent.type(await screen.findByLabelText("Código"), "FRN-002");
    await userEvent.type(screen.getByLabelText("Nombre"), "Bujía");
    await userEvent.type(screen.getByLabelText("Precio de compra"), "5");
    await userEvent.type(screen.getByLabelText("Precio de venta"), "9");
    await userEvent.selectOptions(screen.getByLabelText("Bodega"), "b1");
    await userEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));

    expect(await screen.findByLabelText("Repuesto del inventario (opcional)")).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Nuevo repuesto" })).not.toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
```

(La última prueba comprueba `toHaveValue("")` en el input del Combobox porque el nuevo repuesto "r2" aún no está en la lista `repuestos` fija del test — el label solo aparecería tras un `router.refresh()` real que trajera props nuevas, que este test no simula. Lo que sí verifica en firme es lo que puede fallar de verdad: el diálogo se cierra y `router.refresh()` se invoca exactamente una vez.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx"`
Expected: FAIL — `bodegas`/`proveedores` props don't exist yet on `AgregarItemForm`, and the "+ Crear repuesto nuevo" option doesn't exist.

- [ ] **Step 3: Implement the combo option and embedded dialog in `AgregarItemForm`**

Replace the entire contents of `src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx`:

```tsx
"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addItemOrdenAction, type ItemOrdenFormState } from "@/app/actions/item-orden-actions";
import { itemOrdenInputSchema } from "@/lib/validation/orden";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import type { Bodega, Proveedor } from "@/generated/prisma-tenant";
// Relative, not the "@/app/(dashboard)/..." alias: no existing file in this
// codebase imports across (dashboard) route-group subfolders that way, and
// the alias is unverified for paths containing parentheses here -- relative
// avoids relying on an untested resolution edge case.
import { NuevoRepuestoDialog } from "../../repuestos/nuevo-repuesto-dialog";
import { normalizeForSearch } from "@/lib/search";
import { FormGroup } from "@/components/form-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ItemOrdenFormState = { error: null, success: false };

/**
 * Sentinel repuestoId value for the combo's fixed "+ Crear repuesto nuevo"
 * row -- intercepted in onValueChange before it ever reaches react-hook-form
 * state or the server, so it can never be submitted as a real repuestoId.
 */
const CREAR_NUEVO_VALUE = "__crear_nuevo__";

/**
 * itemOrdenInputSchema carries a cross-field .refine() (repuesto OR manual
 * descripcion+precio), so `.safeExtend()` -- not `.extend()` -- is required
 * in zod 4 to add a field override without dropping that refinement.
 * precioUnitario needs the same "" -> undefined preprocessing
 * addItemOrdenAction already applies before parsing
 * (`formData.get("precioUnitario") || undefined`) -- `.optional()` alone
 * does not treat "" as absent.
 */
const itemFormSchema = itemOrdenInputSchema.safeExtend({
  precioUnitario: z.preprocess((v) => (v === "" ? undefined : v), itemOrdenInputSchema.shape.precioUnitario),
});
type ItemFormInput = z.input<typeof itemFormSchema>;

export function AgregarItemForm({
  ordenId,
  repuestos,
  bodegas,
  proveedores,
}: {
  ordenId: string;
  repuestos: RepuestoOption[];
  bodegas: Bodega[];
  proveedores: Proveedor[];
}) {
  const router = useRouter();
  const addItem = addItemOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(addItem, initialState);
  const [crearDialogOpen, setCrearDialogOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ItemFormInput>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { repuestoId: "", descripcion: "", cantidad: "", precioUnitario: "" },
  });
  const { field: repuestoIdField } = useController({ name: "repuestoId", control });
  // The .refine() above has no field path, so zodResolver keys it under "" --
  // not a real field, hence the cast (FieldErrors<T> only types known field keys).
  const formError = (errors as Record<string, { message?: string } | undefined>)[""]?.message;

  const repuestoOptions: ComboboxOption[] = useMemo(
    () => [
      ...repuestos.map((repuesto) => ({ value: repuesto.id, label: `${repuesto.codigo} — ${repuesto.nombre}` })),
      { value: CREAR_NUEVO_VALUE, label: "+ Crear repuesto nuevo" },
    ],
    [repuestos],
  );

  return (
    <>
      <form
        noValidate
        ref={formRef}
        onSubmit={handleSubmit((data) =>
          startTransition(() => {
            const formData = new FormData(formRef.current!);
            // repuestoId is a Combobox (react-hook-form-controlled, not a native
            // <select name="..."> register()) -- it doesn't populate FormData on
            // its own, so it must be set explicitly here before submitting.
            formData.set("repuestoId", data.repuestoId ?? "");
            formAction(formData);
          }),
        )}
        className="flex flex-col gap-4"
      >
        <FormGroup label="Repuesto">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="repuestoId">Repuesto del inventario (opcional)</Label>
              <Combobox
                id="repuestoId"
                items={repuestoOptions}
                value={repuestoIdField.value ?? ""}
                onValueChange={(value) => {
                  if (value === CREAR_NUEVO_VALUE) {
                    setCrearDialogOpen(true);
                    return;
                  }
                  repuestoIdField.onChange(value);
                }}
                placeholder="Ítem manual (completa descripción y precio abajo)"
                emptyMessage="Ningún repuesto coincide"
                // "+ Crear repuesto nuevo" stays visible no matter what the
                // user typed -- it's always reachable, not just when nothing
                // else matches. Reimplements Combobox's own diacritic-
                // insensitive default filter for every other row.
                filter={(item, query) =>
                  item.value === CREAR_NUEVO_VALUE ||
                  normalizeForSearch(item.label).includes(normalizeForSearch(query))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itemDescripcion">Descripción</Label>
              <Input
                id="itemDescripcion"
                aria-invalid={errors.descripcion ? true : undefined}
                aria-describedby={errors.descripcion ? "itemDescripcion-error" : undefined}
                {...register("descripcion")}
              />
              {errors.descripcion ? <p id="itemDescripcion-error">{errors.descripcion.message}</p> : null}
            </div>
          </div>
        </FormGroup>

        <FormGroup label="Cantidad y precio">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itemCantidad">Cantidad</Label>
              <Input
                id="itemCantidad"
                type="number"
                min="1"
                required
                className="font-mono"
                aria-invalid={errors.cantidad ? true : undefined}
                aria-describedby={errors.cantidad ? "itemCantidad-error" : undefined}
                {...register("cantidad")}
              />
              {errors.cantidad ? <p id="itemCantidad-error">{errors.cantidad.message}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itemPrecioUnitario">Precio unitario</Label>
              <Input
                id="itemPrecioUnitario"
                type="number"
                min="0"
                step="0.01"
                className="font-mono"
                aria-invalid={errors.precioUnitario ? true : undefined}
                aria-describedby={errors.precioUnitario ? "itemPrecioUnitario-error" : undefined}
                {...register("precioUnitario")}
              />
              {errors.precioUnitario ? <p id="itemPrecioUnitario-error">{errors.precioUnitario.message}</p> : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Si seleccionas un repuesto del inventario, la descripción y el precio se completan automáticamente.
          </p>
        </FormGroup>

        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        <Button type="submit" disabled={isPending} className="self-end">
          {isPending ? "Guardando..." : "Agregar ítem"}
        </Button>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.success ? <p role="status">Ítem agregado</p> : null}
      </form>

      <NuevoRepuestoDialog
        open={crearDialogOpen}
        onOpenChange={setCrearDialogOpen}
        bodegas={bodegas}
        proveedores={proveedores}
        onCreated={(repuestoId) => {
          repuestoIdField.onChange(repuestoId);
          setCrearDialogOpen(false);
          // repuestos is a server-fetched prop (listRepuestoOptions() in
          // ordenes/[id]/page.tsx); createRepuestoAction only revalidates
          // "/repuestos", not this route, so this refresh is what makes the
          // just-created repuesto's label show up in the combo's options.
          router.refresh();
        }}
      />
    </>
  );
}
```

- [ ] **Step 4: Run the tests again to confirm they pass**

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx"`
Expected: PASS — all tests pass, including the two new ones.

- [ ] **Step 5: Fetch `bodegas`/`proveedores` in `ordenes/[id]/page.tsx` and pass them down**

Edit `src/app/(dashboard)/ordenes/[id]/page.tsx` — add two imports after the existing `listRepuestoOptions` import (line 6):

```tsx
import { listRepuestoOptions } from "@/app/actions/repuesto-actions";
import { listBodegas } from "@/app/actions/bodega-actions";
import { listProveedores } from "@/app/actions/proveedor-actions";
```

Change the `Promise.all` (currently lines 129-134):

```tsx
  const [session, orden, repuestos, tecnicos] = await Promise.all([
    requireSession(),
    getOrden(id),
    listRepuestoOptions(),
    listTecnicos(),
  ]);
```

to:

```tsx
  const [session, orden, repuestos, tecnicos, bodegas, proveedores] = await Promise.all([
    requireSession(),
    getOrden(id),
    listRepuestoOptions(),
    listTecnicos(),
    listBodegas(),
    listProveedores(),
  ]);
```

Change the `AgregarItemForm` usage (currently line 236):

```tsx
              {!orden.factura && <AgregarItemForm ordenId={orden.id} repuestos={repuestos} />}
```

to:

```tsx
              {!orden.factura && (
                <AgregarItemForm
                  ordenId={orden.id}
                  repuestos={repuestos}
                  bodegas={bodegas}
                  proveedores={proveedores}
                />
              )}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx" src/app/actions/repuesto-actions.test.ts "src/app/(dashboard)/repuestos/nuevo-repuesto-form.test.tsx"`
Expected: PASS.

Run: `npx vitest run` (full suite)
Expected: PASS — no regressions in the orden detail page or repuesto forms from Tasks 1-2.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx" "src/app/(dashboard)/ordenes/[id]/agregar-item-form.test.tsx" "src/app/(dashboard)/ordenes/[id]/page.tsx"
git commit -m "fase3-task X: crear repuesto nuevo desde el combo de Agregar item"
git push
```

---

## Out of scope (not part of this plan)

- `AgregarEntradaItemForm` (entradas de mercancía) — su combo sigue exigiendo un repuesto existente; no gana la opción de creación inline.
- Cualquier cambio a `addItemOrdenAction`/`itemOrdenInputSchema` — el ítem manual (sin repuesto vinculado) sigue existiendo tal como está, esto solo agrega una tercera vía para llenar el campo `repuestoId`.
- Un componente `Combobox` "creatable" genérico y reutilizable — el patrón queda local a `AgregarItemForm` por ahora; generalizarlo es backlog si aparece una segunda necesidad real.
