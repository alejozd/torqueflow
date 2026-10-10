# Confirmaciones y botones faltantes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda acción destructiva o difícil de deshacer pida confirmación, que existan los botones para quitar ítems/mano de obra/fotos y eliminar citas, y que tres diálogos de alta rápida validen el nombre vacío antes de ir al servidor.

**Architecture:** Un solo componente de confirmación en línea (`ConfirmacionEnLinea`, el mismo "¿…? Sí / No" que ya usan clientes, vehículos y pedidos de compra — nunca `window.confirm` ni un diálogo nuevo). Encima de él, dos envoltorios: `EliminarConConfirmacion` (ya existe, bloque al pie de un diálogo de edición) y `QuitarConConfirmacion` (nuevo, botón de ícono para filas de tabla). Las acciones de servidor que hoy rechazan lanzando un error reciben un envoltorio `…FormAction` que devuelve `{ error, success }`, porque Next oculta el mensaje de los errores lanzados en producción.

**Tech Stack:** Next.js (App Router, server actions), React 19 (`useActionState`, `useTransition`), Base UI, react-hook-form + zod 4, vitest + Testing Library, sonner.

**Spec:** la auditoría de botones de esta misma sesión (2026-10-09): 5 eliminaciones sin confirmar, 5 cambios de estado irreversibles sin confirmar, 4 acciones de borrado sin botón y 3 campos obligatorios sin validación en cliente.

## Global Constraints

- Commits: `fase-conf-task N: descripción breve`, uno por tarea, push inmediato a `main` (RULES.md #3).
- Confirmación siempre en línea en la página (texto + "Sí, …" + "No"). Nunca `window.confirm`, nunca un `Dialog` adicional.
- Textos en español, con la pregunta terminada en "?" y diciendo qué pasa si no es obvio ("no se puede deshacer", "la orden queda cerrada").
- No cambiar permisos: cada botón nuevo se muestra solo a los roles que su acción ya admite (`requireRole` en la acción).
- No tocar el backlog de fases anteriores (RULES.md #7). En particular, no migrar los `delete…FormAction` existentes al nuevo helper.
- `npx tsc --noEmit` y `npm test` al final de cada tarea, no durante.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/components/confirmacion-en-linea.tsx` (nuevo) | Franja "pregunta + Sí + No" |
| `src/components/eliminar-con-confirmacion.tsx` | Pasa a usar `ConfirmacionEnLinea` |
| `src/components/quitar-con-confirmacion.tsx` (nuevo) | Botón ✕ de fila con confirmación |
| `src/lib/resultado-accion.ts` (nuevo) | Convierte un "lanza si rechaza" en `{ error, success }` |
| `src/app/actions/{usuario,item-orden,mano-de-obra,dvi,cita,cotizacion}-actions.ts` | Un `…FormAction` nuevo cada uno |
| Formularios de bodega, proveedor, repuesto, sede, usuario | Eliminar con confirmación |
| `ordenes/[id]/page.tsx`, `dvi-foto-form.tsx`, `cotizaciones/[id]/eliminar-item-cotizacion-button.tsx` | Quitar filas con confirmación |
| `citas/[id]/eliminar-cita-button.tsx` (nuevo) + `page.tsx` | Eliminar cita |
| `ordenes/[id]/cambiar-estado-form.tsx`, `generar-factura-form.tsx` | Confirmar cierre de orden y facturación |
| `cotizaciones/[id]/decision-cotizacion-buttons.tsx` | Confirmar aprobar/rechazar |
| `citas/[id]/cambiar-estado-cita-form.tsx` | Confirmar cancelar cita |
| `superadmin/tenant-row-actions.tsx` + `page.tsx` | Confirmar suspender taller |
| `nueva-marca-dialog.tsx`, `nuevo-modelo-dialog.tsx`, `nuevo-dvi-checklist-item-dialog.tsx`, `lib/validation/{vehiculo-marca-modelo,dvi}.ts` | Nombre obligatorio en cliente y con `trim` en servidor |

---

### Task 1: `ConfirmacionEnLinea` compartido

**Files:**
- Create: `src/components/confirmacion-en-linea.tsx`
- Create: `src/components/confirmacion-en-linea.test.tsx`
- Modify: `src/components/eliminar-con-confirmacion.tsx`

**Interfaces:**
- Produces: `ConfirmacionEnLinea({ pregunta: string; etiquetaConfirmar: string; onCancelar: () => void; onConfirmar?: () => void; pendiente?: boolean; enviaFormulario?: boolean; destructiva?: boolean })`. Con `enviaFormulario` el botón de confirmar es `type="submit"` del `<form>` que lo contiene.

- [ ] **Step 1: Test que falla** — `src/components/confirmacion-en-linea.test.tsx`

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmacionEnLinea } from "./confirmacion-en-linea";

describe("ConfirmacionEnLinea", () => {
  it("shows the question and calls onConfirmar / onCancelar", async () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <ConfirmacionEnLinea pregunta="¿Anular la orden?" etiquetaConfirmar="Sí, anular" onConfirmar={onConfirmar} onCancelar={onCancelar} />,
    );

    expect(screen.getByText("¿Anular la orden?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sí, anular" }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it("with enviaFormulario the confirm button submits the enclosing form", async () => {
    const onSubmit = vi.fn((evento: React.FormEvent) => evento.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ConfirmacionEnLinea pregunta="¿Seguro?" etiquetaConfirmar="Sí" enviaFormulario onCancelar={vi.fn()} />
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Sí" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while pendiente", () => {
    render(<ConfirmacionEnLinea pregunta="¿Seguro?" etiquetaConfirmar="Sí" pendiente onCancelar={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Sí" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/confirmacion-en-linea.test.tsx` → FAIL (el módulo no existe).

- [ ] **Step 3: Implementación** — `src/components/confirmacion-en-linea.tsx`

```tsx
"use client";

import { Button } from "@/components/ui/button";

/**
 * In-page "¿Seguro?" strip (never window.confirm) shared by every action
 * that is hard to undo. With `enviaFormulario` the confirm button is the
 * enclosing form's submit button, so the caller's form action runs on it.
 */
export function ConfirmacionEnLinea({
  pregunta,
  etiquetaConfirmar,
  onCancelar,
  onConfirmar,
  pendiente = false,
  enviaFormulario = false,
  destructiva = true,
}: {
  pregunta: string;
  etiquetaConfirmar: string;
  onCancelar: () => void;
  onConfirmar?: () => void;
  pendiente?: boolean;
  enviaFormulario?: boolean;
  destructiva?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>{pregunta}</span>
      <Button
        type={enviaFormulario ? "submit" : "button"}
        variant={destructiva ? "destructive" : "default"}
        size="sm"
        disabled={pendiente}
        onClick={onConfirmar}
      >
        {etiquetaConfirmar}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pendiente} onClick={onCancelar}>
        No
      </Button>
    </div>
  );
}
```

En `src/components/eliminar-con-confirmacion.tsx`, reemplazar el bloque `confirmando ? ( <div …>…</div> )` por:

```tsx
      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta={confirmacion}
          etiquetaConfirmar={pendiente ? "Eliminando..." : "Sí, eliminar"}
          pendiente={pendiente}
          onConfirmar={eliminar}
          onCancelar={() => setConfirmando(false)}
        />
      ) : (
```

y añadir `import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";`. El "No" queda deshabilitado mientras elimina (antes no lo estaba en la etiqueta, sí en el botón; mismo comportamiento).

- [ ] **Step 4:** `npx vitest run src/components` → PASS (incluye los 3 tests existentes de `eliminar-con-confirmacion`). `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 1: componente ConfirmacionEnLinea compartido` y push.

---

### Task 2: `resultadoDeAccion` y los envoltorios `…FormAction`

**Files:**
- Create: `src/lib/resultado-accion.ts`, `src/lib/resultado-accion.test.ts`
- Modify: `src/app/actions/usuario-actions.ts`, `item-orden-actions.ts`, `mano-de-obra-actions.ts`, `dvi-actions.ts`, `cita-actions.ts`, `cotizacion-actions.ts`

**Interfaces:**
- Produces: `interface ResultadoAccion { error: string | null; success: boolean }` y `resultadoDeAccion(accion: () => Promise<void>, mensajePorDefecto: string): Promise<ResultadoAccion>`.
- Produces (server actions, todas devuelven `Promise<ResultadoAccion>`):
  - `deleteUsuarioFormAction(usuarioId: string)`
  - `deleteItemOrdenFormAction(id: string, ordenId: string)`
  - `deleteManoDeObraFormAction(id: string, ordenId: string)`
  - `deleteDviFotoFormAction(id: string, ordenId: string)`
  - `deleteCitaFormAction(id: string)`
  - `eliminarItemCotizacionFormAction(id: string, cotizacionId: string)`

- [ ] **Step 1: Test que falla** — `src/lib/resultado-accion.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { resultadoDeAccion } from "./resultado-accion";

describe("resultadoDeAccion", () => {
  it("returns success when the action resolves", async () => {
    await expect(resultadoDeAccion(async () => {}, "Error")).resolves.toEqual({ error: null, success: true });
  });

  it("returns the thrown message as data", async () => {
    const resultado = await resultadoDeAccion(async () => {
      throw new Error("No puedes eliminar al único administrador del taller.");
    }, "Error al eliminar");
    expect(resultado).toEqual({ error: "No puedes eliminar al único administrador del taller.", success: false });
  });

  it("falls back to the default message for non-Error throws", async () => {
    const resultado = await resultadoDeAccion(async () => {
      throw "boom";
    }, "Error al eliminar");
    expect(resultado).toEqual({ error: "Error al eliminar", success: false });
  });

  it("re-throws Next's redirect/notFound control-flow errors", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await expect(
      resultadoDeAccion(async () => {
        throw redirect;
      }, "Error"),
    ).rejects.toBe(redirect);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/resultado-accion.test.ts` → FAIL.

- [ ] **Step 3: Implementación** — `src/lib/resultado-accion.ts`

```ts
export interface ResultadoAccion {
  error: string | null;
  success: boolean;
}

/**
 * Runs a void server action that refuses by throwing and returns the refusal
 * as data: Next redacts thrown messages in production builds, so a client
 * component must receive them as a return value. Next's own redirect /
 * notFound errors (digest "NEXT_...") keep propagating.
 */
export async function resultadoDeAccion(
  accion: () => Promise<void>,
  mensajePorDefecto: string,
): Promise<ResultadoAccion> {
  try {
    await accion();
  } catch (err) {
    if (typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : mensajePorDefecto, success: false };
  }
  return { error: null, success: true };
}
```

Añadir, justo debajo de cada acción original, en su archivo (todos ya son `"use server"`), con `import { resultadoDeAccion, type ResultadoAccion } from "@/lib/resultado-accion";`:

```ts
// usuario-actions.ts
export async function deleteUsuarioFormAction(usuarioId: string): Promise<ResultadoAccion> {
  return resultadoDeAccion(() => deleteUsuarioAction(usuarioId), "Error al eliminar el usuario");
}

// item-orden-actions.ts
export async function deleteItemOrdenFormAction(id: string, ordenId: string): Promise<ResultadoAccion> {
  return resultadoDeAccion(() => deleteItemOrdenAction(id, ordenId), "Error al quitar el ítem");
}

// mano-de-obra-actions.ts
export async function deleteManoDeObraFormAction(id: string, ordenId: string): Promise<ResultadoAccion> {
  return resultadoDeAccion(() => deleteManoDeObraAction(id, ordenId), "Error al quitar la mano de obra");
}

// dvi-actions.ts
export async function deleteDviFotoFormAction(id: string, ordenId: string): Promise<ResultadoAccion> {
  return resultadoDeAccion(() => deleteDviFotoAction(id, ordenId), "Error al eliminar la foto");
}

// cita-actions.ts
export async function deleteCitaFormAction(id: string): Promise<ResultadoAccion> {
  return resultadoDeAccion(() => deleteCitaAction(id), "Error al eliminar la cita");
}

// cotizacion-actions.ts
export async function eliminarItemCotizacionFormAction(id: string, cotizacionId: string): Promise<ResultadoAccion> {
  return resultadoDeAccion(() => eliminarItemCotizacionAction(id, cotizacionId), "Error al quitar el ítem");
}
```

Nota: `deleteDviFotoAction` solo borra la fila; el archivo queda en `uploads/` (la ruta que lo sirve exige sesión). Limpiar huérfanos queda fuera de este plan.

- [ ] **Step 4:** `npx vitest run src/lib/resultado-accion.test.ts` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 2: envoltorios FormAction para las eliminaciones que lanzan` y push.

---

### Task 3: Confirmar al eliminar bodega, proveedor, repuesto y sede

**Files:**
- Modify: `src/app/(dashboard)/bodegas/editar-bodega-form.tsx`, `proveedores/editar-proveedor-form.tsx`, `repuestos/editar-repuesto-form.tsx`, `sedes/editar-sede-form.tsx`
- Create: un `*.test.tsx` al lado de cada uno (no existen hoy)

**Interfaces:**
- Consumes: `EliminarConConfirmacion` (Task 1) y los `delete…FormAction(id, prevState)` existentes.

- [ ] **Step 1: Tests que fallan.** `src/app/(dashboard)/bodegas/editar-bodega-form.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockDelete = vi.fn();
vi.mock("@/app/actions/bodega-actions", () => ({
  updateBodegaAction: vi.fn(),
  deleteBodegaFormAction: (...args: unknown[]) => mockDelete(...args),
}));

import { EditarBodegaForm } from "./editar-bodega-form";

// Production always renders this form inside a Dialog (DialogClose needs its context).
function renderInDialog(ui: ReactNode) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("EditarBodegaForm — eliminar", () => {
  beforeEach(() => mockDelete.mockReset());

  it("asks before deleting and only then calls deleteBodegaFormAction", async () => {
    mockDelete.mockResolvedValue({ error: null, success: true });
    renderInDialog(<EditarBodegaForm bodega={{ id: "b1", nombre: "Principal" }} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Principal/ }));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar la bodega Principal? No se puede deshacer.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith("b1", expect.anything()));
  });

  it("shows the refusal reason", async () => {
    mockDelete.mockResolvedValue({ error: "La bodega tiene repuestos asociados", success: false });
    renderInDialog(<EditarBodegaForm bodega={{ id: "b1", nombre: "Principal" }} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Principal/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La bodega tiene repuestos asociados");
  });
});
```

Los otros tres tests son el mismo par de casos, cambiando:

| Archivo de test | Mock | Props | Botón | Pregunta |
|---|---|---|---|---|
| `proveedores/editar-proveedor-form.test.tsx` | `@/app/actions/proveedor-actions` → `updateProveedorAction`, `deleteProveedorFormAction` | `proveedor={{ id: "p1", nombre: "Autopartes SAS", documento: null, direccion: null, contacto: null, telefono: null, email: null, diasEntrega: 3 }}` | `/Eliminar Autopartes SAS/` | `¿Eliminar el proveedor Autopartes SAS? No se puede deshacer.` |
| `repuestos/editar-repuesto-form.test.tsx` | `@/app/actions/repuesto-actions` → `updateRepuestoAction`, `deleteRepuestoFormAction` | `repuesto={{ id: "r1", codigo: "FIL-1", nombre: "Filtro de aceite", descripcion: null, precioCompra: 10000, precioVenta: 15000, stockMinimo: 1, stockMaximo: null, multiploCompra: 1, bodegaId: "b1", proveedorId: null }} bodegas={[]} proveedores={[]}` | `/Eliminar Filtro de aceite/` | `¿Eliminar el repuesto Filtro de aceite? No se puede deshacer.` |
| `sedes/editar-sede-form.test.tsx` | `@/app/actions/sede-actions` → `updateSedeAction`, `deleteSedeFormAction` | `sede={{ id: "s1", nombre: "Norte", direccion: null } as Sede}` (con `import type { Sede } from "@/generated/prisma-tenant"`) | `/Eliminar Norte/` | `¿Eliminar la sede Norte? No se puede deshacer.` |

El mensaje de rechazo del segundo caso puede ser cualquier texto; solo se comprueba que se muestra.

- [ ] **Step 2:** `npx vitest run src/app/(dashboard)/bodegas src/app/(dashboard)/proveedores src/app/(dashboard)/repuestos src/app/(dashboard)/sedes` → los 4 nuevos FAIL (el primer clic ya llama a la acción y no hay pregunta).

- [ ] **Step 3: Implementación.** En cada formulario:
  1. Borrar el segundo `useActionState` (`deleteState`, `deleteFormAction`, `isDeletePending`).
  2. Reemplazar el `<form action={deleteFormAction} …>…</form>` del final por `EliminarConConfirmacion`.
  3. Añadir `import { toast } from "sonner";` y `import { EliminarConConfirmacion } from "@/components/eliminar-con-confirmacion";`.

Bodega (`editar-bodega-form.tsx`):

```tsx
      <EliminarConConfirmacion
        etiqueta={`Eliminar ${bodega.nombre}`}
        confirmacion={`¿Eliminar la bodega ${bodega.nombre}? No se puede deshacer.`}
        accion={() => deleteBodegaFormAction(bodega.id, initialState)}
        onEliminado={() => toast.success(`Bodega ${bodega.nombre} eliminada`)}
      />
```

Proveedor:

```tsx
      <EliminarConConfirmacion
        etiqueta={`Eliminar ${proveedor.nombre}`}
        confirmacion={`¿Eliminar el proveedor ${proveedor.nombre}? No se puede deshacer.`}
        accion={() => deleteProveedorFormAction(proveedor.id, initialState)}
        onEliminado={() => toast.success(`Proveedor ${proveedor.nombre} eliminado`)}
      />
```

Repuesto:

```tsx
      <EliminarConConfirmacion
        etiqueta={`Eliminar ${repuesto.nombre}`}
        confirmacion={`¿Eliminar el repuesto ${repuesto.nombre}? No se puede deshacer.`}
        accion={() => deleteRepuestoFormAction(repuesto.id, initialState)}
        onEliminado={() => toast.success(`Repuesto ${repuesto.nombre} eliminado`)}
      />
```

Sede:

```tsx
      <EliminarConConfirmacion
        etiqueta={`Eliminar ${sede.nombre}`}
        confirmacion={`¿Eliminar la sede ${sede.nombre}? No se puede deshacer.`}
        accion={() => deleteSedeFormAction(sede.id, initialState)}
        onEliminado={() => toast.success(`Sede ${sede.nombre} eliminada`)}
      />
```

Si `Alert`/`AlertDescription` quedan usados solo por el formulario de edición, se mantienen; si `tsc`/eslint marca un import sin uso, quitarlo.

- [ ] **Step 4:** los 4 archivos de test PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 3: confirmar al eliminar bodega, proveedor, repuesto y sede` y push.

---

### Task 4: Eliminar usuario con confirmación y con el motivo del rechazo

Hoy el botón llama a `deleteUsuarioAction` directamente: borra sin preguntar y, si la acción rechaza ("único administrador"), el error se lanza sin mostrarse. En `/usuarios/[id]` además deja al usuario en la página de un registro que ya no existe.

**Files:**
- Modify: `src/app/(dashboard)/usuarios/[id]/editar-usuario-form.tsx`
- Modify: `src/app/(dashboard)/usuarios/[id]/editar-usuario-form.test.tsx`

**Interfaces:**
- Consumes: `deleteUsuarioFormAction(usuarioId)` (Task 2), `EliminarConConfirmacion` (Task 1).

- [ ] **Step 1: Tests.** En `editar-usuario-form.test.tsx`: cambiar el mock `deleteUsuarioAction` por `deleteUsuarioFormAction: (...args: unknown[]) => mockDeleteUsuarioFormAction(...args)` (renombrar la variable), añadir el mock de navegación arriba del archivo:

```tsx
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: vi.fn() }) }));
```

y reemplazar el test `"calls deleteUsuarioAction with the usuario id when the delete button is clicked"` por:

```tsx
  it("asks before deleting, then deletes and goes back to /usuarios", async () => {
    mockDeleteUsuarioFormAction.mockResolvedValue({ error: null, success: true });
    render(<EditarUsuarioForm usuario={USUARIO} sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar usuario/ }));
    expect(mockDeleteUsuarioFormAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDeleteUsuarioFormAction).toHaveBeenCalledWith("u1"));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/usuarios"));
  });

  it("shows why the delete was refused", async () => {
    mockDeleteUsuarioFormAction.mockResolvedValue({
      error: "No puedes eliminar al único administrador del taller.",
      success: false,
    });
    render(<EditarUsuarioForm usuario={USUARIO} sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar usuario/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("único administrador");
    expect(mockPush).not.toHaveBeenCalled();
  });
```

Si el archivo ya mockea `next/navigation`, añadir `push: mockPush` a ese mock en lugar de duplicarlo. Si `USUARIO.nombre` no es el que aparece en la pregunta, no importa: los tests no la comprueban.

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación.** En `editar-usuario-form.tsx`: importar `deleteUsuarioFormAction` en lugar de `deleteUsuarioAction`, `useRouter` de `next/navigation`, `toast` de `sonner` y `EliminarConConfirmacion`; `const router = useRouter();` al inicio del componente; reemplazar el `<form action={deleteUsuarioAction.bind(null, usuario.id)} …>…</form>` por:

```tsx
      <EliminarConConfirmacion
        etiqueta="Eliminar usuario"
        confirmacion={`¿Eliminar a ${usuario.nombre} (${usuario.email})? Perderá el acceso y no se puede deshacer.`}
        accion={() => deleteUsuarioFormAction(usuario.id)}
        onEliminado={() => {
          toast.success(`Usuario ${usuario.nombre} eliminado`);
          router.push("/usuarios");
        }}
      />
```

(`router.push("/usuarios")` sirve en los dos sitios donde se monta el formulario: en `/usuarios/[id]` vuelve al listado; en el diálogo del listado la fila desaparece y el diálogo se desmonta.)

- [ ] **Step 4:** tests de `usuarios/` PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 4: eliminar usuario con confirmación y motivo del rechazo` y push.

---

### Task 5: `QuitarConConfirmacion` — quitar ítems y mano de obra de una orden, e ítems de cotización

**Files:**
- Create: `src/components/quitar-con-confirmacion.tsx`, `src/components/quitar-con-confirmacion.test.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx`
- Modify: `src/app/(dashboard)/cotizaciones/[id]/eliminar-item-cotizacion-button.tsx`

**Interfaces:**
- Consumes: `ConfirmacionEnLinea` (Task 1); `deleteItemOrdenFormAction`, `deleteManoDeObraFormAction`, `eliminarItemCotizacionFormAction` (Task 2); `ResultadoAccion`.
- Produces: `QuitarConConfirmacion({ etiqueta: string; pregunta: string; accion: () => Promise<ResultadoAccion>; onQuitado?: () => void })`. `etiqueta` es el `aria-label` del botón ✕.

- [ ] **Step 1: Test que falla** — `src/components/quitar-con-confirmacion.test.tsx`

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockToastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() } }));

import { QuitarConConfirmacion } from "./quitar-con-confirmacion";

describe("QuitarConConfirmacion", () => {
  beforeEach(() => mockToastError.mockReset());

  it("asks before calling the action, then calls onQuitado", async () => {
    const accion = vi.fn().mockResolvedValue({ error: null, success: true });
    const onQuitado = vi.fn();
    render(<QuitarConConfirmacion etiqueta="Quitar Filtro" pregunta="¿Quitar Filtro?" accion={accion} onQuitado={onQuitado} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro" }));
    expect(accion).not.toHaveBeenCalled();
    expect(screen.getByText("¿Quitar Filtro?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    await vi.waitFor(() => expect(onQuitado).toHaveBeenCalledTimes(1));
  });

  it("toasts the refusal and goes back to the icon button", async () => {
    const accion = vi.fn().mockResolvedValue({ error: "No se puede modificar una orden en estado ENTREGADA.", success: false });
    render(<QuitarConConfirmacion etiqueta="Quitar Filtro" pregunta="¿Quitar Filtro?" accion={accion} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));

    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith("No se puede modificar una orden en estado ENTREGADA."));
    expect(screen.getByRole("button", { name: "Quitar Filtro" })).toBeInTheDocument();
  });

  it("'No' backs out without calling the action", async () => {
    const accion = vi.fn();
    render(<QuitarConConfirmacion etiqueta="Quitar Filtro" pregunta="¿Quitar Filtro?" accion={accion} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro" }));
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(accion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementación** — `src/components/quitar-con-confirmacion.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { ResultadoAccion } from "@/lib/resultado-accion";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Button } from "@/components/ui/button";

/**
 * Row-sized remove control (✕, then "¿Quitar …? Sí / No") for table rows
 * such as an orden's ítems. The refusal goes to a toast: a row has no room
 * for an inline alert. The server action's revalidatePath refreshes the list.
 */
export function QuitarConConfirmacion({
  etiqueta,
  pregunta,
  accion,
  onQuitado,
}: {
  etiqueta: string;
  pregunta: string;
  accion: () => Promise<ResultadoAccion>;
  onQuitado?: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function quitar() {
    startTransition(async () => {
      const resultado = await accion();
      setConfirmando(false);
      if (resultado.error) {
        toast.error(resultado.error);
        return;
      }
      onQuitado?.();
    });
  }

  if (confirmando) {
    return (
      <ConfirmacionEnLinea
        pregunta={pregunta}
        etiquetaConfirmar={pendiente ? "Quitando..." : "Sí, quitar"}
        pendiente={pendiente}
        onConfirmar={quitar}
        onCancelar={() => setConfirmando(false)}
      />
    );
  }

  return (
    <Button type="button" variant="ghost" size="sm" aria-label={etiqueta} onClick={() => setConfirmando(true)}>
      <X className="size-4" />
    </Button>
  );
}
```

`src/app/(dashboard)/cotizaciones/[id]/eliminar-item-cotizacion-button.tsx` (mismas props, la página no cambia):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { eliminarItemCotizacionFormAction } from "@/app/actions/cotizacion-actions";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";

export function EliminarItemCotizacionButton({ itemId, cotizacionId }: { itemId: string; cotizacionId: string }) {
  const router = useRouter();

  return (
    <QuitarConConfirmacion
      etiqueta="Quitar ítem"
      pregunta="¿Quitar este ítem de la cotización?"
      accion={() => eliminarItemCotizacionFormAction(itemId, cotizacionId)}
      onQuitado={() => router.refresh()}
    />
  );
}
```

En `src/app/(dashboard)/ordenes/[id]/page.tsx`:
1. Imports: `import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";`, `import { deleteItemOrdenFormAction } from "@/app/actions/item-orden-actions";`, `import { deleteManoDeObraFormAction } from "@/app/actions/mano-de-obra-actions";`.
2. Debajo de `MANO_OBRA_COLUMNS`, añadir:

```tsx
// Remove column only while the orden is still editable and for the roles the
// delete actions accept (ADMIN/RECEPCION) -- same rule as the add forms.
function conColumnaQuitar<T extends { id: string }>(
  columns: DataTableColumn<T>[],
  puedeQuitar: boolean,
  quitar: (fila: T) => { etiqueta: string; pregunta: string; accion: () => Promise<{ error: string | null; success: boolean }> },
): DataTableColumn<T>[] {
  if (!puedeQuitar) return columns;
  return [
    ...columns,
    {
      header: "",
      className: "text-right",
      cell: (fila) => <QuitarConConfirmacion {...quitar(fila)} />,
    },
  ];
}
```

3. Dentro de `OrdenDetailPage`, después de `const esAdmin = …`:

```tsx
  const puedeQuitar = esOrdenMutable(orden) && session.user.role !== "TECNICO";
  const itemsColumns = conColumnaQuitar(ITEMS_COLUMNS, puedeQuitar, (item) => ({
    etiqueta: `Quitar ${item.descripcion}`,
    pregunta: `¿Quitar ${item.descripcion} de la orden?`,
    accion: deleteItemOrdenFormAction.bind(null, item.id, orden.id),
  }));
  const manoObraColumns = conColumnaQuitar(MANO_OBRA_COLUMNS, puedeQuitar, (linea) => ({
    etiqueta: `Quitar ${linea.descripcion}`,
    pregunta: `¿Quitar "${linea.descripcion}" de la orden?`,
    accion: deleteManoDeObraFormAction.bind(null, linea.id, orden.id),
  }));
```

4. En los dos `DataTable`, `columns={ITEMS_COLUMNS}` → `columns={itemsColumns}` y `columns={MANO_OBRA_COLUMNS}` → `columns={manoObraColumns}`.

(`.bind` sobre una server action en un Server Component es válido y produce una referencia serializable que el componente cliente puede llamar.)

- [ ] **Step 4:** `npx vitest run src/components src/app/(dashboard)/cotizaciones src/app/(dashboard)/ordenes` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 5: quitar ítems y mano de obra de la orden con confirmación` y push.

---

### Task 6: Borrar fotos del DVI

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.test.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx`

**Interfaces:**
- Consumes: `QuitarConConfirmacion` (Task 5), `deleteDviFotoFormAction` (Task 2).
- Produces: prop nueva `puedeEliminar?: boolean` (default `false`) en `DviFotoForm`.

- [ ] **Step 1: Tests.** En `dvi-foto-form.test.tsx`, añadir `deleteDviFotoFormAction: (...args: unknown[]) => mockDeleteDviFotoFormAction(...args)` al mock existente de `@/app/actions/dvi-actions` (con `const mockDeleteDviFotoFormAction = vi.fn();` arriba) y estos casos, reutilizando el arreglo de fotos que ya usa el test `"renders one bordered image per foto, captioned by momento"`:

```tsx
  it("offers a remove button per foto only when puedeEliminar", () => {
    const { rerender } = render(<DviFotoForm ordenId="o1" fotos={FOTOS} />);
    expect(screen.queryByRole("button", { name: /Eliminar foto/ })).not.toBeInTheDocument();

    rerender(<DviFotoForm ordenId="o1" fotos={FOTOS} puedeEliminar />);
    expect(screen.getAllByRole("button", { name: /Eliminar foto/ })).toHaveLength(FOTOS.length);
  });

  it("asks before deleting a foto", async () => {
    mockDeleteDviFotoFormAction.mockResolvedValue({ error: null, success: true });
    render(<DviFotoForm ordenId="o1" fotos={FOTOS} puedeEliminar />);

    await userEvent.click(screen.getAllByRole("button", { name: /Eliminar foto/ })[0]);
    expect(mockDeleteDviFotoFormAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));

    await vi.waitFor(() => expect(mockDeleteDviFotoFormAction).toHaveBeenCalledWith(FOTOS[0].id, "o1"));
  });
```

Si el test existente define las fotos en línea, extraerlas a una constante `FOTOS` al inicio del `describe`.

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación.** En `dvi-foto-form.tsx`: importar `QuitarConConfirmacion` y `deleteDviFotoFormAction`; añadir la prop:

```tsx
  /** ADMIN/RECEPCION on an editable orden -- the roles deleteDviFotoAction accepts. */
  puedeEliminar?: boolean;
```

(con `puedeEliminar = false` en la desestructuración), y cambiar el `<figcaption>` por:

```tsx
              <figcaption className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-muted-foreground">
                {foto.momento === "ANTES" ? "Antes" : "Después"}
                {puedeEliminar ? (
                  <QuitarConConfirmacion
                    etiqueta={`Eliminar foto ${foto.momento === "ANTES" ? "antes" : "después"}`}
                    pregunta="¿Eliminar esta foto?"
                    accion={() => deleteDviFotoFormAction(foto.id, ordenId)}
                  />
                ) : null}
              </figcaption>
```

En `ordenes/[id]/page.tsx`, en el `<DviFotoForm …>`, añadir `puedeEliminar={puedeQuitar}` (la variable de Task 5).

- [ ] **Step 4:** `npx vitest run "src/app/(dashboard)/ordenes"` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 6: borrar fotos del DVI con confirmación` y push.

---

### Task 7: Eliminar una cita

**Files:**
- Create: `src/app/(dashboard)/citas/[id]/eliminar-cita-button.tsx`, `eliminar-cita-button.test.tsx`
- Modify: `src/app/(dashboard)/citas/[id]/page.tsx`

**Interfaces:**
- Consumes: `EliminarConConfirmacion` (Task 1), `deleteCitaFormAction` (Task 2).
- Produces: `EliminarCitaButton({ citaId: string; descripcion: string })`.

- [ ] **Step 1: Test que falla** — `eliminar-cita-button.test.tsx`

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDelete = vi.fn();
const mockPush = vi.fn();
vi.mock("@/app/actions/cita-actions", () => ({ deleteCitaFormAction: (...args: unknown[]) => mockDelete(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { EliminarCitaButton } from "./eliminar-cita-button";

describe("EliminarCitaButton", () => {
  it("asks first, deletes, and goes back to /citas", async () => {
    mockDelete.mockResolvedValue({ error: null, success: true });
    render(<EliminarCitaButton citaId="c1" descripcion="ABC123 · 10 oct, 9:00" />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar cita/ }));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/¿Eliminar la cita ABC123 · 10 oct, 9:00\?/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith("c1"));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/citas"));
  });
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementación** — `eliminar-cita-button.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCitaFormAction } from "@/app/actions/cita-actions";
import { EliminarConConfirmacion } from "@/components/eliminar-con-confirmacion";

/** ADMIN-only (deleteCitaAction's role). For a mistaken entry; a no-show is "Cancelada", not a delete. */
export function EliminarCitaButton({ citaId, descripcion }: { citaId: string; descripcion: string }) {
  const router = useRouter();

  return (
    <EliminarConConfirmacion
      etiqueta="Eliminar cita"
      confirmacion={`¿Eliminar la cita ${descripcion}? Para una cita que no se hizo, usa el estado Cancelada. No se puede deshacer.`}
      accion={() => deleteCitaFormAction(citaId)}
      onEliminado={() => {
        toast.success("Cita eliminada");
        router.push("/citas");
      }}
    />
  );
}
```

En `citas/[id]/page.tsx`: importar `EliminarCitaButton`; dentro del `<CardContent>` de la tarjeta "Estado actual", debajo de `<CambiarEstadoCitaForm …/>`, envolver ambos en `<CardContent className="flex flex-col gap-4">` y añadir:

```tsx
              {session.user.role === "ADMIN" ? (
                <EliminarCitaButton
                  citaId={cita.id}
                  descripcion={`${cita.vehiculo.placa} · ${formatoFechaCorta.format(cita.fechaHora)} ${formatoHora.format(cita.fechaHora)}`}
                />
              ) : null}
```

(`formatoFechaCorta` y `formatoHora` ya están declarados en esa página.)

- [ ] **Step 4:** `npx vitest run "src/app/(dashboard)/citas"` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 7: eliminar cita con confirmación` y push.

---

### Task 8: Confirmar al entregar/anular una orden y al generar la factura

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx`, `cambiar-estado-form.test.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/generar-factura-form.tsx`
- Create: `src/app/(dashboard)/ordenes/[id]/generar-factura-form.test.tsx`

**Interfaces:**
- Consumes: `ConfirmacionEnLinea` con `enviaFormulario` (Task 1).

Patrón (también para Tasks 9–11): el primer submit se intercepta con `evento.preventDefault()` en `onSubmit` (React no ejecuta la `action` del form si el evento se canceló) y muestra la franja; el botón "Sí, …" es el submit que pasa. Cualquier cambio en el formulario cancela la confirmación pendiente.

- [ ] **Step 1: Tests.** En `cambiar-estado-form.test.tsx`, el test `"submits the estado the user actually selected, not just the default"` elige `Anulada`: tras el clic en "Cambiar estado" añadir

```tsx
    expect(mockUpdateEstadoOrdenAction).not.toHaveBeenCalled();
    expect(screen.getByText("¿Anular la orden? Ya no se podrá editar.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sí, anular" }));
```

antes de `expect(mockUpdateEstadoOrdenAction).toHaveBeenCalled();` (cambiarlo a `await vi.waitFor(() => expect(...).toHaveBeenCalled())`). Y añadir:

```tsx
  it("does not ask for a non-closing estado (EN_PROCESO)", async () => {
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));

    await vi.waitFor(() => expect(mockUpdateEstadoOrdenAction).toHaveBeenCalled());
    expect(screen.queryByText(/¿Anular/)).not.toBeInTheDocument();
  });

  it("asks before ENTREGADA and lets the user back out", async () => {
    render(<CambiarEstadoForm ordenId="o1" estadoActual="TERMINADA" />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));
    expect(screen.getByText("¿Marcar la orden como entregada? Ya no se podrá editar.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(mockUpdateEstadoOrdenAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeInTheDocument();
  });
```

`generar-factura-form.test.tsx` (nuevo):

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrearFactura = vi.fn();
const mockPush = vi.fn();
vi.mock("@/app/actions/factura-actions", () => ({ crearFacturaAction: (...args: unknown[]) => mockCrearFactura(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { GenerarFacturaForm } from "./generar-factura-form";

describe("GenerarFacturaForm", () => {
  it("asks before invoicing, then creates the factura and navigates to it", async () => {
    mockCrearFactura.mockResolvedValue({ error: null, success: true, facturaId: "f1" });
    render(<GenerarFacturaForm ordenId="o1" />);

    await userEvent.click(screen.getByRole("button", { name: "Generar factura" }));
    expect(mockCrearFactura).not.toHaveBeenCalled();
    expect(
      screen.getByText("¿Generar la factura? Se descuenta el stock de los repuestos y la orden ya no se podrá editar."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, facturar" }));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/facturas/f1"));
  });

  it("'No' cancels without invoicing", async () => {
    render(<GenerarFacturaForm ordenId="o1" />);

    await userEvent.click(screen.getByRole("button", { name: "Generar factura" }));
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(mockCrearFactura).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementación** — `cambiar-estado-form.tsx`

```tsx
import { useActionState, useState, type FormEvent } from "react";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
// …imports existentes

// Estados después de los cuales la orden ya no se puede editar (mutable-guard.ts).
const CONFIRMACIONES: Partial<Record<EstadoOrden, { pregunta: string; etiqueta: string }>> = {
  ENTREGADA: { pregunta: "¿Marcar la orden como entregada? Ya no se podrá editar.", etiqueta: "Sí, entregar" },
  ANULADA: { pregunta: "¿Anular la orden? Ya no se podrá editar.", etiqueta: "Sí, anular" },
};
```

Dentro del componente:

```tsx
  const [confirmando, setConfirmando] = useState<EstadoOrden | null>(null);

  function onSubmit(evento: FormEvent<HTMLFormElement>) {
    const estado = new FormData(evento.currentTarget).get("estado") as EstadoOrden;
    if (CONFIRMACIONES[estado] && confirmando !== estado) {
      evento.preventDefault();
      setConfirmando(estado);
      return;
    }
    setConfirmando(null);
  }
```

El `<form>` pasa a `<form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-6">`; el `SelectField` recibe `onValueChange={() => setConfirmando(null)}`; y el botón se reemplaza por:

```tsx
      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta={CONFIRMACIONES[confirmando]!.pregunta}
          etiquetaConfirmar={CONFIRMACIONES[confirmando]!.etiqueta}
          enviaFormulario
          pendiente={isPending}
          onCancelar={() => setConfirmando(null)}
        />
      ) : (
        <Button type="submit" disabled={isPending} className="self-end">
          {isPending ? "Guardando..." : "Cambiar estado"}
        </Button>
      )}
```

`generar-factura-form.tsx`: añadir `const [confirmando, setConfirmando] = useState(false);` y `import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";`. Al inicio de `onValid`:

```tsx
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
```

El `<form>` recibe `onChange={() => setConfirmando(false)}`, y el botón se reemplaza por:

```tsx
      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta="¿Generar la factura? Se descuenta el stock de los repuestos y la orden ya no se podrá editar."
          etiquetaConfirmar="Sí, facturar"
          destructiva={false}
          enviaFormulario
          pendiente={isPending}
          onCancelar={() => setConfirmando(false)}
        />
      ) : (
        <Button type="submit" disabled={isPending} className="self-end">
          {isPending ? "Generando..." : "Generar factura"}
        </Button>
      )}
```

(El submit de "Sí, facturar" vuelve a pasar por `handleSubmit`, así que el descuento se revalida antes de facturar.)

- [ ] **Step 4:** `npx vitest run "src/app/(dashboard)/ordenes"` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 8: confirmar entregar/anular orden y generar factura` y push.

---

### Task 9: Confirmar aprobar y rechazar una cotización

**Files:**
- Modify: `src/app/(dashboard)/cotizaciones/[id]/decision-cotizacion-buttons.tsx`
- Create: `src/app/(dashboard)/cotizaciones/[id]/decision-cotizacion-buttons.test.tsx`

- [ ] **Step 1: Test que falla**

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAprobar = vi.fn();
const mockRechazar = vi.fn();
const mockPush = vi.fn();
vi.mock("@/app/actions/cotizacion-actions", () => ({
  aprobarCotizacionAction: (...args: unknown[]) => mockAprobar(...args),
  rechazarCotizacionAction: (...args: unknown[]) => mockRechazar(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DecisionCotizacionButtons } from "./decision-cotizacion-buttons";

describe("DecisionCotizacionButtons", () => {
  beforeEach(() => {
    mockAprobar.mockReset();
    mockRechazar.mockReset();
  });

  it("asks before approving, then approves and opens the new orden", async () => {
    mockAprobar.mockResolvedValue({ error: null, success: true, ordenId: "o9" });
    render(<DecisionCotizacionButtons cotizacionId="c1" />);

    await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    expect(mockAprobar).not.toHaveBeenCalled();
    expect(screen.getByText("¿Aprobar la cotización? Se creará una orden de trabajo con sus ítems.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, aprobar" }));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/ordenes/o9"));
  });

  it("asks before rejecting, then rejects", async () => {
    mockRechazar.mockResolvedValue({ error: null, success: true });
    render(<DecisionCotizacionButtons cotizacionId="c1" />);

    await userEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(mockRechazar).not.toHaveBeenCalled();
    expect(screen.getByText("¿Rechazar la cotización?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, rechazar" }));
    await vi.waitFor(() => expect(mockRechazar).toHaveBeenCalledWith("c1", expect.anything(), expect.any(FormData)));
  });

  it("'No' returns to both buttons without calling anything", async () => {
    render(<DecisionCotizacionButtons cotizacionId="c1" />);

    await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(mockAprobar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementación.** Importar `ConfirmacionEnLinea`. Añadir `const [confirmando, setConfirmando] = useState<"aprobar" | "rechazar" | null>(null);`. En `onAprobar`, en la rama de error, añadir `setConfirmando(null);` junto a `setAprobarState(result)`. En el `useEffect` de `rechazarState`, añadir `setConfirmando(null);` como primera línea. Reemplazar `<div className="flex gap-2">…</div>` por:

```tsx
      {confirmando === "aprobar" ? (
        <ConfirmacionEnLinea
          pregunta="¿Aprobar la cotización? Se creará una orden de trabajo con sus ítems."
          etiquetaConfirmar={isAprobando ? "Aprobando..." : "Sí, aprobar"}
          destructiva={false}
          pendiente={isAprobando}
          onConfirmar={onAprobar}
          onCancelar={() => setConfirmando(null)}
        />
      ) : confirmando === "rechazar" ? (
        <form action={rechazarAction}>
          <ConfirmacionEnLinea
            pregunta="¿Rechazar la cotización?"
            etiquetaConfirmar={isRechazando ? "Rechazando..." : "Sí, rechazar"}
            enviaFormulario
            pendiente={isRechazando}
            onCancelar={() => setConfirmando(null)}
          />
        </form>
      ) : (
        <div className="flex gap-2">
          <Button type="button" onClick={() => setConfirmando("aprobar")} disabled={isAprobando || isRechazando} className="flex-1">
            Aprobar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmando("rechazar")}
            disabled={isAprobando || isRechazando}
            className="flex-1"
          >
            Rechazar
          </Button>
        </div>
      )}
```

- [ ] **Step 4:** `npx vitest run "src/app/(dashboard)/cotizaciones"` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 9: confirmar aprobar y rechazar cotización` y push.

---

### Task 10: Confirmar al cancelar una cita

**Files:**
- Modify: `src/app/(dashboard)/citas/[id]/cambiar-estado-cita-form.tsx`, `cambiar-estado-cita-form.test.tsx`

- [ ] **Step 1: Tests** (añadir a `cambiar-estado-cita-form.test.tsx`; el archivo ya mockea `cambiarEstadoCitaAction` — usar su variable de mock, aquí `mockCambiarEstado`):

```tsx
  it("asks before cancelling the cita", async () => {
    mockCambiarEstado.mockResolvedValue({ error: null, success: true });
    render(<CambiarEstadoCitaForm citaId="c1" estadoActual="PROGRAMADA" />);

    await userEvent.click(screen.getByLabelText("Cancelada"));
    await userEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
    expect(mockCambiarEstado).not.toHaveBeenCalled();
    expect(screen.getByText("¿Cancelar la cita? Se puede volver a programar después.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    await vi.waitFor(() => expect(mockCambiarEstado).toHaveBeenCalled());
  });

  it("does not ask for other estados", async () => {
    mockCambiarEstado.mockResolvedValue({ error: null, success: true });
    render(<CambiarEstadoCitaForm citaId="c1" estadoActual="PROGRAMADA" />);

    await userEvent.click(screen.getByLabelText("Confirmada"));
    await userEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));

    await vi.waitFor(() => expect(mockCambiarEstado).toHaveBeenCalled());
  });
```


- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementación.** Importar `useState`, `type FormEvent` y `ConfirmacionEnLinea`. En el componente:

```tsx
  const [confirmando, setConfirmando] = useState(false);

  function onSubmit(evento: FormEvent<HTMLFormElement>) {
    const estado = new FormData(evento.currentTarget).get("estado");
    if (estado === "CANCELADA" && estadoActual !== "CANCELADA" && !confirmando) {
      evento.preventDefault();
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
  }
```

`<form noValidate action={formAction} onSubmit={onSubmit} onChange={() => setConfirmando(false)} className="flex flex-col gap-4">`, y el botón:

```tsx
      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta="¿Cancelar la cita? Se puede volver a programar después."
          etiquetaConfirmar="Sí, cancelar"
          enviaFormulario
          pendiente={isPending}
          onCancelar={() => setConfirmando(false)}
        />
      ) : (
        <Button type="submit" disabled={isPending} className="self-end">
          {isPending ? "Guardando..." : "Actualizar estado"}
        </Button>
      )}
```

- [ ] **Step 4:** `npx vitest run "src/app/(dashboard)/citas"` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 10: confirmar al cancelar una cita` y push.

---

### Task 11: Confirmar al suspender un taller (superadmin)

**Files:**
- Modify: `src/app/superadmin/tenant-row-actions.tsx`, `tenant-row-actions.test.tsx`
- Modify: `src/app/superadmin/page.tsx:134`

**Interfaces:**
- Produces: `EstadoTenantButton` recibe una prop nueva obligatoria `nombre: string`.

- [ ] **Step 1: Tests.** En `tenant-row-actions.test.tsx`, pasar `nombre="Taller Norte"` a todos los `EstadoTenantButton` existentes y añadir (usando la variable de mock de `cambiarEstadoTenantAction` del archivo, aquí `mockCambiarEstado`):

```tsx
  it("asks before suspending a tenant", async () => {
    mockCambiarEstado.mockResolvedValue({ error: null, success: true });
    render(<EstadoTenantButton tenantId="t1" nombre="Taller Norte" estadoActual="ACTIVO" />);

    await userEvent.click(screen.getByRole("button", { name: "Suspender" }));
    expect(mockCambiarEstado).not.toHaveBeenCalled();
    expect(screen.getByText("¿Suspender Taller Norte? Sus usuarios no podrán entrar hasta que lo actives.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, suspender" }));
    await vi.waitFor(() => expect(mockCambiarEstado).toHaveBeenCalled());
  });

  it("activates without asking", async () => {
    mockCambiarEstado.mockResolvedValue({ error: null, success: true });
    render(<EstadoTenantButton tenantId="t1" nombre="Taller Norte" estadoActual="SUSPENDIDO" />);

    await userEvent.click(screen.getByRole("button", { name: "Activar" }));

    await vi.waitFor(() => expect(mockCambiarEstado).toHaveBeenCalled());
  });
```

Si el archivo no mockea `cambiarEstadoTenantAction` con una variable, añadir `const mockCambiarEstado = vi.fn();` y exponerlo en su `vi.mock("@/app/actions/super-admin-actions", …)`.

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementación.** En `EstadoTenantButton`: prop `nombre: string`; `const [confirmando, setConfirmando] = useState(false);` (importar `useState`, `type FormEvent`, `ConfirmacionEnLinea`);

```tsx
  function onSubmit(evento: FormEvent<HTMLFormElement>) {
    if (nuevoEstado === "SUSPENDIDO" && !confirmando) {
      evento.preventDefault();
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
  }
```

`<form action={estadoFormAction} onSubmit={onSubmit} className="flex flex-col gap-1.5">`, y el `<Button>` actual pasa a ser la rama `else` de:

```tsx
      {confirmando ? (
        <ConfirmacionEnLinea
          pregunta={`¿Suspender ${nombre}? Sus usuarios no podrán entrar hasta que lo actives.`}
          etiquetaConfirmar="Sí, suspender"
          enviaFormulario
          pendiente={estadoPending}
          onCancelar={() => setConfirmando(false)}
        />
      ) : (
        <Button …igual que hoy…>
      )}
```

En `superadmin/page.tsx:134`: `<EstadoTenantButton tenantId={tenant.id} nombre={tenant.nombre} estadoActual={tenant.estado} />`.

- [ ] **Step 4:** `npx vitest run src/app/superadmin` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 11: confirmar al suspender un taller` y push.

---

### Task 12: Nombre obligatorio en "Nueva marca", "Nuevo modelo" y "Nuevo ítem de checklist"

Hoy el servidor acepta `"   "` (el esquema es `z.string().min(1)` sin `trim`) y el cliente no avisa nada hasta la vuelta del servidor.

**Files:**
- Modify: `src/lib/validation/vehiculo-marca-modelo.ts`, `src/lib/validation/dvi.ts`
- Modify: `src/app/(dashboard)/clientes/[id]/nueva-marca-dialog.tsx`, `nuevo-modelo-dialog.tsx`, `src/app/(dashboard)/ordenes/[id]/nuevo-dvi-checklist-item-dialog.tsx`
- Create: `src/app/(dashboard)/clientes/[id]/nueva-marca-dialog.test.tsx`
- Test: el test de esquema que ya exista junto a cada archivo de validación (`*.test.ts`); si no existe, crearlo.

- [ ] **Step 1: Tests que fallan.** Esquemas (en el `*.test.ts` de cada uno):

```ts
it("rejects a blank nombre and trims it", () => {
  expect(marcaVehiculoInputSchema.safeParse({ nombre: "   " }).success).toBe(false);
  expect(marcaVehiculoInputSchema.parse({ nombre: "  Mazda " }).nombre).toBe("Mazda");
});
```

(usar el nombre real exportado en `vehiculo-marca-modelo.ts` para el esquema de marca y el de modelo — el de modelo con `{ marcaId: "m1", nombre: "   " }` — y `dviChecklistItemInputSchema` con `{ label: "   " }` / `{ label: "  Frenos " }` → `"Frenos"`).

Diálogo — `nueva-marca-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrearMarca = vi.fn();
vi.mock("@/app/actions/vehiculo-marca-modelo-actions", () => ({
  crearMarcaVehiculoAction: (...args: unknown[]) => mockCrearMarca(...args),
}));

import { NuevaMarcaDialog } from "./nueva-marca-dialog";

describe("NuevaMarcaDialog", () => {
  it("does not call the server with a blank nombre and says why", async () => {
    render(<NuevaMarcaDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Agregar marca" }));

    expect(mockCrearMarca).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("El nombre es obligatorio");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
  });
});
```

- [ ] **Step 2:** FAIL.

- [ ] **Step 3: Implementación.**
  - Esquemas: `nombre: z.string().trim().min(1, "El nombre es obligatorio")` (marca y modelo) y `label: z.string().trim().min(1, "El nombre es obligatorio")` (DVI). Comprobar que ningún otro uso de esos esquemas depende de que no recorten (`grep -rn "marcaVehiculoInputSchema\|modeloVehiculoInputSchema\|dviChecklistItemInputSchema" src`).
  - En los tres diálogos, al inicio de `handleSubmit` después de `event.preventDefault();` (campo `nombre` en marca/modelo, `label` en checklist):

```tsx
    const nombre = String(new FormData(formRef.current!).get("nombre") ?? "").trim();
    if (!nombre) {
      setState({ ...initialState, error: "El nombre es obligatorio" });
      return;
    }
```

  - Y en el `<Input>` del campo: `required aria-invalid={state.error ? true : undefined}`.

- [ ] **Step 4:** `npx vitest run src/lib/validation "src/app/(dashboard)/clientes" "src/app/(dashboard)/ordenes"` → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** commit `fase-conf-task 12: nombre obligatorio en marca, modelo e ítem de checklist` y push.

---

### Task 13: Verificación final

- [ ] **Step 1:** `npx tsc --noEmit` y `npm test` (proyecto `unit`) completos → todo PASS.
- [ ] **Step 2:** prueba manual en el navegador contra `taller-dev` (`npm run dev`, puerto 3025), una pasada por cada punto: eliminar bodega/proveedor/repuesto/sede/usuario (Sí y No); quitar ítem, mano de obra y foto en una orden editable (y que no aparezcan en una ENTREGADA ni como TECNICO); eliminar cita como ADMIN; anular orden, entregar orden, generar factura; aprobar/rechazar cotización; cancelar cita; suspender taller en `/superadmin`; marca vacía.
- [ ] **Step 3:** registrar el cierre en `.superpowers/sdd/progress.md` (sección "Confirmaciones y botones faltantes (2026-10-09)", una línea por tarea con su hash) y commit `fase-conf-task 13: registrar cierre en el progress ledger` y push.
