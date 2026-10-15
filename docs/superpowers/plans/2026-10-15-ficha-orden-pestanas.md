# Pestañas de la ficha de la orden (entrega 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las secciones plegables de la ficha por 4 pestañas (Recepción, Trabajo, Inspección, Entrega) con resumen, pestaña por defecto según el estado, `?tab=` en la URL y franja fija de avance en tablet.

**Architecture:** Lógica pura en `src/lib/orden/pestanas.ts` (pestaña inicial y resúmenes), un componente cliente `PestanasOrden` que recibe los paneles ya renderizados por el servidor y los deja montados (`hidden`), y `AgregarAlTrabajo` que despliega los formularios existentes. La página compone; las acciones no cambian.

**Tech Stack:** Next.js App Router (`searchParams` es `Promise`), React 19, Tailwind v4, lucide-react, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-ficha-orden-rediseno-design.md` (sección «Entrega 4», decisiones P1–P8). Mockup: `docs/superpowers/mockups/2026-10-15-ficha-orden-pestanas.html`.

## Global Constraints

- Rama `ficha-pestanas`. Un commit y push por tarea: `pestanas-task N: …` + líneas de atribución.
- Sin migraciones ni cambios en `src/app/actions/`.
- Todo resumen/chip lleva su punto de color. Términos de Colombia.
- No correr prettier sobre archivos existentes; editar con la herramienta Edit.
- Verificación al final de cada tarea: `npx tsc --noEmit`, `npx eslint <archivos>`, `npx vitest run <tests>`.

---

### Task 1: Pestaña inicial y resúmenes (`src/lib/orden/pestanas.ts`)

**Files:** Create `src/lib/orden/pestanas.ts`, `src/lib/orden/pestanas.test.ts`.

**Produces:** `type PestanaOrden = "recepcion" | "trabajo" | "inspeccion" | "entrega"`, `PESTANAS_ORDEN: readonly PestanaOrden[]`, `pestanaInicial(estado: EstadoOrden, pedida?: string | null): PestanaOrden`, `type TonoResumen = "rojo" | "ambar" | "verde" | "azul" | "gris"`, `COLOR_TONO: Record<TonoResumen, string>`, `resumenInspeccion(valores: string[], total: number): { texto: string; tono: TonoResumen }`, `resumenEntrega(estado: EstadoOrden, actaFirmada: boolean): { texto: string; tono: TonoResumen }`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from "vitest";
import { pestanaInicial, resumenEntrega, resumenInspeccion } from "./pestanas";

describe("pestanaInicial", () => {
  it("abre donde está el trabajo según el estado", () => {
    expect(pestanaInicial("BORRADOR")).toBe("recepcion");
    expect(pestanaInicial("EN_PROCESO")).toBe("trabajo");
    expect(pestanaInicial("TERMINADA")).toBe("entrega");
    expect(pestanaInicial("ENTREGADA")).toBe("entrega");
    expect(pestanaInicial("ANULADA")).toBe("trabajo");
  });

  it("una pestaña válida en la URL manda; una inválida se ignora", () => {
    expect(pestanaInicial("BORRADOR", "inspeccion")).toBe("inspeccion");
    expect(pestanaInicial("BORRADOR", "informacion")).toBe("recepcion");
    expect(pestanaInicial("BORRADOR", null)).toBe("recepcion");
  });
});

describe("resumenInspeccion", () => {
  it("cuenta lo revisado y avisa lo crítico primero", () => {
    expect(resumenInspeccion([], 8)).toEqual({ texto: "0 de 8 revisados", tono: "gris" });
    expect(resumenInspeccion(["OK"], 8)).toEqual({ texto: "1 de 8 revisados", tono: "verde" });
    expect(resumenInspeccion(["OK", "ATENCION", "CRITICO", "CRITICO"], 8)).toEqual({
      texto: "4 de 8 revisados · 2 críticos · 1 atención",
      tono: "rojo",
    });
    expect(resumenInspeccion(["ATENCION"], 8).tono).toBe("ambar");
  });
});

describe("resumenEntrega", () => {
  it("dice en qué va el acta", () => {
    expect(resumenEntrega("BORRADOR", false)).toEqual({ texto: "Pendiente", tono: "gris" });
    expect(resumenEntrega("TERMINADA", false)).toEqual({ texto: "Lista para firmar", tono: "azul" });
    expect(resumenEntrega("TERMINADA", true)).toEqual({ texto: "Firmada", tono: "verde" });
    expect(resumenEntrega("ENTREGADA", false)).toEqual({ texto: "Entregada", tono: "verde" });
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/orden/pestanas` → FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { EstadoOrden } from "@/generated/prisma-tenant";

/** Las pestañas de la ficha de la orden (su valor en `?tab=`). */
export type PestanaOrden = "recepcion" | "trabajo" | "inspeccion" | "entrega";

export const PESTANAS_ORDEN: readonly PestanaOrden[] = ["recepcion", "trabajo", "inspeccion", "entrega"];

const POR_ESTADO: Record<EstadoOrden, PestanaOrden> = {
  BORRADOR: "recepcion",
  EN_PROCESO: "trabajo",
  TERMINADA: "entrega",
  ENTREGADA: "entrega",
  ANULADA: "trabajo",
};

/**
 * Dónde abre la ficha: donde está el trabajo según el momento de la orden, salvo
 * que la URL pida otra pestaña válida (un enlace «Ir a la entrega», por ejemplo).
 */
export function pestanaInicial(estado: EstadoOrden, pedida?: string | null): PestanaOrden {
  return PESTANAS_ORDEN.find((pestana) => pestana === pedida) ?? POR_ESTADO[estado];
}

export type TonoResumen = "rojo" | "ambar" | "verde" | "azul" | "gris";

/** Color del punto de cada resumen (mismos tonos que el resto de la ficha). */
export const COLOR_TONO: Record<TonoResumen, string> = {
  rojo: "oklch(0.5 0.2 27)",
  ambar: "oklch(0.55 0.15 60)",
  verde: "oklch(0.4 0.1 150)",
  azul: "oklch(0.44 0.12 250)",
  gris: "oklch(0.7 0 0)",
};

/** «4 de 8 revisados · 2 críticos · 1 atención»: lo crítico manda en el color. */
export function resumenInspeccion(valores: string[], total: number): { texto: string; tono: TonoResumen } {
  const criticos = valores.filter((valor) => valor === "CRITICO").length;
  const atencion = valores.filter((valor) => valor === "ATENCION").length;
  const partes = [`${valores.length} de ${total} revisados`];
  if (criticos > 0) partes.push(`${criticos} ${criticos === 1 ? "crítico" : "críticos"}`);
  if (atencion > 0) partes.push(`${atencion} atención`);
  const tono: TonoResumen = criticos > 0 ? "rojo" : atencion > 0 ? "ambar" : valores.length > 0 ? "verde" : "gris";
  return { texto: partes.join(" · "), tono };
}

/** En qué va el acta de entrega. */
export function resumenEntrega(estado: EstadoOrden, actaFirmada: boolean): { texto: string; tono: TonoResumen } {
  if (estado === "ENTREGADA") return { texto: "Entregada", tono: "verde" };
  if (actaFirmada) return { texto: "Firmada", tono: "verde" };
  if (estado === "TERMINADA") return { texto: "Lista para firmar", tono: "azul" };
  return { texto: "Pendiente", tono: "gris" };
}
```

- [ ] **Step 4:** test → PASS. **Step 5:** tsc, eslint, commit `pestanas-task 1: pestana inicial y resumenes de la ficha`, push.

### Task 2: Componente `PestanasOrden`

**Files:** Create `src/app/(dashboard)/ordenes/[id]/pestanas-orden.tsx` y su `.test.tsx`.

**Consumes:** `PestanaOrden` (Task 1). **Produces:** `interface Pestana { id: PestanaOrden; titulo: string; resumen: string; color: string; panel: ReactNode }`, `PestanasOrden({ pestanas: Pestana[]; inicial: PestanaOrden })`.

- [ ] **Step 1: Test que falla**

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PestanasOrden, type Pestana } from "./pestanas-orden";

const PESTANAS: Pestana[] = [
  { id: "recepcion", titulo: "Recepción", resumen: "3 daños", color: "red", panel: <p>Panel de recepción</p> },
  { id: "trabajo", titulo: "Trabajo", resumen: "$ 399.401", color: "orange", panel: <input aria-label="A medio llenar" /> },
  { id: "inspeccion", titulo: "Inspección", resumen: "1 de 8 revisados", color: "green", panel: <p>Panel DVI</p> },
  { id: "entrega", titulo: "Entrega", resumen: "Pendiente", color: "gray", panel: <p>Panel acta</p> },
];

describe("PestanasOrden", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("abre la pestaña inicial con su resumen y deja las otras ocultas", () => {
    render(<PestanasOrden pestanas={PESTANAS} inicial="trabajo" />);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", { name: /Trabajo/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Recepción/ })).toHaveTextContent("3 daños");
    expect(screen.getByText("Panel de recepción")).not.toBeVisible();
  });

  it("al cambiar de pestaña no pierde lo escrito y deja la pestaña en la URL", async () => {
    render(<PestanasOrden pestanas={PESTANAS} inicial="trabajo" />);
    await userEvent.type(screen.getByLabelText("A medio llenar"), "bomba");
    await userEvent.click(screen.getByRole("tab", { name: /Inspección/ }));
    expect(screen.getByText("Panel DVI")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("tab")).toBe("inspeccion");
    await userEvent.click(screen.getByRole("tab", { name: /Trabajo/ }));
    expect(screen.getByLabelText("A medio llenar")).toHaveValue("bomba");
  });

  it("con las flechas se pasa a la pestaña de al lado", async () => {
    render(<PestanasOrden pestanas={PESTANAS} inicial="entrega" />);
    screen.getByRole("tab", { name: /Entrega/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Recepción/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Recepción/ })).toHaveFocus();
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3: Implementar**

```tsx
"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PestanaOrden } from "@/lib/orden/pestanas";

export interface Pestana {
  id: PestanaOrden;
  titulo: string;
  resumen: string;
  color: string;
  panel: ReactNode;
}

/**
 * Las partes de la orden en pestañas: cada una dice su resumen sin abrirla.
 * Cambiar de pestaña no navega (solo deja `?tab=` en la URL) y los paneles
 * quedan montados, así un formulario a medio llenar no se pierde.
 */
export function PestanasOrden({ pestanas, inicial }: { pestanas: Pestana[]; inicial: PestanaOrden }) {
  const [activa, setActiva] = useState<PestanaOrden>(inicial);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  function abrir(id: PestanaOrden) {
    setActiva(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", url);
  }

  function moverCon(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    const siguiente = (indice + (evento.key === "ArrowRight" ? 1 : -1) + pestanas.length) % pestanas.length;
    abrir(pestanas[siguiente]!.id);
    botones.current[siguiente]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Partes de la orden"
        className="sticky top-0 z-10 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted p-1 [scrollbar-width:none]"
      >
        {pestanas.map((pestana, indice) => {
          const elegida = pestana.id === activa;
          return (
            <button
              key={pestana.id}
              ref={(nodo) => {
                botones.current[indice] = nodo;
              }}
              type="button"
              role="tab"
              id={`pestana-${pestana.id}`}
              aria-selected={elegida}
              aria-controls={`panel-${pestana.id}`}
              tabIndex={elegida ? 0 : -1}
              onClick={() => abrir(pestana.id)}
              onKeyDown={(evento) => moverCon(evento, indice)}
              className={cn(
                "flex flex-1 shrink-0 flex-col items-start gap-0.5 rounded-lg px-3.5 py-2 text-left whitespace-nowrap transition-colors",
                elegida ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-card/60",
              )}
            >
              <span className="text-sm font-semibold">{pestana.titulo}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: pestana.color }} />
                {pestana.resumen}
              </span>
            </button>
          );
        })}
      </div>
      {pestanas.map((pestana) => (
        <div
          key={pestana.id}
          role="tabpanel"
          id={`panel-${pestana.id}`}
          aria-labelledby={`pestana-${pestana.id}`}
          hidden={pestana.id !== activa}
          className="flex flex-col gap-4"
        >
          {pestana.panel}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4:** PASS. **Step 5:** tsc, eslint, commit `pestanas-task 2: componente de pestanas con ?tab= y paneles montados`, push.

### Task 3: Bloque «Agregar al trabajo» (`AgregarAlTrabajo`)

**Files:** Create `src/app/(dashboard)/ordenes/[id]/agregar-al-trabajo.tsx` y su `.test.tsx`.

**Produces:** `AgregarAlTrabajo({ opciones: { id: string; etiqueta: string; detalle?: string; contenido: ReactNode }[] })`.

- [ ] **Step 1: Test que falla**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgregarAlTrabajo } from "./agregar-al-trabajo";

const OPCIONES = [
  { id: "servicio", etiqueta: "Aplicar servicio", detalle: "repuestos + mano de obra", contenido: <p>Formulario servicio</p> },
  { id: "repuesto", etiqueta: "Repuesto", contenido: <p>Formulario repuesto</p> },
  { id: "mano-obra", etiqueta: "Mano de obra", contenido: <p>Formulario mano de obra</p> },
];

describe("AgregarAlTrabajo", () => {
  it("empieza cerrado y abre un solo formulario a la vez", async () => {
    render(<AgregarAlTrabajo opciones={OPCIONES} />);
    expect(screen.getByText("Formulario repuesto")).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Repuesto/ }));
    expect(screen.getByRole("button", { name: /Repuesto/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Formulario repuesto")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Mano de obra/ }));
    expect(screen.getByText("Formulario repuesto")).not.toBeVisible();
    expect(screen.getByText("Formulario mano de obra")).toBeVisible();
  });

  it("volver a tocar el botón abierto lo cierra", async () => {
    render(<AgregarAlTrabajo opciones={OPCIONES} />);
    await userEvent.click(screen.getByRole("button", { name: /Aplicar servicio/ }));
    await userEvent.click(screen.getByRole("button", { name: /Aplicar servicio/ }));
    expect(screen.getByText("Formulario servicio")).not.toBeVisible();
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3: Implementar**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Los tres caminos para sumar trabajo en un solo sitio: cada botón despliega su
 * formulario (el que ya existía) y solo uno queda abierto. Los formularios no se
 * desmontan al cerrarlos, así no pierden lo escrito.
 */
export function AgregarAlTrabajo({
  opciones,
}: {
  opciones: { id: string; etiqueta: string; detalle?: string; contenido: ReactNode }[];
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {opciones.map((opcion) => (
          <Button
            key={opcion.id}
            type="button"
            variant={abierta === opcion.id ? "secondary" : "outline"}
            size="sm"
            aria-expanded={abierta === opcion.id}
            aria-controls={`agregar-${opcion.id}`}
            onClick={() => setAbierta((actual) => (actual === opcion.id ? null : opcion.id))}
          >
            <Plus className="size-3.5" />
            {opcion.etiqueta}
            {opcion.detalle ? <span className="text-xs font-normal text-muted-foreground">({opcion.detalle})</span> : null}
          </Button>
        ))}
      </div>
      {opciones.map((opcion) => (
        <div key={opcion.id} id={`agregar-${opcion.id}`} hidden={abierta !== opcion.id}>
          {opcion.contenido}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4:** PASS. **Step 5:** tsc, eslint, commit `pestanas-task 3: bloque Agregar al trabajo`, push.

### Task 4: La página con pestañas y la franja de tablet

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/avance-fase.tsx` (+ test): `href="#entrega"` → `href="?tab=entrega"`.
- Modify: `src/app/(dashboard)/ordenes/tablero-ordenes.tsx` (+ su test si lo comprueba): `/ordenes/${id}#entrega` → `/ordenes/${id}?tab=entrega`.
- Delete: `src/lib/orden/secciones.ts` (+ test), `src/app/(dashboard)/ordenes/[id]/seccion-orden.tsx` (+ test).

**Consumes:** Tasks 1-3.

- [ ] **Step 1: Enlaces a la entrega.** Cambiar el `href` en `avance-fase.tsx` y su aserción en `avance-fase.test.tsx` a `"?tab=entrega"`; lo mismo en `tablero-ordenes.tsx` (y su test si busca `#entrega`).

- [ ] **Step 2: Página.**
  1. Firma: `export default async function OrdenDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> })`; leer `const { tab } = await searchParams;`.
  2. Imports: quitar `NavSecciones`, `seccionesAbiertas`, `SeccionOrden`; añadir `PestanasOrden` (`./pestanas-orden`), `AgregarAlTrabajo` (`./agregar-al-trabajo`), `COLOR_TONO, pestanaInicial, resumenEntrega, resumenInspeccion` (`@/lib/orden/pestanas`). Borrar la constante `SECCIONES_ORDEN`, `abiertas`, `resumenEntrega` local (texto viejo) y los conteos `atencionCount`/`criticoCount` si quedan sin uso.
  3. Calcular: `const inspeccion = resumenInspeccion(checklistValores…` usando solo los valores de ítems activos: `dviItems.filter((item) => item.activo).map((item) => checklist?.[item.key]).filter(Boolean)` y `total = dviItems.filter((item) => item.activo).length`; `const entrega = resumenEntrega(orden.estado, Boolean(orden.acta?.firmadaAt));`.
  4. Reemplazar la `<NavSecciones … />` y todas las `<SeccionOrden>` por un solo `<PestanasOrden inicial={pestanaInicial(orden.estado, tab)} pestanas={[…]} />` con:
     - **recepcion** — título «Recepción», resumen `${n} ${n === 1 ? "daño" : "daños"}`, color `COLOR_TONO[n > 0 ? "rojo" : "gris"]`, panel: `<Card><CardHeader><CardTitle>Recepción del vehículo</CardTitle></CardHeader><CardContent className="flex flex-col gap-5">` con `RecepcionForm` y `DiagramaDanios` (mismas props de hoy).
     - **trabajo** — título «Trabajo», resumen `formatoMoneda.format(total)`, color `COLOR_TONO.ambar`, panel:
       - fila de tres totales: `<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">` con tres `Card` pequeñas (`p-4`): etiqueta en `text-[11px] uppercase text-muted-foreground` y cifra `font-mono text-lg font-semibold` (Repuestos, Mano de obra, Total del trabajo).
       - si `!orden.factura`: `<Card><CardHeader><CardTitle>Agregar al trabajo</CardTitle></CardHeader><CardContent><AgregarAlTrabajo opciones={[{ id: "servicio", etiqueta: "Aplicar servicio", detalle: "repuestos + mano de obra", contenido: <AplicarServicioForm … /> }, { id: "repuesto", etiqueta: "Repuesto", contenido: <AgregarItemForm … /> }, { id: "mano-obra", etiqueta: "Mano de obra", contenido: <AgregarManoObraForm … /> }]} /></CardContent></Card>` (mismas props de hoy).
       - `Card` «Repuestos» con resumen `n ítems` y la `DataTable` de ítems; debajo, fila «Subtotal repuestos» a la derecha en mono.
       - `Card` «Mano de obra» igual con su `DataTable` y «Subtotal mano de obra».
     - **inspeccion** — título «Inspección», resumen `inspeccion.texto`, color `COLOR_TONO[inspeccion.tono]`, panel: `Card` «Checklist» con `DviChecklistForm` y `Card` «Fotos de la inspección» con `DviFotoForm` (mismas props).
     - **entrega** — título «Entrega», resumen `entrega.texto`, color `COLOR_TONO[entrega.tono]`, panel: `Card` «Acta de entrega» (con «Imprimir acta» en `CardAction` cuando TERMINADA/ENTREGADA, como hoy) con `ActaEntregaForm`; `Card` «Garantías del trabajo» con `GarantiasSection`; y, si `mostrarAnticipos`, `Card` «Anticipos» con `AnticiposSection` (mismas props).
  5. Cabecera: `acciones={<div className="hidden lg:block"><AvanceFase … /></div>}`.
  6. Al final de `<main>`, la franja de tablet:
```tsx
<div className="sticky bottom-0 z-20 -mx-4 mt-2 flex items-center gap-3 border-t border-border bg-card px-4 py-2.5 shadow-[0_-6px_16px_rgb(0_0_0/0.06)] lg:hidden">
  <div className="flex flex-col">
    <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Saldo por cobrar</span>
    <span className="font-mono text-lg font-semibold">{formatoMoneda.format(Math.max(total - anticiposVigentes, 0))}</span>
  </div>
  <div className="ml-auto">
    <AvanceFase ordenId={orden.id} estado={orden.estado} />
  </div>
</div>
```
     (Ajustar `-mx-4` al padding real del layout del dashboard: revisar `src/app/(dashboard)/layout.tsx`.)
- [ ] **Step 3: Borrar** `secciones.ts`, `secciones.test.ts`, `seccion-orden.tsx`, `seccion-orden.test.tsx` (`git rm`); `grep -rn "seccionesAbiertas\|SeccionOrden" src` vacío.
- [ ] **Step 4: Verificar** `npx tsc --noEmit`, `npx eslint "src/app/(dashboard)/ordenes" src/lib/orden`, `npx vitest run "src/app/(dashboard)/ordenes" src/lib/orden`.
- [ ] **Step 5: Chrome** en `/ordenes/cmv8k4u9z000dk08wui7ithg3` a ~1280 px y a ~820 px: pestañas con resumen, cambio de pestaña sin recargar, `?tab=` en la URL, «Agregar al trabajo», franja abajo en angosto, consola sin errores. No pulsar acciones que cambien la orden.
- [ ] **Step 6:** commit `pestanas-task 4: ficha de la orden en pestanas con franja de avance en tablet`, push.

### Task 5: Traspaso y cierre

- [ ] Actualizar `docs/TRASPASO-AGENTES.md` (sección del rediseño: entrega 4 hecha, archivos nuevos, `?tab=`), commit `pestanas-task 5: traspaso de las pestanas de la ficha`, push, y preguntar al usuario por el merge a `main`.
