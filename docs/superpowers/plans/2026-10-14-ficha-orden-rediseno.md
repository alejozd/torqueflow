# Rediseño de la ficha de la orden (entregas 1–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cabecera operativa con avance de fase, barra lateral con ciclo y cuenta, croquis del carro con marcadores por daño y autoguardado del checklist DVI, la recepción y el mecánico.

**Architecture:** Componentes pequeños nuevos en `src/app/(dashboard)/ordenes/[id]/` que reutilizan las server actions existentes (sin migraciones). La página `page.tsx` deja de pintar «Información», «Totales», «Estado» y «Facturación» y compone los nuevos. Un hook `useAutoguardado` encola llamadas a una acción y expone la fase para un indicador común `EstadoGuardado`.

**Tech Stack:** Next.js (App Router, versión con cambios: ver `node_modules/next/dist/docs/`), React 19 (`useActionState`, `startTransition`), Tailwind v4, shadcn sobre **Base UI** (no Radix), lucide-react, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-ficha-orden-rediseno-design.md`

## Global Constraints

- Rama `ficha-orden`. Un commit y push por tarea: `ficha-task N: descripción` + líneas de atribución del sistema.
- Sin migraciones ni cambios en `prisma/`. Las acciones de `src/app/actions/` no cambian.
- Todo chip/badge lleva su punto de color antes del texto (`size-1.5 shrink-0 rounded-full`).
- Términos de Colombia («Baúl»); placas en mayúsculas y en mono.
- WhatsApp solo por enlace `wa.me` (`urlWhatsapp` de `src/lib/whatsapp/url.ts`), nunca API.
- Base UI: `DropdownMenuLabel` siempre dentro de `DropdownMenuGroup`; los ítems usan `onClick`, no `onSelect`.
- **No correr prettier sobre archivos existentes** (reformatea el archivo entero). Respetar el estilo del archivo (ancho ~120, comillas dobles). Los archivos del repo usan CRLF: editar con la herramienta Edit, no con `sed -i`.
- Verificación por tarea: `npx tsc --noEmit`, `npx eslint <archivos tocados>` y `npx vitest run <tests tocados>` al final de la tarea, no durante.
- Indicador de guardado por bloque, nunca un «guardado hace X» global.
- Siguen con confirmación explícita: agregar ítems/mano de obra/daños, anticipos, acta, factura, anular.

---

## Entrega 1 — Cabecera, banner y barra lateral

### Task 1: Piezas de la barra lateral (`EstadoGuardado`, `CicloOrden`, `CuentaOrden`)

**Files:**
- Create: `src/components/estado-guardado.tsx`
- Create: `src/app/(dashboard)/ordenes/[id]/ciclo-orden.tsx`
- Create: `src/app/(dashboard)/ordenes/[id]/cuenta-orden.tsx`
- Test: `src/components/estado-guardado.test.tsx`, `src/app/(dashboard)/ordenes/[id]/ciclo-orden.test.tsx`, `src/app/(dashboard)/ordenes/[id]/cuenta-orden.test.tsx`

**Interfaces:**
- Produces: `type FaseGuardado = "inactivo" | "guardando" | "guardado" | "error"`; `EstadoGuardado({ fase, error?, className? })`; `CicloOrden({ estado: EstadoOrden })`; `CuentaOrden({ ordenId, estado, repuestos, manoDeObra, total, anticipos, factura: { id: string; numero: number } | null })`.

- [ ] **Step 1: Tests que fallan**

`src/components/estado-guardado.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EstadoGuardado } from "./estado-guardado";

describe("EstadoGuardado", () => {
  it("no pinta nada mientras no se ha guardado", () => {
    const { container } = render(<EstadoGuardado fase="inactivo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("avisa mientras guarda y cuando quedó guardado", () => {
    const { rerender } = render(<EstadoGuardado fase="guardando" />);
    expect(screen.getByRole("status")).toHaveTextContent("Guardando…");
    rerender(<EstadoGuardado fase="guardado" />);
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
  });

  it("muestra el error de la acción", () => {
    render(<EstadoGuardado fase="error" error="La orden ya no se puede modificar" />);
    expect(screen.getByRole("alert")).toHaveTextContent("La orden ya no se puede modificar");
  });
});
```

`src/app/(dashboard)/ordenes/[id]/ciclo-orden.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CicloOrden } from "./ciclo-orden";

describe("CicloOrden", () => {
  it("marca los pasos hechos, el actual y los que faltan", () => {
    render(<CicloOrden estado="EN_PROCESO" />);
    const pasos = screen.getAllByRole("listitem");
    expect(pasos.map((paso) => paso.dataset.fase)).toEqual(["hecho", "actual", "pendiente", "pendiente"]);
    expect(pasos[1]).toHaveAttribute("aria-current", "step");
    expect(pasos[1]).toHaveTextContent("En proceso");
  });

  it("una orden anulada no muestra el ciclo sino el aviso", () => {
    render(<CicloOrden estado="ANULADA" />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText(/anulada/i)).toBeInTheDocument();
  });
});
```

`src/app/(dashboard)/ordenes/[id]/cuenta-orden.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./generar-factura-form", () => ({ GenerarFacturaForm: () => <button type="button">Generar factura</button> }));

import { CuentaOrden } from "./cuenta-orden";

const BASE = { ordenId: "o1", repuestos: 149401, manoDeObra: 250000, total: 399401, factura: null };

describe("CuentaOrden", () => {
  it("resta los anticipos y muestra el saldo por cobrar", () => {
    render(<CuentaOrden {...BASE} estado="BORRADOR" anticipos={100000} />);
    expect(screen.getByText("Saldo por cobrar").nextSibling).toHaveTextContent("299.401");
  });

  it("si los anticipos pasan el total, el saldo es a favor del cliente", () => {
    render(<CuentaOrden {...BASE} estado="BORRADOR" anticipos={500000} />);
    expect(screen.getByText("Saldo a favor del cliente").nextSibling).toHaveTextContent("100.599");
  });

  it("mientras se arma la orden, la factura espera a que termine", () => {
    render(<CuentaOrden {...BASE} estado="EN_PROCESO" anticipos={0} />);
    expect(screen.getByText("Factura: al terminar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar factura" })).not.toBeInTheDocument();
  });

  it("terminada sin factura ofrece generarla; con factura, enlaza a ella", () => {
    const { rerender } = render(<CuentaOrden {...BASE} estado="TERMINADA" anticipos={0} />);
    expect(screen.getByRole("button", { name: "Generar factura" })).toBeInTheDocument();
    rerender(<CuentaOrden {...BASE} estado="ENTREGADA" anticipos={0} factura={{ id: "f1", numero: 42 }} />);
    expect(screen.getByRole("link", { name: "Ver factura #42" })).toHaveAttribute("href", "/facturas/f1");
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/components/estado-guardado "src/app/(dashboard)/ordenes/[id]/ciclo-orden" "src/app/(dashboard)/ordenes/[id]/cuenta-orden"`
Expected: FAIL (módulos no existen).

- [ ] **Step 3: Implementar**

`src/components/estado-guardado.tsx`:
```tsx
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaseGuardado = "inactivo" | "guardando" | "guardado" | "error";

/**
 * Aviso de guardado de un bloque que se guarda solo (checklist, recepción,
 * mecánico): cada bloque dice lo suyo, nunca un «guardado hace X» de toda la página.
 */
export function EstadoGuardado({ fase, error, className }: { fase: FaseGuardado; error?: string | null; className?: string }) {
  if (fase === "inactivo") return null;
  if (fase === "error") {
    return (
      <span role="alert" className={cn("text-xs text-destructive", className)}>
        {error ?? "No se pudo guardar"}
      </span>
    );
  }
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        fase === "guardado" ? "text-[oklch(0.4_0.1_150)]" : "text-muted-foreground",
        className,
      )}
    >
      {fase === "guardando" ? (
        "Guardando…"
      ) : (
        <>
          <Check className="size-3" aria-hidden />
          Guardado
        </>
      )}
    </span>
  );
}
```

`src/app/(dashboard)/ordenes/[id]/ciclo-orden.tsx`:
```tsx
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { cn } from "@/lib/utils";
import { ESTADO_DOT_COLOR } from "../estado-tono";

const PASOS: { estado: EstadoOrden; titulo: string; detalle: string }[] = [
  { estado: "BORRADOR", titulo: "Borrador", detalle: "Recepción, daños y cotización" },
  { estado: "EN_PROCESO", titulo: "En proceso", detalle: "El mecánico trabaja" },
  { estado: "TERMINADA", titulo: "Terminada", detalle: "Lista para entregar" },
  { estado: "ENTREGADA", titulo: "Entregada", detalle: "Acta firmada" },
];

/**
 * En qué momento va la orden, en CSS puro. No lleva botón: avanzar se hace desde
 * la cabecera, para que no haya dos lugares que hagan lo mismo.
 */
export function CicloOrden({ estado }: { estado: EstadoOrden }) {
  if (estado === "ANULADA") {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        La orden está anulada: ya no avanza.
      </p>
    );
  }
  const actual = PASOS.findIndex((paso) => paso.estado === estado);
  const color = ESTADO_DOT_COLOR[estado];

  return (
    <ol aria-label="Ciclo de la orden" className="flex flex-col">
      {PASOS.map((paso, indice) => {
        const fase = indice < actual ? "hecho" : indice === actual ? "actual" : "pendiente";
        return (
          <li
            key={paso.estado}
            data-fase={fase}
            aria-current={fase === "actual" ? "step" : undefined}
            className="relative flex gap-2.5 pb-3.5 last:pb-0"
          >
            {indice < PASOS.length - 1 ? (
              <span aria-hidden className="absolute top-4 bottom-0 left-[6px] w-0.5 bg-border" />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 size-3.5 shrink-0 rounded-full border-2",
                fase === "hecho" && "border-[oklch(0.4_0.1_150)] bg-[oklch(0.4_0.1_150)]",
                fase === "pendiente" && "border-border bg-card",
              )}
              style={
                fase === "actual"
                  ? { background: color, borderColor: color, boxShadow: `0 0 0 4px color-mix(in oklch, ${color} 22%, transparent)` }
                  : undefined
              }
            />
            <div>
              <p className={cn("text-sm", fase === "actual" && "font-semibold", fase === "pendiente" && "text-muted-foreground")}>
                {paso.titulo}
              </p>
              <p className="text-xs text-muted-foreground">{paso.detalle}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

`src/app/(dashboard)/ordenes/[id]/cuenta-orden.tsx`:
```tsx
import Link from "next/link";
import type { EstadoOrden } from "@/generated/prisma-tenant";
import { GenerarFacturaForm } from "./generar-factura-form";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-mono">{valor}</span>
    </div>
  );
}

/**
 * Lo que cuesta la orden y lo que falta por cobrar (Totales + Facturación en una
 * sola tarjeta): el saldo es el número que pregunta la recepción.
 */
export function CuentaOrden({
  ordenId,
  estado,
  repuestos,
  manoDeObra,
  total,
  anticipos,
  factura,
}: {
  ordenId: string;
  estado: EstadoOrden;
  repuestos: number;
  manoDeObra: number;
  total: number;
  anticipos: number;
  factura: { id: string; numero: number } | null;
}) {
  const saldo = total - anticipos;

  return (
    <div className="flex flex-col">
      <Fila etiqueta="Repuestos" valor={formatoMoneda.format(repuestos)} />
      <Fila etiqueta="Mano de obra" valor={formatoMoneda.format(manoDeObra)} />
      <div className="mt-1 flex items-center justify-between border-t border-dashed border-border pt-2 text-sm">
        <span>Total</span>
        <span className="font-mono">{formatoMoneda.format(total)}</span>
      </div>
      <Fila etiqueta="Anticipos" valor={`− ${formatoMoneda.format(anticipos)}`} />
      <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2.5">
        <span className="text-sm font-semibold">{saldo < 0 ? "Saldo a favor del cliente" : "Saldo por cobrar"}</span>
        <span className="font-mono text-xl font-semibold">{formatoMoneda.format(Math.abs(saldo))}</span>
      </div>
      <div className="mt-3">
        {factura ? (
          <Link href={`/facturas/${factura.id}`} className="text-sm underline underline-offset-4">
            Ver factura #{factura.numero}
          </Link>
        ) : estado === "TERMINADA" || estado === "ENTREGADA" ? (
          <GenerarFacturaForm ordenId={ordenId} />
        ) : estado === "ANULADA" ? null : (
          <p className="text-xs text-muted-foreground">Factura: al terminar</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr los tests** — mismo comando del Step 2. Expected: PASS.

- [ ] **Step 5: tsc, eslint, commit y push**

```bash
npx tsc --noEmit && npx eslint src/components/estado-guardado.tsx "src/app/(dashboard)/ordenes/[id]/ciclo-orden.tsx" "src/app/(dashboard)/ordenes/[id]/cuenta-orden.tsx"
git add src/components/estado-guardado* "src/app/(dashboard)/ordenes/[id]/ciclo-orden"* "src/app/(dashboard)/ordenes/[id]/cuenta-orden"*
git commit -m "ficha-task 1: aviso de guardado, ciclo de la orden y cuenta con saldo por cobrar"
git push
```

### Task 2: Botón de avance de fase y Anular (`AvanceFase`)

**Files:**
- Create: `src/app/(dashboard)/ordenes/[id]/avance-fase.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/avance-fase.test.tsx`

**Interfaces:**
- Consumes: `updateEstadoOrdenAction(id, prev: EstadoFormState, formData)` y `EstadoFormState { error: string | null; advertencia?: string | null }` de `@/app/actions/orden-actions`; `ConfirmacionEnLinea`; `ESTADO_ORDEN_TRANSITIONS`.
- Produces: `AvanceFase({ ordenId: string; estado: EstadoOrden })`.

- [ ] **Step 1: Test que falla**

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockEstado = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  updateEstadoOrdenAction: (...args: unknown[]) => mockEstado(...args),
}));

import { AvanceFase } from "./avance-fase";

const enviado = () => (mockEstado.mock.calls.at(-1)![2] as FormData).get("estado");

describe("AvanceFase", () => {
  beforeEach(() => {
    mockEstado.mockReset().mockResolvedValue({ error: null, advertencia: null });
  });

  it("en borrador ofrece pasar a En proceso, en un solo clic", async () => {
    render(<AvanceFase ordenId="o1" estado="BORRADOR" />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));
    expect(mockEstado).toHaveBeenCalledTimes(1);
    expect(mockEstado.mock.calls[0]![0]).toBe("o1");
    expect(enviado()).toBe("EN_PROCESO");
  });

  it("en proceso ofrece marcarla como terminada", async () => {
    render(<AvanceFase ordenId="o1" estado="EN_PROCESO" />);
    await userEvent.click(screen.getByRole("button", { name: /Marcar como terminada/ }));
    expect(enviado()).toBe("TERMINADA");
  });

  it("terminada lleva al acta en vez de entregar directo", () => {
    render(<AvanceFase ordenId="o1" estado="TERMINADA" />);
    expect(screen.getByRole("link", { name: /Ir a la entrega/ })).toHaveAttribute("href", "#entrega");
    expect(screen.getByText("Falta el acta firmada")).toBeInTheDocument();
  });

  it("entregada o anulada no ofrece nada", () => {
    const { container, rerender } = render(<AvanceFase ordenId="o1" estado="ENTREGADA" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<AvanceFase ordenId="o1" estado="ANULADA" />);
    expect(container.querySelector("button, a")).toBeNull();
  });

  it("anular pide confirmación antes de enviar", async () => {
    render(<AvanceFase ordenId="o1" estado="BORRADOR" />);
    await userEvent.click(screen.getByRole("button", { name: "Más acciones" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Anular orden/ }));
    expect(mockEstado).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, anular" }));
    expect(enviado()).toBe("ANULADA");
  });

  it("muestra el error de la acción", async () => {
    mockEstado.mockResolvedValue({ error: "Transición inválida", advertencia: null });
    render(<AvanceFase ordenId="o1" estado="BORRADOR" />);
    await userEvent.click(screen.getByRole("button", { name: /Pasar a En proceso/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Transición inválida");
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run "src/app/(dashboard)/ordenes/[id]/avance-fase"`. Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
"use client";

import { startTransition, useActionState, useState } from "react";
import { ArrowRight, Ban, MoreHorizontal } from "lucide-react";
import { updateEstadoOrdenAction, type EstadoFormState } from "@/app/actions/orden-actions";
import { ConfirmacionEnLinea } from "@/components/confirmacion-en-linea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ESTADO_ORDEN_TRANSITIONS } from "@/lib/orden/estado-transitions";
import type { EstadoOrden } from "@/generated/prisma-tenant";

const initialState: EstadoFormState = { error: null, advertencia: null };

const SIGUIENTE: Partial<Record<EstadoOrden, { destino: EstadoOrden; etiqueta: string; detalle: string }>> = {
  BORRADOR: { destino: "EN_PROCESO", etiqueta: "Pasar a En proceso", detalle: "Siguiente paso: empezar el trabajo" },
  EN_PROCESO: { destino: "TERMINADA", etiqueta: "Marcar como terminada", detalle: "Siguiente paso: dejarla lista para entregar" },
};

/**
 * El único botón grande de la ficha: lleva la orden a su siguiente paso. Entregar
 * no se hace aquí (exige el acta), solo se lleva al acta. Anular vive en «⋯» y
 * siempre pregunta, porque deja la orden sin poder editarse.
 */
export function AvanceFase({ ordenId, estado }: { ordenId: string; estado: EstadoOrden }) {
  const cambiar = updateEstadoOrdenAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(cambiar, initialState);
  const [anulando, setAnulando] = useState(false);
  const siguiente = SIGUIENTE[estado];
  const anulable = ESTADO_ORDEN_TRANSITIONS[estado].includes("ANULADA");

  function enviar(destino: EstadoOrden) {
    const formData = new FormData();
    formData.set("estado", destino);
    startTransition(() => formAction(formData));
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        {anulable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon" aria-label="Más acciones" disabled={isPending} />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onClick={() => setAnulando(true)}>
                  <Ban className="size-3.5" />
                  Anular orden…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {siguiente ? (
          <Button type="button" disabled={isPending} onClick={() => enviar(siguiente.destino)}>
            {isPending ? "Guardando..." : siguiente.etiqueta}
            <ArrowRight className="size-4" />
          </Button>
        ) : estado === "TERMINADA" ? (
          <a href="#entrega" className={buttonVariants()}>
            Ir a la entrega
            <ArrowRight className="size-4" />
          </a>
        ) : null}
      </div>
      {siguiente ? (
        <p className="text-xs text-muted-foreground">{siguiente.detalle}</p>
      ) : estado === "TERMINADA" ? (
        <p className="text-xs text-muted-foreground">Falta el acta firmada</p>
      ) : null}
      {anulando ? (
        <ConfirmacionEnLinea
          pregunta="¿Anular la orden? Ya no se podrá editar."
          etiquetaConfirmar="Sí, anular"
          pendiente={isPending}
          onCancelar={() => setAnulando(false)}
          onConfirmar={() => {
            setAnulando(false);
            enviar("ANULADA");
          }}
        />
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {/* Alert hardcodes role="alert"; a status message must keep role="status" natively. */}
      {state.advertencia ? (
        <p role="status" className="text-xs text-muted-foreground">
          {state.advertencia}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Correr el test** — Expected: PASS.

- [ ] **Step 5: tsc, eslint, commit y push** — `ficha-task 2: boton de avance de fase con anular en menu`.

### Task 3: Mecánico con «Cambiar» (`MecanicoMenu`)

**Files:**
- Create: `src/app/(dashboard)/ordenes/[id]/mecanico-menu.tsx`
- Test: `src/app/(dashboard)/ordenes/[id]/mecanico-menu.test.tsx`

**Interfaces:**
- Consumes: `asignarMecanicoAction(id, prev: AsignarMecanicoFormState, formData)` (`mecanicoId` en el FormData, `""` = sin asignar), `TecnicoOption { id; nombre }`, `EstadoGuardado`.
- Produces: `MecanicoMenu({ ordenId, mecanico: { id: string; nombre: string } | null, tecnicos: TecnicoOption[], editable: boolean })`. La página calcula `editable = esOrdenMutable(orden) && (rol === "ADMIN" || (rol === "RECEPCION" && !orden.mecanico))` (misma regla que `asignarMecanicoAction`).

- [ ] **Step 1: Test que falla**

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAsignar = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  asignarMecanicoAction: (...args: unknown[]) => mockAsignar(...args),
}));

import { MecanicoMenu } from "./mecanico-menu";

const TECNICOS = [
  { id: "t1", nombre: "Luis Torres" },
  { id: "t2", nombre: "Carlos Ruiz" },
];

describe("MecanicoMenu", () => {
  beforeEach(() => {
    mockAsignar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("muestra el mecánico y guarda al elegir otro", async () => {
    render(<MecanicoMenu ordenId="o1" mecanico={TECNICOS[0]!} tecnicos={TECNICOS} editable />);
    expect(screen.getByText("Luis Torres")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cambiar/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Carlos Ruiz" }));
    expect((mockAsignar.mock.calls[0]![2] as FormData).get("mecanicoId")).toBe("t2");
    expect(await screen.findByRole("status")).toHaveTextContent("Guardado");
  });

  it("sin mecánico dice Asignar y no ofrece «Sin asignar»", async () => {
    render(<MecanicoMenu ordenId="o1" mecanico={null} tecnicos={TECNICOS} editable />);
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Asignar/ }));
    expect(await screen.findByRole("menuitem", { name: "Luis Torres" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Sin asignar" })).not.toBeInTheDocument();
  });

  it("el actual no se puede volver a elegir", async () => {
    render(<MecanicoMenu ordenId="o1" mecanico={TECNICOS[0]!} tecnicos={TECNICOS} editable />);
    await userEvent.click(screen.getByRole("button", { name: /Cambiar/ }));
    expect(await screen.findByRole("menuitem", { name: "Luis Torres" })).toHaveAttribute("aria-disabled", "true");
  });

  it("sin permiso solo muestra el nombre", () => {
    render(<MecanicoMenu ordenId="o1" mecanico={TECNICOS[0]!} tecnicos={TECNICOS} editable={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("muestra el error de la acción", async () => {
    mockAsignar.mockResolvedValue({ error: "Esta orden ya tiene un mecánico asignado", success: false });
    render(<MecanicoMenu ordenId="o1" mecanico={null} tecnicos={TECNICOS} editable />);
    await userEvent.click(screen.getByRole("button", { name: /Asignar/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Carlos Ruiz" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ya tiene un mecánico asignado");
  });
});
```

- [ ] **Step 2: Correr y ver que falla.**

- [ ] **Step 3: Implementar**

```tsx
"use client";

import { startTransition, useActionState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  asignarMecanicoAction,
  type AsignarMecanicoFormState,
  type TecnicoOption,
} from "@/app/actions/orden-actions";
import { EstadoGuardado } from "@/components/estado-guardado";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const initialState: AsignarMecanicoFormState = { error: null, success: false };

/**
 * El mecánico en la cabecera: se lee de un vistazo y se cambia por excepción
 * desde «Cambiar», que guarda al elegir (como la prioridad). Quién puede cambiarlo
 * lo decide la página con la misma regla de `asignarMecanicoAction`.
 */
export function MecanicoMenu({
  ordenId,
  mecanico,
  tecnicos,
  editable,
}: {
  ordenId: string;
  mecanico: { id: string; nombre: string } | null;
  tecnicos: TecnicoOption[];
  editable: boolean;
}) {
  const asignar = asignarMecanicoAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(asignar, initialState);

  function elegir(mecanicoId: string) {
    const formData = new FormData();
    formData.set("mecanicoId", mecanicoId);
    startTransition(() => formAction(formData));
  }

  const opciones = mecanico ? [...tecnicos, { id: "", nombre: "Sin asignar" }] : tecnicos;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-medium">{mecanico?.nombre ?? "Sin asignar"}</span>
      {editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="xs" disabled={isPending} />}>
            {mecanico ? "Cambiar" : "Asignar"}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {/* Base UI: el título va dentro de un grupo y los ítems reaccionan a onClick. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Asignar a…</DropdownMenuLabel>
              {opciones.map((opcion) => {
                const actual = opcion.id === (mecanico?.id ?? "");
                return (
                  <DropdownMenuItem key={opcion.id || "sin-asignar"} disabled={actual} onClick={() => elegir(opcion.id)}>
                    {opcion.nombre}
                    {actual ? <Check className="ml-auto size-3.5" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <EstadoGuardado
        fase={isPending ? "guardando" : state.error ? "error" : state.success ? "guardado" : "inactivo"}
        error={state.error}
      />
    </span>
  );
}
```

- [ ] **Step 4: Correr el test** — Expected: PASS.

- [ ] **Step 5: tsc, eslint, commit y push** — `ficha-task 3: mecanico en menu Cambiar que guarda al elegir`.

### Task 4: Cabecera operativa, banner de síntomas y página (cierra la entrega 1)

**Files:**
- Create: `src/app/(dashboard)/ordenes/[id]/cabecera-orden.tsx`, `src/app/(dashboard)/ordenes/[id]/cabecera-orden.test.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx` (cabecera L260-289, sección «Información» L293-339, barra lateral L530-602, constantes L45-100, imports)
- Modify: `src/lib/orden/secciones.ts` y `src/lib/orden/secciones.test.ts` (quitar `informacion`)
- Delete: `src/app/(dashboard)/ordenes/[id]/asignar-mecanico-form.tsx` (+ test), `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.tsx` (+ test)

**Interfaces:**
- Consumes: `AvanceFase`, `MecanicoMenu`, `CicloOrden`, `CuentaOrden` (Tasks 1-3); `ESTADO_LABELS`, `ESTADO_DOT_COLOR`, `ESTADO_BADGE_CLASSNAME`, `ESTADO_BADGE_VARIANT` de `../estado-tono`; `ETIQUETA_TIPO_VEHICULO` de `@/lib/validation/vehiculo`; `urlWhatsapp` de `@/lib/whatsapp/url`.
- Produces: `CabeceraOrden({ datos: DatosCabecera; mecanico: ReactNode; acciones: ReactNode })`, `BannerSintomas({ sintomas: string | null })`, `interface DatosCabecera`.

- [ ] **Step 1: Test que falla** (`cabecera-orden.test.tsx`)

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BannerSintomas, CabeceraOrden, type DatosCabecera } from "./cabecera-orden";

const DATOS: DatosCabecera = {
  id: "cmv8k4u9z000dk08wui7ithg3",
  estado: "BORRADOR",
  ingreso: new Date("2026-10-14T20:23:30Z"),
  sede: "Sede principal",
  recibio: "Admin Dev",
  placa: "yor558",
  marca: "BMW",
  modelo: "X3",
  anio: 2009,
  color: "Gris",
  tipo: "CAMIONETA",
  cliente: "Camila Sánchez Rojas",
  telefono: "3100000259",
};

describe("CabeceraOrden", () => {
  it("pone la placa, el vehículo, el cliente y el estado arriba", () => {
    render(<CabeceraOrden datos={DATOS} mecanico={<span>Luis Torres</span>} acciones={<button>Avanzar</button>} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("YOR558");
    expect(screen.getByText("BMW X3 2009 · Gris · Camioneta")).toBeInTheDocument();
    expect(screen.getByText("Camila Sánchez Rojas")).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("Orden #UI7ITHG3")).toBeInTheDocument();
    expect(screen.getByText("Luis Torres")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Avanzar" })).toBeInTheDocument();
  });

  it("deja llamar y escribir por WhatsApp al cliente", () => {
    render(<CabeceraOrden datos={DATOS} mecanico={null} acciones={null} />);
    expect(screen.getByRole("link", { name: /310 000 0259/ })).toHaveAttribute("href", "tel:3100000259");
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/573100000259\?text=/);
  });

  it("sin teléfono no ofrece llamar ni WhatsApp", () => {
    render(<CabeceraOrden datos={{ ...DATOS, telefono: null }} mecanico={null} acciones={null} />);
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });
});

describe("BannerSintomas", () => {
  it("destaca lo que reporta el cliente", () => {
    render(<BannerSintomas sintomas="ruido en la rueda trasera izquierda" />);
    expect(screen.getByText("El cliente reporta")).toBeInTheDocument();
    expect(screen.getByText("ruido en la rueda trasera izquierda")).toBeInTheDocument();
  });

  it("sin síntomas no pinta nada", () => {
    const { container } = render(<BannerSintomas sintomas={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Correr y ver que falla.**

- [ ] **Step 3: Implementar `cabecera-orden.tsx`**

```tsx
import type { ReactNode } from "react";
import { MessageCircle, Phone, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ETIQUETA_TIPO_VEHICULO } from "@/lib/validation/vehiculo";
import { urlWhatsapp } from "@/lib/whatsapp/url";
import { cn } from "@/lib/utils";
import type { EstadoOrden, TipoVehiculo } from "@/generated/prisma-tenant";
import { ESTADO_BADGE_CLASSNAME, ESTADO_BADGE_VARIANT, ESTADO_DOT_COLOR, ESTADO_LABELS } from "../estado-tono";

export interface DatosCabecera {
  id: string;
  estado: EstadoOrden;
  ingreso: Date;
  sede: string;
  recibio: string;
  placa: string;
  marca: string;
  modelo: string;
  anio: number | null;
  color: string | null;
  tipo: TipoVehiculo;
  cliente: string;
  telefono: string | null;
}

const formatoFechaHora = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

/** 3100000259 → 310 000 0259 (celular de Colombia); otros números quedan como vienen. */
function telefonoLegible(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  return digitos.length === 10 ? `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}` : telefono;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{etiqueta}</span>
      {children}
    </span>
  );
}

/**
 * La cabecera dice de quién y de qué carro es la orden sin abrir nada (antes
 * estaba repartido en «Información»), y a la derecha va lo que sigue.
 */
export function CabeceraOrden({ datos, mecanico, acciones }: { datos: DatosCabecera; mecanico: ReactNode; acciones: ReactNode }) {
  const vehiculo = [
    `${datos.marca} ${datos.modelo}${datos.anio ? ` ${datos.anio}` : ""}`,
    datos.color,
    ETIQUETA_TIPO_VEHICULO[datos.tipo],
  ]
    .filter(Boolean)
    .join(" · ");
  const whatsapp = urlWhatsapp(datos.telefono, `Hola ${datos.cliente}, te escribimos del taller por tu vehículo ${datos.placa.toUpperCase()}.`);

  return (
    <Card className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-wide">{datos.placa.toUpperCase()}</h1>
          <span className="text-base text-muted-foreground">{vehiculo}</span>
          <Badge variant={ESTADO_BADGE_VARIANT[datos.estado]} className={cn("gap-1.5", ESTADO_BADGE_CLASSNAME[datos.estado])}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: ESTADO_DOT_COLOR[datos.estado] }} />
            {ESTADO_LABELS[datos.estado]}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-[15px] font-semibold">{datos.cliente}</span>
          {datos.telefono ? (
            <a href={`tel:${datos.telefono.replace(/\D/g, "")}`} className="inline-flex items-center gap-1.5 font-mono text-sm hover:underline">
              <Phone className="size-3.5" aria-hidden />
              {telefonoLegible(datos.telefono)}
            </a>
          ) : null}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm hover:underline">
              <MessageCircle className="size-3.5 text-[oklch(0.55_0.15_150)]" aria-hidden />
              WhatsApp
            </a>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-sm">
          <Dato etiqueta="Ingresó">
            <span className="font-medium">{formatoFechaHora.format(datos.ingreso)}</span>
          </Dato>
          <Dato etiqueta="Recibió">
            <span className="font-medium">{datos.recibio}</span>
          </Dato>
          <Dato etiqueta="Sede">
            <span className="font-medium">{datos.sede}</span>
          </Dato>
          <Dato etiqueta="Mecánico">{mecanico}</Dato>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <span className="font-mono text-xs text-muted-foreground">Orden #{datos.id.slice(-8).toUpperCase()}</span>
        {acciones}
      </div>
    </Card>
  );
}

/** Lo que reportó el cliente, siempre a la vista: es lo primero que lee el mecánico. */
export function BannerSintomas({ sintomas }: { sintomas: string | null }) {
  if (!sintomas?.trim()) return null;
  return (
    <section
      aria-label="Síntomas reportados"
      className="flex items-start gap-3 rounded-xl border border-l-4 border-border border-l-[oklch(0.55_0.15_60)] bg-[oklch(0.55_0.15_60/0.06)] px-4 py-3"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[oklch(0.55_0.15_60)] text-white">
        <TriangleAlert className="size-4" aria-hidden />
      </span>
      <div>
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">El cliente reporta</p>
        <p className="mt-0.5 text-[15px]">{sintomas}</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Correr el test** — Expected: PASS.

- [ ] **Step 5: `secciones.ts` sin «informacion»**

En `src/lib/orden/secciones.ts`: el tipo pasa a `"recepcion" | "items" | "mano-obra" | "dvi" | "entrega" | "anticipos"`; BORRADOR/EN_PROCESO → `["recepcion", "items", "mano-obra", "dvi", "anticipos"]`; TERMINADA → `["entrega", "anticipos"]`; ENTREGADA → `["entrega"]`; ANULADA → `[]` (vacío: todo plegado para consulta). Actualizar `secciones.test.ts`:
```ts
expect([...abiertas].sort()).toEqual(["anticipos", "dvi", "items", "mano-obra", "recepcion"]);
...
expect([...seccionesAbiertas("TERMINADA")].sort()).toEqual(["anticipos", "entrega"]);
...
expect([...seccionesAbiertas("ENTREGADA")]).toEqual(["entrega"]);
expect([...seccionesAbiertas("ANULADA")]).toEqual([]);
```
(y el título del último test: «entregada: solo el acta; anulada: todo plegado, solo de consulta»).

- [ ] **Step 6: Página**

En `page.tsx`:
1. Imports: quitar `AsignarMecanicoForm`, `CambiarEstadoForm`, `GenerarFacturaForm`, `FormGroup` solo si queda sin uso (el acta lo sigue usando: se queda), `InfoField` (función local, se borra), `ReactNode` si queda sin uso. Añadir `CabeceraOrden, BannerSintomas` de `./cabecera-orden`, `AvanceFase` de `./avance-fase`, `MecanicoMenu` de `./mecanico-menu`, `CicloOrden` de `./ciclo-orden`, `CuentaOrden` de `./cuenta-orden`, y `ESTADO_DOT_COLOR` de `../estado-tono`. Borrar las copias locales `ESTADO_LABELS`, `ESTADO_BADGE_CLASSNAME`, `ESTADO_DOT_COLOR`, `ESTADO_BADGE_VARIANT` y `formatoFechaHora` (las secciones de ítems siguen usando `formatoMoneda`, se queda).
2. `SECCIONES_ORDEN`: quitar `{ id: "informacion", ... }`.
3. Reemplazar el bloque `<div>` del título (h1 + badge + línea gris) por:
```tsx
<CabeceraOrden
  datos={{
    id: orden.id,
    estado: orden.estado,
    ingreso: orden.createdAt,
    sede: orden.sede.nombre,
    recibio: orden.creadoPor.nombre,
    placa: orden.vehiculo.placa,
    marca: orden.vehiculo.marca,
    modelo: orden.vehiculo.modelo,
    anio: orden.vehiculo.anio,
    color: orden.vehiculo.color,
    tipo: orden.vehiculo.tipo,
    cliente: orden.cliente.nombre,
    telefono: orden.cliente.telefono,
  }}
  mecanico={
    <MecanicoMenu
      ordenId={orden.id}
      mecanico={orden.mecanico}
      tecnicos={tecnicos}
      editable={
        esOrdenMutable(orden) &&
        (session.user.role === "ADMIN" || (session.user.role === "RECEPCION" && !orden.mecanico))
      }
    />
  }
  acciones={<AvanceFase ordenId={orden.id} estado={orden.estado} />}
/>
<BannerSintomas sintomas={orden.sintomas} />
```
4. Borrar entera la `<SeccionOrden id="informacion">…</SeccionOrden>`.
5. Barra lateral: dejar la tarjeta de Prioridad y reemplazar las tarjetas «Totales», «Estado: …» y «Facturación» por:
```tsx
<Card className="border-t-4" style={{ borderTopColor: ESTADO_DOT_COLOR[orden.estado] }}>
  <CardHeader>
    <CardTitle>Ciclo de la orden</CardTitle>
  </CardHeader>
  <CardContent>
    <CicloOrden estado={orden.estado} />
  </CardContent>
</Card>

<Card className="border-t-4 border-t-[oklch(0.4_0.1_150)]">
  <CardHeader>
    <CardTitle>Cuenta</CardTitle>
  </CardHeader>
  <CardContent>
    <CuentaOrden
      ordenId={orden.id}
      estado={orden.estado}
      repuestos={repuestosTotal}
      manoDeObra={manoObraTotal}
      total={total}
      anticipos={anticiposVigentes}
      factura={orden.factura ? { id: orden.factura.id, numero: orden.factura.numero } : null}
    />
  </CardContent>
</Card>
```
6. Borrar `asignar-mecanico-form.tsx`, `asignar-mecanico-form.test.tsx`, `cambiar-estado-form.tsx`, `cambiar-estado-form.test.tsx` (`git rm`). Confirmar con `grep -rn "AsignarMecanicoForm\|CambiarEstadoForm" src` que no queda uso.

- [ ] **Step 7: Verificar** — `npx tsc --noEmit`, `npx eslint "src/app/(dashboard)/ordenes/[id]" src/lib/orden`, `npx vitest run "src/app/(dashboard)/ordenes" src/lib/orden`. Expected: todo verde.

- [ ] **Step 8: Commit y push** — `ficha-task 4: cabecera operativa, banner de sintomas y barra lateral con ciclo y cuenta`.

---

## Entrega 2 — Croquis y tarjetas de daño

### Task 5: Silueta dibujada, cajas ajustadas y colores por tipo (`figuras.ts`)

**Files:**
- Modify: `src/lib/danos/figuras.ts`
- Test: `src/lib/danos/figuras.test.ts`

**Interfaces:**
- Produces:
  - `type TipoTrazo = "carroceria" | "vidrio" | "llanta" | "rin" | "espejo" | "linea" | "farola" | "stop"`
  - `interface Trazo { d: string; tipo: TipoTrazo }`
  - `Figura.silueta: Trazo[]` (antes `string[]`)
  - `Figura.fueraDelDibujo?: Partial<Record<ZonaVehiculo, { x: number; y: number; aviso: string }>>`
  - `COLOR_DANIO: Record<TipoDanio, string>`

- [ ] **Step 1: Tests que fallan** (añadir al `describe("figuras del diagrama")`)

```ts
it("la silueta trae carrocería, vidrios y llantas para que se entienda el dibujo", () => {
  for (const figura of Object.values(FIGURAS)) {
    const tipos = new Set(figura.silueta.map((trazo) => trazo.tipo));
    expect(tipos.has("carroceria")).toBe(true);
    expect(tipos.has("llanta")).toBe(true);
    for (const trazo of figura.silueta) expect(trazo.d.startsWith("M ")).toBe(true);
  }
  expect(new Set(FIGURAS.CARRO.silueta.map((trazo) => trazo.tipo)).has("vidrio")).toBe(true);
});

it("los laterales viejos del carro tienen un sitio fuera del dibujo y un aviso", () => {
  const fuera = FIGURAS.CARRO.fueraDelDibujo!;
  for (const zona of ["LATERAL_IZQUIERDO", "LATERAL_DERECHO"] as const) {
    expect(fuera[zona]!.aviso).toMatch(/guardabarros/);
    expect(FIGURAS.CARRO.zonas.some((candidata) => candidata.zona === zona)).toBe(false);
  }
});

it("cada tipo de daño tiene su color", () => {
  expect(Object.keys(COLOR_DANIO).sort()).toEqual(["FALTANTE", "GOLPE", "OXIDO", "RAYON", "ROTURA"]);
});
```
Importar `COLOR_DANIO` en el test. El test existente «…y trae su silueta» sigue igual (`length > 0`).

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/lib/danos`.

- [ ] **Step 3: Implementar en `figuras.ts`**

1. Tipos nuevos junto a `Figura`:
```ts
export type TipoTrazo = "carroceria" | "vidrio" | "llanta" | "rin" | "espejo" | "linea" | "farola" | "stop";

/** Un trazo del dibujo: el componente decide el color según su tipo. */
export interface Trazo {
  d: string;
  tipo: TipoTrazo;
}
```
y en `Figura`: `silueta: Trazo[];` (comentario: «Dibujo decorativo (carrocería, vidrios, llantas) bajo las zonas: no se toca ni se lee.») y
```ts
  /**
   * Daños viejos cuya zona ya no está en esta figura (el carro marcaba «Lateral»
   * antes de separar los guardabarros): dónde va su número, fuera del dibujo, y qué aclarar.
   */
  fueraDelDibujo?: Partial<Record<ZonaVehiculo, { x: number; y: number; aviso: string }>>;
```
2. `const t = (tipo: TipoTrazo, d: string): Trazo => ({ d, tipo });`
3. `CARRO`:
```ts
const AVISO_LATERAL = "Marcado antes de separar los guardabarros: no dice si es delantero o trasero.";

const CARRO: Figura = {
  titulo: "Carro (visto desde arriba)",
  lienzo: { ancho: 260, alto: 440 },
  silueta: [
    t("llanta", contorno(28, 70, 18, 58, 6)),
    t("llanta", contorno(214, 70, 18, 58, 6)),
    t("llanta", contorno(28, 306, 18, 60, 6)),
    t("llanta", contorno(214, 306, 18, 60, 6)),
    t(
      "carroceria",
      "M 130 26 C 178 26 212 40 214 82 L 216 150 C 217 170 212 180 212 200 L 212 300 C 212 320 217 330 216 350 L 214 384 C 212 410 182 416 130 416 C 78 416 48 410 46 384 L 44 350 C 43 330 48 320 48 300 L 48 200 C 48 180 43 170 44 150 L 46 82 C 48 40 82 26 130 26 Z",
    ),
    t("linea", "M 92 50 Q 130 42 168 50"),
    t("linea", "M 100 66 L 100 128 M 160 66 L 160 128"),
    t("vidrio", "M 76 138 Q 130 126 184 138 L 172 172 Q 130 166 88 172 Z"),
    t("vidrio", contorno(90, 178, 80, 112, 10)),
    t("vidrio", "M 88 296 Q 130 302 172 296 L 180 322 Q 130 332 80 322 Z"),
    t("linea", "M 50 210 L 86 210 M 174 210 L 210 210"),
    t("espejo", "M 44 146 C 30 144 22 148 22 154 C 22 158 32 160 44 158 Z"),
    t("espejo", "M 216 146 C 230 144 238 148 238 154 C 238 158 228 160 216 158 Z"),
    t("farola", "M 60 40 Q 70 32 84 30 M 200 40 Q 190 32 176 30"),
    t("stop", "M 60 404 Q 70 412 86 413 M 200 404 Q 190 412 174 413"),
  ],
  orientacion: [...igual que hoy...],
  fueraDelDibujo: {
    LATERAL_IZQUIERDO: { x: 14, y: 262, aviso: AVISO_LATERAL },
    LATERAL_DERECHO: { x: 246, y: 262, aviso: AVISO_LATERAL },
  },
  zonas: [
    zona("FRENTE", "Frente", [[84, 28, 92, 18]], { rotulo: "Frente", detalle: "parachoques delantero" }),
    zona("CAPO", "Capó", [[84, 48, 92, 84]], { rotulo: "Capó" }),
    zona("PARABRISAS", "Parabrisas", [[88, 134, 84, 36]], { rotulo: "Parabrisas" }),
    zona("TECHO", "Techo", [[88, 172, 84, 120]], { rotulo: "Techo" }),
    zona("COMPUERTA", "Baúl", [[84, 294, 92, 112]], { rotulo: "Baúl", detalle: "vidrio y parachoques trasero" }),
    zona("PUERTA_IZQUIERDA", "Puerta izquierda", [[48, 136, 36, 152]], { rotulo: "Puerta" }),
    zona("PUERTA_DERECHA", "Puerta derecha", [[176, 136, 36, 152]], { rotulo: "Puerta" }),
    zona("GUARDABARROS_DELANTERO_IZQUIERDO", "Guardabarros delantero izquierdo", [[48, 60, 36, 74]]),
    zona("GUARDABARROS_TRASERO_IZQUIERDO", "Guardabarros trasero izquierdo", [[48, 290, 36, 100]]),
    zona("GUARDABARROS_DELANTERO_DERECHO", "Guardabarros delantero derecho", [[176, 60, 36, 74]]),
    zona("GUARDABARROS_TRASERO_DERECHO", "Guardabarros trasero derecho", [[176, 290, 36, 100]]),
    zona("ESPEJO_IZQUIERDO", "Espejo izquierdo", [[16, 140, 30, 22]]),
    zona("ESPEJO_DERECHO", "Espejo derecho", [[214, 140, 30, 22]]),
    zona("RINES", "Rines", [
      [26, 70, 20, 58],
      [214, 70, 20, 58],
      [26, 306, 20, 60],
      [214, 306, 20, 60],
    ], { detalle: "las cuatro llantas" }),
  ],
};
```
4. `MOTO.silueta`:
```ts
  silueta: [
    t("llanta", circulo(52, 144, 30)),
    t("llanta", circulo(236, 144, 30)),
    t("rin", circulo(52, 144, 13)),
    t("rin", circulo(236, 144, 13)),
    t("linea", "M 52 144 L 80 40 M 64 34 L 120 34 M 200 110 L 236 144"),
    t("carroceria", "M 92 80 C 92 52 110 42 140 42 L 170 44 L 232 46 C 248 48 258 56 258 66 L 252 84 L 230 102 L 120 104 C 104 104 92 96 92 80 Z"),
    t("linea", "M 120 104 L 120 128 L 200 128 M 170 118 L 262 112"),
    t("farola", "M 30 72 L 30 100"),
    t("stop", "M 256 62 L 256 72"),
  ],
```
(zonas, orientación y lienzo de la moto no cambian).
5. Junto a `ETIQUETA_DANIO`:
```ts
/** Punto de color de cada tipo de daño (chips y tarjetas). */
export const COLOR_DANIO: Record<TipoDanio, string> = {
  GOLPE: "var(--destructive)",
  RAYON: "oklch(0.7 0.15 60)",
  ROTURA: "oklch(0.5 0.2 300)",
  FALTANTE: "oklch(0.44 0.12 250)",
  OXIDO: "oklch(0.5 0.1 50)",
};
```
6. Actualizar el comentario del encabezado del módulo («silueta dibujada a mano por trazos con tipo»).

- [ ] **Step 4: Correr** `npx vitest run src/lib/danos` — Expected: PASS (incluye no-solapamiento y lienzo con las cajas nuevas).
  `npx tsc --noEmit` fallará en `diagrama-danios.tsx` (usa `silueta` como string): es esperado y se arregla en la Task 6. **No hacer commit hasta la Task 6**; las Tasks 5 y 6 van en un mismo commit.

### Task 6: Croquis con marcadores y tarjetas (`DiagramaDanios`)

**Files:**
- Modify (reescritura): `src/app/(dashboard)/ordenes/[id]/diagrama-danios.tsx`
- Modify (reescritura): `src/app/(dashboard)/ordenes/[id]/diagrama-danios.test.tsx`

**Interfaces:**
- Consumes: `FIGURAS`, `figuraDe`, `centroDe`, `etiquetaZona`, `ETIQUETA_DANIO`, `COLOR_DANIO`, `Trazo`, `TipoTrazo` (Task 5); `agregarDanioAction`, `quitarDanioAction`; `QuitarConConfirmacion`.
- Produces: misma firma pública que hoy: `DiagramaDanios({ ordenId, tipoVehiculo, danios: DanioVista[], soloLectura, puedeQuitar })` y `interface DanioVista { id; zona; tipo; nota }` (la página no cambia).

- [ ] **Step 1: Reescribir el test**

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAgregar = vi.fn();
const mockQuitar = vi.fn();
vi.mock("@/app/actions/recepcion-actions", () => ({
  agregarDanioAction: (...args: unknown[]) => mockAgregar(...args),
  quitarDanioAction: (...args: unknown[]) => mockQuitar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DiagramaDanios } from "./diagrama-danios";

const DANIOS = [
  { id: "d1", zona: "CAPO" as const, tipo: "GOLPE" as const, nota: "Leve" },
  { id: "d2", zona: "GUARDABARROS_TRASERO_DERECHO" as const, tipo: "RAYON" as const, nota: null },
];

function renderDiagrama(props: Partial<Parameters<typeof DiagramaDanios>[0]> = {}) {
  return render(<DiagramaDanios ordenId="o1" tipoVehiculo="CARRO" danios={[]} soloLectura={false} puedeQuitar {...props} />);
}

describe("DiagramaDanios", () => {
  beforeEach(() => {
    mockAgregar.mockReset().mockResolvedValue({ error: null, success: true });
    mockQuitar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("las zonas son opciones del dibujo y ninguna viene elegida", () => {
    renderDiagrama();
    const zonas = within(screen.getByRole("radiogroup", { name: /Zonas del vehículo/ })).getAllByRole("radio");
    expect(zonas.length).toBeGreaterThan(10);
    expect(zonas.every((zona) => zona.getAttribute("aria-checked") === "false")).toBe(true);
    expect(screen.queryByRole("button", { name: "Marcar daño" })).not.toBeInTheDocument();
  });

  it("al tocar una zona se abre el formulario y envía zona, tipo y nota", async () => {
    renderDiagrama();
    await userEvent.click(screen.getByRole("radio", { name: /^Capó/ }));
    expect(screen.getByRole("radio", { name: /^Capó/ })).toHaveAttribute("aria-checked", "true");
    const formulario = screen.getByRole("form", { name: "Nuevo daño en capó" });
    await userEvent.click(within(formulario).getByRole("radio", { name: "Rayón" }));
    await userEvent.type(within(formulario).getByRole("textbox", { name: /Nota/ }), "10 cm");
    await userEvent.click(within(formulario).getByRole("button", { name: "Marcar daño" }));
    const datos = mockAgregar.mock.calls[0]![2] as FormData;
    expect([datos.get("zona"), datos.get("tipo"), datos.get("nota")]).toEqual(["CAPO", "RAYON", "10 cm"]);
  });

  it("cancelar cierra el formulario sin marcar", async () => {
    renderDiagrama();
    await userEvent.click(screen.getByRole("radio", { name: /^Capó/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(mockAgregar).not.toHaveBeenCalled();
  });

  it("con las flechas se pasa de una zona a otra", async () => {
    renderDiagrama();
    screen.getByRole("radio", { name: /^Frente/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /^Capó/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Capó/ })).toHaveFocus();
  });

  it("cada daño lleva un número en el dibujo y la misma tarjeta a la derecha", () => {
    const { container } = renderDiagrama({ danios: DANIOS });
    const tarjetas = within(screen.getByRole("list", { name: "Daños marcados" })).getAllByRole("listitem");
    expect(tarjetas[0]).toHaveTextContent("1");
    expect(tarjetas[0]).toHaveTextContent("Capó");
    expect(tarjetas[0]).toHaveTextContent("Golpe");
    expect(tarjetas[0]).toHaveTextContent("Leve");
    expect(tarjetas[1]).toHaveTextContent("Guardabarros trasero derecho");
    expect(container.querySelectorAll("[data-marcador]")).toHaveLength(2);
  });

  it("pasar el mouse por una tarjeta resalta su número en el dibujo", async () => {
    const { container } = renderDiagrama({ danios: DANIOS });
    const tarjetas = within(screen.getByRole("list", { name: "Daños marcados" })).getAllByRole("listitem");
    await userEvent.hover(tarjetas[1]!);
    expect(container.querySelector('[data-marcador="2"]')).toHaveAttribute("data-activo", "true");
    expect(container.querySelector('[data-marcador="1"]')).not.toHaveAttribute("data-activo");
  });

  it("un lateral viejo en un carro se lista con su aviso y su número va fuera del dibujo", () => {
    const { container } = renderDiagrama({
      danios: [{ id: "v1", zona: "LATERAL_IZQUIERDO", tipo: "GOLPE", nota: "hundimiento" }],
    });
    expect(screen.getByText(/antes de separar los guardabarros/)).toBeInTheDocument();
    expect(container.querySelector('[data-marcador="1"]')).not.toBeNull();
  });

  it("«Otra zona» abre el formulario para lo que no está en el dibujo", async () => {
    renderDiagrama();
    await userEvent.click(screen.getByRole("button", { name: /Otra zona/ }));
    await userEvent.click(within(screen.getByRole("form", { name: "Nuevo daño en otra zona" })).getByRole("button", { name: "Marcar daño" }));
    expect((mockAgregar.mock.calls[0]![2] as FormData).get("zona")).toBe("OTRO");
  });

  it("la moto se dibuja de lado con sus zonas", () => {
    renderDiagrama({ tipoVehiculo: "MOTO" });
    expect(screen.getByRole("radio", { name: /^Manubrio/ })).toBeInTheDocument();
    expect(screen.getByText("◀ Adelante")).toBeInTheDocument();
  });

  it("en solo lectura no deja marcar ni quitar", async () => {
    renderDiagrama({ danios: DANIOS, soloLectura: true });
    await userEvent.click(screen.getByRole("radio", { name: /^Capó/ }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Otra zona/ })).not.toBeInTheDocument();
  });

  it("sin marcas lo dice", () => {
    renderDiagrama();
    expect(screen.getByText("Sin daños marcados.")).toBeInTheDocument();
  });

  it("muestra el error de la acción", async () => {
    mockAgregar.mockResolvedValue({ error: "Esa zona ya está marcada con ese mismo daño", success: false });
    renderDiagrama();
    await userEvent.click(screen.getByRole("radio", { name: /^Capó/ }));
    await userEvent.click(screen.getByRole("button", { name: "Marcar daño" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ya está marcada");
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run "src/app/(dashboard)/ordenes/[id]/diagrama-danios"`.

- [ ] **Step 3: Reescribir `diagrama-danios.tsx`**

```tsx
"use client";

import { useActionState, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { agregarDanioAction, quitarDanioAction, type RecepcionFormState } from "@/app/actions/recepcion-actions";
import { QuitarConConfirmacion } from "@/components/quitar-con-confirmacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  COLOR_DANIO,
  ETIQUETA_DANIO,
  FIGURAS,
  centroDe,
  etiquetaZona,
  figuraDe,
  type TipoTrazo,
} from "@/lib/danos/figuras";
import type { TipoDanio, ZonaVehiculo } from "@/generated/prisma-tenant";

const initialState: RecepcionFormState = { error: null, success: false };

const TIPOS = Object.keys(ETIQUETA_DANIO) as TipoDanio[];

/** Color de cada trazo del dibujo (decorado: no se toca ni lo lee el lector de pantalla). */
const ESTILO_TRAZO: Record<TipoTrazo, { className: string; ancho: number }> = {
  carroceria: { className: "fill-card stroke-[oklch(0.62_0.03_250)]", ancho: 2.2 },
  vidrio: { className: "fill-[oklch(0.93_0.02_240)] stroke-[oklch(0.7_0.03_250)]", ancho: 1.6 },
  llanta: { className: "fill-[oklch(0.32_0.01_250)] stroke-none", ancho: 0 },
  rin: { className: "fill-[oklch(0.85_0.02_250)] stroke-[oklch(0.62_0.03_250)]", ancho: 1.4 },
  espejo: { className: "fill-[oklch(0.85_0.02_250)] stroke-[oklch(0.62_0.03_250)]", ancho: 1.4 },
  linea: { className: "fill-none stroke-[oklch(0.82_0.02_250)]", ancho: 1.3 },
  farola: { className: "fill-none stroke-[oklch(0.75_0.12_85)] [stroke-linecap:round]", ancho: 4 },
  stop: { className: "fill-none stroke-[oklch(0.6_0.18_25)] [stroke-linecap:round]", ancho: 4 },
};

export interface DanioVista {
  id: string;
  zona: ZonaVehiculo;
  tipo: TipoDanio;
  nota: string | null;
}

/**
 * Croquis de daños: el dibujo del vehículo con sus zonas encima (datos de
 * `figuras.ts`) y un número por cada daño, el mismo de su tarjeta. Nada viene
 * elegido: tocar una zona abre el formulario, así no se marca «Frente» por descuido.
 */
export function DiagramaDanios({
  ordenId,
  tipoVehiculo,
  danios,
  soloLectura,
  puedeQuitar,
}: {
  ordenId: string;
  tipoVehiculo: string;
  danios: DanioVista[];
  soloLectura: boolean;
  puedeQuitar: boolean;
}) {
  const agregar = agregarDanioAction.bind(null, ordenId);
  const [state, formAction, isPending] = useActionState(agregar, initialState);
  const figura = FIGURAS[figuraDe(tipoVehiculo)];
  const [zona, setZona] = useState<ZonaVehiculo | null>(null);
  const [tipo, setTipo] = useState<TipoDanio>("GOLPE");
  const [nota, setNota] = useState("");
  const [activo, setActivo] = useState<string | null>(null);
  const zonasRef = useRef<(SVGPathElement | null)[]>([]);

  // Tras marcar con éxito se cierra el formulario (ajuste de estado durante el render).
  const [ultimoEstado, setUltimoEstado] = useState(state);
  if (state !== ultimoEstado) {
    setUltimoEstado(state);
    if (state.success) {
      setZona(null);
      setNota("");
    }
  }

  const zonasDibujadas = new Map(figura.zonas.map((zonaFigura) => [zonaFigura.zona, zonaFigura]));
  const vistosPorZona = new Map<ZonaVehiculo, number>();
  const marcadores = danios.flatMap((danio, indice) => {
    const enDibujo = zonasDibujadas.get(danio.zona);
    const posicion = enDibujo ? centroDe(enDibujo) : figura.fueraDelDibujo?.[danio.zona];
    if (!posicion) return [];
    const repetido = vistosPorZona.get(danio.zona) ?? 0;
    vistosPorZona.set(danio.zona, repetido + 1);
    return [{ danio, numero: indice + 1, x: posicion.x + repetido * 14, y: posicion.y - repetido * 10, viejo: !enDibujo }];
  });

  function moverCon(evento: KeyboardEvent<SVGPathElement>, indice: number) {
    const total = figura.zonas.length;
    const paso = evento.key === "ArrowRight" || evento.key === "ArrowDown" ? 1 : evento.key === "ArrowLeft" || evento.key === "ArrowUp" ? -1 : 0;
    if (paso !== 0) {
      evento.preventDefault();
      const siguiente = (indice + paso + total) % total;
      setZona(figura.zonas[siguiente]!.zona);
      zonasRef.current[siguiente]?.focus();
    } else if (evento.key === "Enter" || evento.key === " ") {
      evento.preventDefault();
      setZona(figura.zonas[indice]!.zona);
    }
  }

  const indiceConFoco = Math.max(0, figura.zonas.findIndex((zonaFigura) => zonaFigura.zona === zona));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-3">
        <svg viewBox={`0 0 ${figura.lienzo.ancho} ${figura.lienzo.alto}`} className="w-full max-w-[280px]">
          <g aria-hidden className="pointer-events-none">
            {figura.silueta.map((trazo, indice) => (
              <path key={indice} d={trazo.d} className={ESTILO_TRAZO[trazo.tipo].className} strokeWidth={ESTILO_TRAZO[trazo.tipo].ancho} />
            ))}
          </g>

          <g role="radiogroup" aria-label={`Zonas del vehículo: ${figura.titulo}`}>
            {figura.zonas.map((zonaFigura, indice) => {
              const elegida = zona === zonaFigura.zona;
              return (
                <path
                  key={zonaFigura.zona}
                  ref={(nodo) => {
                    zonasRef.current[indice] = nodo;
                  }}
                  d={zonaFigura.d}
                  role="radio"
                  aria-checked={elegida}
                  aria-disabled={soloLectura || undefined}
                  aria-label={zonaFigura.detalle ? `${zonaFigura.etiqueta} (${zonaFigura.detalle})` : zonaFigura.etiqueta}
                  tabIndex={!soloLectura && indice === indiceConFoco ? 0 : -1}
                  strokeWidth={elegida ? 2 : 1}
                  className={cn(
                    "outline-none transition-colors",
                    elegida
                      ? "fill-primary/25 stroke-primary"
                      : "fill-transparent stroke-[oklch(0.7_0.02_250/0.35)] [stroke-dasharray:3_3]",
                    !soloLectura &&
                      !elegida &&
                      "cursor-pointer hover:fill-primary/15 hover:stroke-primary hover:[stroke-dasharray:none] focus-visible:fill-primary/15 focus-visible:stroke-primary",
                  )}
                  onClick={() => {
                    if (!soloLectura) setZona(zonaFigura.zona);
                  }}
                  onKeyDown={(evento) => {
                    if (!soloLectura) moverCon(evento, indice);
                  }}
                >
                  <title>{zonaFigura.etiqueta}</title>
                </path>
              );
            })}
          </g>

          <g aria-hidden>
            {marcadores.map((marcador) => (
              <g
                key={marcador.danio.id}
                data-marcador={marcador.numero}
                data-activo={activo === marcador.danio.id ? "true" : undefined}
                transform={`translate(${marcador.x} ${marcador.y})`}
                className="cursor-default"
                onMouseEnter={() => setActivo(marcador.danio.id)}
                onMouseLeave={() => setActivo(null)}
              >
                <circle
                  r={activo === marcador.danio.id ? 17 : 14}
                  className={marcador.viejo ? "fill-muted-foreground/20" : "fill-destructive/20"}
                />
                <circle r={10} className={marcador.viejo ? "fill-muted-foreground" : "fill-destructive"} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={11} className="pointer-events-none fill-white font-semibold">
                  {marcador.numero}
                </text>
              </g>
            ))}
          </g>

          <g aria-hidden className="pointer-events-none select-none">
            {figura.orientacion.map((rotulo) => (
              <text key={rotulo.texto} x={rotulo.x} y={rotulo.y} textAnchor={rotulo.ancla} fontSize={11} className="fill-muted-foreground font-semibold tracking-wide">
                {rotulo.texto}
              </text>
            ))}
          </g>
        </svg>
        {soloLectura ? null : (
          <>
            <p className="text-center text-xs text-muted-foreground">Toca una zona del dibujo para marcar un daño.</p>
            <Button type="button" variant="ghost" size="xs" onClick={() => setZona("OTRO")}>
              Otra zona (no está en el dibujo)
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Daños al recibir</p>
          {danios.length > 0 ? <p className="text-xs text-muted-foreground">Pasa el mouse por un daño para ubicarlo.</p> : null}
        </div>

        {zona && !soloLectura ? (
          <form
            action={formAction}
            aria-label={`Nuevo daño en ${etiquetaZona(zona).toLowerCase()}`}
            className="flex flex-col gap-2.5 rounded-xl border border-primary/40 bg-primary/5 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Nuevo daño en {etiquetaZona(zona).toLowerCase()}</p>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Cancelar" onClick={() => setZona(null)}>
                <X />
              </Button>
            </div>
            <input type="hidden" name="zona" value={zona} />
            <input type="hidden" name="tipo" value={tipo} />
            <div role="radiogroup" aria-label="Qué tiene" className="flex flex-wrap gap-1.5">
              {TIPOS.map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  role="radio"
                  aria-checked={tipo === opcion}
                  onClick={() => setTipo(opcion)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    tipo === opcion ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: COLOR_DANIO[opcion] }} />
                  {ETIQUETA_DANIO[opcion]}
                </button>
              ))}
            </div>
            <Input
              name="nota"
              aria-label="Nota (opcional)"
              value={nota}
              maxLength={200}
              placeholder="Nota (opcional): tamaño, ubicación exacta…"
              onChange={(evento) => setNota(evento.target.value)}
            />
            <Button type="submit" size="sm" disabled={isPending} className="self-end">
              {isPending ? "Marcando..." : "Marcar daño"}
            </Button>
          </form>
        ) : null}

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        {danios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin daños marcados.</p>
        ) : (
          <ol aria-label="Daños marcados" className="flex flex-col gap-2">
            {danios.map((danio, indice) => {
              const viejo = figura.fueraDelDibujo?.[danio.zona];
              return (
                <li
                  key={danio.id}
                  onMouseEnter={() => setActivo(danio.id)}
                  onMouseLeave={() => setActivo(null)}
                  className={cn(
                    "flex gap-3 rounded-xl border bg-card p-3 transition-shadow",
                    activo === danio.id ? "border-destructive ring-3 ring-destructive/15" : "border-border",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      viejo ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {indice + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{etiquetaZona(danio.zona)}</span>
                      <Badge variant="outline" className="gap-1.5">
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: COLOR_DANIO[danio.tipo] }} />
                        {ETIQUETA_DANIO[danio.tipo]}
                      </Badge>
                    </div>
                    {danio.nota ? <p className="mt-1 text-sm text-muted-foreground">{danio.nota}</p> : null}
                    {viejo ? <p className="mt-1.5 inline-block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{viejo.aviso}</p> : null}
                  </div>
                  {puedeQuitar && !soloLectura ? (
                    <QuitarConConfirmacion
                      etiqueta={`Quitar ${etiquetaZona(danio.zona)}`}
                      pregunta={`¿Quitar la marca de ${etiquetaZona(danio.zona)}?`}
                      accion={quitarDanioAction.bind(null, danio.id)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
```

> Notas: con `strokeWidth={0}` en la llanta no se ve trazo. El rótulo de cada zona (`rotulo`) ya no se pinta: el nombre sale al pasar el mouse (`<title>`) y en el formulario; el dato se conserva porque lo usan los tests de `figuras.ts`. Si eslint marca `react-hooks` por el ajuste de estado durante el render, el patrón es el recomendado por React («storing information from previous renders»); no convertirlo en `useEffect`.

- [ ] **Step 4: Correr** el test del diagrama y `npx vitest run src/lib/danos` — Expected: PASS.

- [ ] **Step 5: tsc, eslint, commit (Tasks 5 y 6 juntas) y push** — `ficha-task 5-6: croquis del carro y la moto dibujado a mano con numeros por dano y tarjetas`.

---

## Entrega 3 — Autoguardado

### Task 7: Hook `useAutoguardado`

**Files:**
- Create: `src/hooks/use-autoguardado.ts`
- Test: `src/hooks/use-autoguardado.test.tsx`

**Interfaces:**
- Consumes: `FaseGuardado` (Task 1).
- Produces: `useAutoguardado<T extends { error: string | null }>(accion: (prev: T, formData: FormData) => Promise<T>, inicial: T): { guardar: (formData: FormData) => void; fase: FaseGuardado; error: string | null }`.

- [ ] **Step 1: Test que falla**

```tsx
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAutoguardado } from "./use-autoguardado";

type Estado = { error: string | null; success: boolean };
const INICIAL: Estado = { error: null, success: false };

function datos(clave: string, valor: string) {
  const formData = new FormData();
  formData.set(clave, valor);
  return formData;
}

describe("useAutoguardado", () => {
  it("envía en orden, de a uno, y termina en guardado", async () => {
    const vistos: string[] = [];
    let soltar!: () => void;
    const primera = new Promise<void>((resolve) => (soltar = resolve));
    const accion = vi.fn(async (_prev: Estado, formData: FormData) => {
      vistos.push(String(formData.get("k")));
      if (formData.get("k") === "a") await primera;
      return { error: null, success: true };
    });
    const { result } = renderHook(() => useAutoguardado(accion, INICIAL));

    act(() => {
      result.current.guardar(datos("k", "a"));
      result.current.guardar(datos("k", "b"));
    });
    expect(result.current.fase).toBe("guardando");
    await waitFor(() => expect(vistos).toEqual(["a"]));
    soltar();
    await waitFor(() => expect(result.current.fase).toBe("guardado"));
    expect(vistos).toEqual(["a", "b"]);
  });

  it("si la acción responde error, queda en error con su mensaje", async () => {
    const accion = vi.fn(async () => ({ error: "La orden ya no se puede modificar", success: false }));
    const { result } = renderHook(() => useAutoguardado(accion, INICIAL));
    act(() => result.current.guardar(datos("k", "a")));
    await waitFor(() => expect(result.current.fase).toBe("error"));
    expect(result.current.error).toBe("La orden ya no se puede modificar");
  });

  it("si la acción revienta, también avisa", async () => {
    const accion = vi.fn(async () => {
      throw new Error("red");
    });
    const { result } = renderHook(() => useAutoguardado(accion, INICIAL));
    act(() => result.current.guardar(datos("k", "a")));
    await waitFor(() => expect(result.current.fase).toBe("error"));
    expect(result.current.error).toBe("No se pudo guardar. Revisa la conexión e intenta de nuevo.");
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/hooks/use-autoguardado`.

- [ ] **Step 3: Implementar**

```ts
"use client";

import { startTransition, useCallback, useRef, useState } from "react";
import type { FaseGuardado } from "@/components/estado-guardado";

/**
 * Guarda solo, sin botón: cada `guardar(formData)` llama a la server action
 * existente, de a una (dos cambios rápidos no se pisan en el servidor), dentro de
 * una transición para que Next refresque la página al terminar.
 */
export function useAutoguardado<T extends { error: string | null }>(
  accion: (prev: T, formData: FormData) => Promise<T>,
  inicial: T,
) {
  const [fase, setFase] = useState<FaseGuardado>("inactivo");
  const [error, setError] = useState<string | null>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const pendientes = useRef(0);
  const ultimo = useRef(inicial);

  const guardar = useCallback(
    (formData: FormData) => {
      pendientes.current += 1;
      setFase("guardando");
      cola.current = cola.current.then(
        () =>
          new Promise<void>((terminar) => {
            startTransition(async () => {
              let resultado: T;
              try {
                resultado = await accion(ultimo.current, formData);
              } catch {
                resultado = { ...ultimo.current, error: "No se pudo guardar. Revisa la conexión e intenta de nuevo." };
              }
              ultimo.current = resultado;
              pendientes.current -= 1;
              if (resultado.error) {
                setError(resultado.error);
                setFase("error");
              } else if (pendientes.current === 0) {
                setError(null);
                setFase("guardado");
              }
              terminar();
            });
          }),
      );
    },
    [accion],
  );

  return { guardar, fase, error };
}
```

- [ ] **Step 4: Correr el test** — Expected: PASS.

- [ ] **Step 5: tsc, eslint, commit y push** — `ficha-task 7: hook de autoguardado con cola`.

### Task 8: Recepción que se guarda sola

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/recepcion-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/recepcion-form.test.tsx` (los tests «guarda el kilometraje y el nivel elegido» y «muestra el error de la action»)

**Interfaces:**
- Consumes: `useAutoguardado` (Task 7), `EstadoGuardado` (Task 1), `guardarRecepcionAction(ordenId, prev, formData)` con `kilometrajeIngreso` y `nivelCombustible`.
- Produces: misma firma `RecepcionForm({ ordenId, kilometrajeIngreso, nivelCombustible, soloLectura })`; se mantienen `NIVELES` y `etiquetaNivel` exportados.

- [ ] **Step 1: Cambiar los tests de guardado** (reemplazan a los actuales con el mismo propósito)

```tsx
it("guarda solo al elegir el combustible, con el kilometraje que hay", async () => {
  render(<RecepcionForm ordenId="o1" kilometrajeIngreso={185210} nivelCombustible={null} soloLectura={false} />);
  await userEvent.click(screen.getByRole("radio", { name: "1/2" }));
  const datos = mockGuardar.mock.calls[0]![2] as FormData;
  expect([datos.get("kilometrajeIngreso"), datos.get("nivelCombustible")]).toEqual(["185210", "MEDIO"]);
  expect(await screen.findByRole("status")).toHaveTextContent("Guardado");
});

it("guarda el kilometraje al salir del campo, solo si cambió", async () => {
  render(<RecepcionForm ordenId="o1" kilometrajeIngreso={185210} nivelCombustible="LLENO" soloLectura={false} />);
  const km = screen.getByRole("spinbutton", { name: "Kilometraje" });
  await userEvent.click(km);
  await userEvent.tab();
  expect(mockGuardar).not.toHaveBeenCalled();
  await userEvent.clear(km);
  await userEvent.type(km, "185300");
  await userEvent.tab();
  const datos = mockGuardar.mock.calls[0]![2] as FormData;
  expect([datos.get("kilometrajeIngreso"), datos.get("nivelCombustible")]).toEqual(["185300", "LLENO"]);
});

it("muestra el error de la action", async () => {
  mockGuardar.mockResolvedValue({ error: "El kilometraje no es válido", success: false });
  render(<RecepcionForm ordenId="o1" kilometrajeIngreso={null} nivelCombustible={null} soloLectura={false} />);
  await userEvent.click(screen.getByRole("radio", { name: "Lleno" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("El kilometraje no es válido");
});
```
(El archivo ya define `mockGuardar` para `guardarRecepcionAction`.)

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Reemplazar la rama editable de `RecepcionForm`**

Imports: quitar `useActionState`, `Alert`, `Button`, `SelectField`; añadir `useState` (ya está), `useAutoguardado` de `@/hooks/use-autoguardado`, `EstadoGuardado` de `@/components/estado-guardado`, `cn`. Cuerpo editable:
```tsx
  const guardar = guardarRecepcionAction.bind(null, ordenId);
  const { guardar: autoguardar, fase, error } = useAutoguardado(guardar, initialState);
  const [nivel, setNivel] = useState<NivelCombustible | "">(nivelCombustible ?? "");
  const [km, setKm] = useState(kilometrajeIngreso === null ? "" : String(kilometrajeIngreso));
  const [kmGuardado, setKmGuardado] = useState(km);

  function enviar(kilometraje: string, nivelElegido: NivelCombustible | "") {
    const formData = new FormData();
    formData.set("kilometrajeIngreso", kilometraje);
    formData.set("nivelCombustible", nivelElegido);
    autoguardar(formData);
  }

  // (rama soloLectura igual que hoy, antes de este return)
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg bg-muted/50 px-3.5 py-3">
      <div className="flex w-36 flex-col gap-1.5">
        <Label htmlFor="kilometrajeIngreso">Kilometraje</Label>
        <Input
          id="kilometrajeIngreso"
          type="number"
          min={0}
          value={km}
          placeholder="85000"
          className="bg-card font-mono"
          onChange={(evento) => setKm(evento.target.value)}
          onBlur={() => {
            if (km === kmGuardado) return;
            setKmGuardado(km);
            enviar(km, nivel);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="combustible-etiqueta" className="text-sm font-medium">
          Combustible
        </span>
        <div role="radiogroup" aria-labelledby="combustible-etiqueta" className="inline-flex overflow-hidden rounded-lg border border-border bg-card">
          {NIVELES.map((opcion) => (
            <button
              key={opcion.value}
              type="button"
              role="radio"
              aria-checked={nivel === opcion.value}
              onClick={() => {
                setNivel(opcion.value);
                enviar(km, opcion.value);
              }}
              className={cn(
                "border-r border-border px-2.5 py-1 text-xs last:border-r-0",
                nivel === opcion.value ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {opcion.label}
            </button>
          ))}
        </div>
      </div>
      <EstadoGuardado fase={fase} error={error} className="pb-1.5" />
      {fase === "inactivo" ? <span className="pb-1.5 text-xs text-muted-foreground">Se guarda solo al cambiar</span> : null}
    </div>
  );
```
Actualizar el comentario del componente: «…se guarda solo: el combustible al elegirlo y el kilometraje al salir del campo».

- [ ] **Step 4: Correr** `npx vitest run "src/app/(dashboard)/ordenes/[id]/recepcion-form"` — Expected: PASS (los tests de solo lectura y de `etiquetaNivel` no cambian).

- [ ] **Step 5: tsc, eslint, commit y push** — `ficha-task 8: recepcion que se guarda sola (km al salir, combustible al elegir)`.

### Task 9: Checklist DVI que se guarda solo

**Files:**
- Modify: `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.test.tsx`

**Interfaces:**
- Consumes: `useAutoguardado`, `EstadoGuardado`, `updateDviChecklistAction(ordenId, prev, formData)` (mezcla en el servidor las claves recibidas con lo guardado: se puede mandar una sola clave), `DVI_CHECKLIST_STATUSES`.
- Produces: misma firma `DviChecklistForm({ ordenId, checklist, items, esAdmin?, soloLectura? })`.

- [ ] **Step 1: Ajustar tests** — reemplazar estos cuatro tests (los de ADMIN, desactivar/reactivar y el diálogo no cambian, salvo donde lean un select):

```tsx
it("cada ítem activo se marca con botones y muestra lo guardado", () => {
  render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "CRITICO" }} items={ITEMS} />);
  const frenos = screen.getByRole("radiogroup", { name: "Frenos" });
  expect(within(frenos).getByRole("radio", { name: "Crítico" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText(/1 de \d+ revisados/)).toBeInTheDocument();
});

it("en soloLectura muestra lo guardado sin dejar cambiarlo", () => {
  render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "OK" }} items={ITEMS} soloLectura />);
  for (const opcion of within(screen.getByRole("radiogroup", { name: "Frenos" })).getAllByRole("radio")) {
    expect(opcion).toBeDisabled();
  }
  expect(screen.getByText(/solo de consulta/)).toBeInTheDocument();
});

it("al marcar un ítem se guarda solo esa clave", async () => {
  render(<DviChecklistForm ordenId="o1" checklist={null} items={ITEMS} />);
  await userEvent.click(within(screen.getByRole("radiogroup", { name: "Frenos" })).getByRole("radio", { name: "Atención" }));
  const datos = mockUpdateDviChecklistAction.mock.calls[0]![2] as FormData;
  expect([...datos.keys()]).toEqual(["frenos"]);
  expect(datos.get("frenos")).toBe("ATENCION");
  expect(await screen.findByRole("status")).toHaveTextContent("Guardado");
});

it("«El resto OK» marca de una vez los que faltan", async () => {
  render(<DviChecklistForm ordenId="o1" checklist={{ frenos: "CRITICO" }} items={ITEMS} />);
  await userEvent.click(screen.getByRole("button", { name: "Marcar el resto OK" }));
  const datos = mockUpdateDviChecklistAction.mock.calls[0]![2] as FormData;
  expect(datos.get("frenos")).toBeNull();
  for (const clave of [...datos.keys()]) expect(datos.get(clave)).toBe("OK");
  expect([...datos.keys()].length).toBe(ITEMS.filter((item) => item.activo).length - 1);
});
```
(el archivo ya tiene `ITEMS` con `frenos`/«Frenos» y `luces`, y el mock `mockUpdateDviChecklistAction`. El test «reactivates an archived item and restores its previously saved value in the select» pasa a comprobar `aria-checked` del radio en vez del valor del select.)

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar**

1. Imports: quitar `useActionState`, `Alert`, `Label`, `SelectField`; añadir `useAutoguardado`, `EstadoGuardado`.
2. Estado:
```tsx
  const guardarChecklist = updateDviChecklistAction.bind(null, ordenId);
  const { guardar, fase, error } = useAutoguardado(guardarChecklist, initialState);
  const [valores, setValores] = useState<DviChecklist>(checklist ?? {});

  function marcar(cambios: DviChecklist) {
    setValores((previos) => ({ ...previos, ...cambios }));
    const formData = new FormData();
    for (const [clave, valor] of Object.entries(cambios)) formData.set(clave, valor);
    guardar(formData);
  }

  const revisados = itemsActivos.filter((item) => valores[item.key]).length;
  const faltantes = itemsActivos.filter((item) => !valores[item.key]);
```
(`current` desaparece: las filas inactivas leen `valores[item.key]`.)
3. El `<form action={formAction}>` raíz pasa a `<div className="flex flex-col gap-4">`.
4. Encima de la grilla, dentro del `FormGroup`:
```tsx
<div className="flex flex-wrap items-center gap-3 text-xs">
  <span className="text-muted-foreground">
    {revisados} de {itemsActivos.length} revisados
  </span>
  {!soloLectura && faltantes.length > 0 && revisados > 0 ? (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={() => marcar(Object.fromEntries(faltantes.map((item) => [item.key, "OK"])))}
    >
      Marcar el resto OK
    </Button>
  ) : null}
  <EstadoGuardado fase={fase} error={error} />
</div>
```
> El botón aparece solo cuando ya se revisó al menos uno (marcar todo OK sin mirar nada sería un atajo peligroso). Ajustar el test «El resto OK» a ese caso: ya lo cumple (`frenos` revisado).
5. Cada fila activa:
```tsx
const valor = valores[item.key] as DviChecklistStatus | undefined;
<div key={item.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
  <span className={cn("size-1.5 shrink-0 rounded-full", valor ? ESTADO_DOT_COLOR[valor] : "bg-border")} />
  <span id={`dvi-${item.key}`} title={item.label} className="min-w-0 flex-1 truncate text-xs leading-tight">
    {item.label}
  </span>
  <div role="radiogroup" aria-labelledby={`dvi-${item.key}`} className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
    {DVI_CHECKLIST_STATUSES.map((estado) => (
      <button
        key={estado}
        type="button"
        role="radio"
        aria-checked={valor === estado}
        disabled={soloLectura}
        onClick={() => marcar({ [item.key]: estado })}
        className={cn(
          "border-r border-border px-2 py-0.5 text-[11px] last:border-r-0 disabled:cursor-default",
          valor === estado ? SEGMENTO_ELEGIDO[estado] : "bg-card hover:bg-muted disabled:hover:bg-card",
        )}
      >
        {ESTADO_LABELS[estado]}
      </button>
    ))}
  </div>
  {/* botón de desactivar de ADMIN: igual que hoy */}
</div>
```
con, junto a `ESTADO_DOT_COLOR`:
```tsx
const SEGMENTO_ELEGIDO: Record<DviChecklistStatus, string> = {
  OK: "bg-[oklch(0.4_0.1_150/0.14)] font-semibold text-[oklch(0.4_0.1_150)]",
  ATENCION: "bg-[oklch(0.55_0.15_60/0.16)] font-semibold text-[oklch(0.55_0.15_60)]",
  CRITICO: "bg-[oklch(0.5_0.2_27/0.12)] font-semibold text-[oklch(0.5_0.2_27)]",
  NO_APLICA: "bg-muted font-semibold text-muted-foreground",
};
```
La grilla pasa a `grid-cols-1 xl:grid-cols-2` (los botones necesitan más ancho que el select).
6. Borrar el bloque final del botón «Guardar checklist», el `Alert` y el `<p role="status">Checklist guardado</p>`; dejar el texto de solo lectura: «La orden ya está facturada o cerrada: el checklist queda solo de consulta.».

- [ ] **Step 4: Correr** `npx vitest run "src/app/(dashboard)/ordenes/[id]/dvi-checklist-form"` — Expected: PASS.

- [ ] **Step 5: Verificación completa de la rama**

`npx tsc --noEmit`, `npx eslint "src/app/(dashboard)/ordenes" src/hooks src/components/estado-guardado.tsx src/lib/danos src/lib/orden`, `npx vitest run "src/app/(dashboard)/ordenes" src/lib src/hooks src/components`. Expected: todo verde.

- [ ] **Step 6: Commit y push** — `ficha-task 9: checklist DVI que se guarda solo por item`.

### Task 10: Verificación en Chrome y traspaso

**Files:**
- Modify: `docs/TRASPASO-AGENTES.md` (sección de la ficha de la orden: qué cambió y las trampas: ajuste de estado durante render en el diagrama, autoguardado con cola, DVI sin «OK» por defecto).

- [ ] **Step 1:** Con `npm run dev` (puerto 3025, ya puede estar corriendo), abrir `/ordenes/cmv8k4u9z000dk08wui7ithg3` a ~1366 px y comprobar: cabecera, banner, botón de avance (no pulsarlo en la orden de demo sin preguntar), menú «⋯», mecánico «Cambiar» (abrir y cerrar sin elegir), croquis (tocar una zona, cancelar), hover tarjeta↔número, daño viejo en gris fuera del dibujo, combustible (elegir y volver a dejar el valor original), checklist DVI (marcar y comprobar «✓ Guardado»), barra lateral (ciclo y cuenta). Revisar la consola sin errores.
- [ ] **Step 2:** Actualizar `docs/TRASPASO-AGENTES.md`; commit y push — `ficha-task 10: traspaso del rediseno de la ficha de la orden`.
- [ ] **Step 3:** Reportar al usuario y preguntar si se fusiona a `main` (merge `--no-ff`) y si sigue la entrega 4 (pestañas).
