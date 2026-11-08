# Normalizar la captura de conceptos de la orden — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La orden de trabajo agrega y edita conceptos con el mismo buscador y la misma tabla editable de la cotización.

**Architecture:** La tabla de la cotización se extrae a `src/components/conceptos/` y recibe un adaptador de acciones; la cotización y la orden la envuelven con sus propias acciones. La orden conserva `items_orden` y `mano_de_obra`; `src/lib/orden/conceptos-orden.ts` las une en una lista y `src/app/actions/conceptos-orden-actions.ts` trae las acciones nuevas.

**Tech Stack:** Next.js 16.4.5 (App Router, server actions), React 19, Prisma 6 (multi-tenant), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-normalizar-conceptos-orden-design.md`

## Global Constraints

- Rama `normalizar-orden`. Un commit por tarea con push: `normalizar-orden-task N: …`, terminando con las líneas `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_018YL6snH3zmvMAubejesikY`.
- Sin migraciones. Factura y Mostrador no cambian.
- Textos de la interfaz en español de Colombia.
- Permisos: agregar/editar con `ordenes.trabajar`; quitar con `ordenes.quitar`; crear repuesto en el inventario con `inventario.editar`.
- Las acciones nuevas responden con datos (`{ error }`), nunca lanzan.
- Archivos con CRLF: editar con Edit o scripts que respeten `\r\n`.
- `tsc --noEmit` y tests al final de cada tarea. Antes de terminar una tarea, preguntar al usuario si se sigue ("vamos en N de 6").
- Los tests actuales de la cotización (`tabla-conceptos.test.tsx`, `celda-editable.test.ts`, `agrupar-conceptos.test.ts`, `cotizacion-items-actions.test.ts`, `buscar-cotizacion-actions.test.ts`) deben pasar **sin cambiar expectativas** (solo imports o datos de prueba con campos nuevos).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/conceptos/conceptos.ts` (nuevo) | `ConceptoVista`, agrupado de kits, conteo, importe (movido de `lib/cotizacion/agrupar-conceptos.ts`). |
| `src/lib/cotizacion/agrupar-conceptos.ts` | Reexporta lo anterior + `conceptosDesdeItems` (propio de la cotización). |
| `src/lib/conceptos/buscar.ts` (nuevo) | `buscarConceptos(tenantDb, sedeId, texto)`: kits y repuestos (cuerpo actual de `buscarParaCotizacionAction`). |
| `src/components/conceptos/tabla-conceptos.tsx` (nuevo) | Tabla compartida con adaptador. |
| `src/components/conceptos/buscador-conceptos.tsx` (movido) | Buscador destacado; recibe `buscar` y opcional `permitirCrear`. |
| `src/components/conceptos/celda-editable.tsx`, `formato.ts` (movidos) | Celda editable y formatos; + `interpretarCantidadEntera`. |
| `src/app/(dashboard)/cotizaciones/[id]/tabla-conceptos.tsx` | Envoltura: adaptador con las acciones de la cotización. |
| `src/lib/orden/conceptos-orden.ts` (nuevo) | Ids prefijados y `conceptosDesdeOrden`. |
| `src/app/actions/conceptos-orden-actions.ts` (nuevo) | Buscar, agregar, actualizar, cambiar tipo y quitar kit en la orden. |
| `src/app/(dashboard)/ordenes/[id]/conceptos-orden.tsx` (nuevo) | Envoltura de la orden: adaptador, selector de mecánico, crear repuesto. |
| `src/app/(dashboard)/ordenes/[id]/page.tsx` | Pestaña Trabajo con la tarjeta Conceptos; se retiran formularios, tablas y kits aplicados. |

---

### Task 1: Extraer la tabla de conceptos a un componente compartido

**Files:**
- Create: `src/lib/conceptos/conceptos.ts`, `src/components/conceptos/tabla-conceptos.tsx`
- Move (git mv): `src/app/(dashboard)/cotizaciones/[id]/buscador-conceptos.tsx` → `src/components/conceptos/buscador-conceptos.tsx`; `.../cotizaciones/[id]/celda-editable.tsx` (+ `.test.ts`) → `src/components/conceptos/`; `.../cotizaciones/[id]/formato.ts` → `src/components/conceptos/formato.ts`
- Modify: `src/lib/cotizacion/agrupar-conceptos.ts`, `src/app/(dashboard)/cotizaciones/[id]/tabla-conceptos.tsx`, imports de los archivos movidos (buscar con `grep -rn "cotizaciones/\[id\]/formato\|./formato\"\|./celda-editable\"\|./buscador-conceptos\"" src`)
- Test: `src/components/conceptos/celda-editable.test.ts` (+ caso nuevo), tests de la cotización sin cambios de expectativa

**Interfaces:**
- Produces:
  ```ts
  // src/lib/conceptos/conceptos.ts
  export interface ConceptoVista { id: string; tipo: "REPUESTO" | "MANO_OBRA"; descripcion: string; repuestoId: string | null;
    codigo: string | null; cantidad: number; precioUnitario: number; ivaPct: number; precioCatalogo: number | null;
    stockActual: number | null; grupoKitId: string | null; grupoKitNombre: string | null;
    /** Falso en la mano de obra de la orden (no tiene cantidad). */ editableCantidad: boolean;
    /** Solo mano de obra de la orden. */ mecanico: { id: string; nombre: string } | null; }
  export type BloqueConceptos; export function importeConcepto; sinExistenciaSuficiente; esConceptoLibre; agruparConceptos; contarConceptos;
  // src/components/conceptos/tabla-conceptos.tsx
  export interface ResultadoConcepto { error: string | null; conceptoId: string | null; fusionado?: boolean }
  export interface ResultadoServicioConceptos { error: string | null; agregados: { manoDeObra: boolean; repuestos: number } | null }
  export interface CambiosConcepto { cantidad?: number; precioUnitario?: number; ivaPct?: number; descripcion?: string; tipo?: "REPUESTO" | "MANO_OBRA" }
  export interface AdaptadorConceptos {
    buscar(texto: string): Promise<ResultadosBusquedaConceptos>;
    agregarRepuesto(repuestoId: string): Promise<ResultadoConcepto>;
    agregarLibre(input: { tipo: "REPUESTO" | "MANO_OBRA"; descripcion: string }): Promise<ResultadoConcepto>;
    aplicarServicio(servicioId: string): Promise<ResultadoServicioConceptos>;
    actualizar(concepto: ConceptoVista, cambios: CambiosConcepto): Promise<ResultadoConcepto>;
    quitar(concepto: ConceptoVista): Promise<ResultadoAccion>;
    quitarKit(grupoKitId: string): Promise<ResultadoAccion>;
  }
  export function TablaConceptos(props: { adaptador: AdaptadorConceptos; conceptos: ConceptoVista[]; puedeEditar: boolean;
    puedeQuitar: boolean; cantidadEntera?: boolean; detalleFila?: (c: ConceptoVista) => ReactNode;
    crearRepuesto?: (descripcion: string) => void; textoVacio: string }): JSX.Element;
  // src/components/conceptos/celda-editable.tsx
  export function interpretarCantidadEntera(texto: string): string | null;
  ```
  `ResultadosBusquedaConceptos` = el tipo actual `ResultadosBusquedaCotizacion` (se renombra en Task 2; en esta tarea importar el actual).

- [ ] **Step 1: Test que falla para `interpretarCantidadEntera`** en `src/components/conceptos/celda-editable.test.ts` (tras el `git mv`):

```ts
describe("interpretarCantidadEntera", () => {
  it("acepta enteros de 1 a 9999 y rechaza decimales, cero y texto", () => {
    expect(interpretarCantidadEntera("3")).toBe("3");
    expect(interpretarCantidadEntera(" 12 ")).toBe("12");
    expect(interpretarCantidadEntera("1,5")).toBeNull();
    expect(interpretarCantidadEntera("0")).toBeNull();
    expect(interpretarCantidadEntera("abc")).toBeNull();
    expect(interpretarCantidadEntera("10000")).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/conceptos/celda-editable.test.ts` → FAIL (`interpretarCantidadEntera` no existe).

- [ ] **Step 3: Implementar** en `celda-editable.tsx`:

```ts
/** Cantidad de los repuestos de la orden: solo enteros (la columna es Int). */
export function interpretarCantidadEntera(texto: string): string | null {
  const numero = Number(texto.trim().replace(",", "."));
  if (!Number.isInteger(numero) || numero <= 0 || numero > 9999) return null;
  return String(numero);
}
```

- [ ] **Step 4: Mover tipos.** Crear `src/lib/conceptos/conceptos.ts` con todo lo de `lib/cotizacion/agrupar-conceptos.ts` salvo `ItemCotizacionConRepuesto` y `conceptosDesdeItems`, agregando a `ConceptoVista` los campos `editableCantidad` y `mecanico` (doc arriba). Dejar en `lib/cotizacion/agrupar-conceptos.ts`:

```ts
export * from "@/lib/conceptos/conceptos";
import type { ConceptoVista } from "@/lib/conceptos/conceptos";
// ItemCotizacionConRepuesto y conceptosDesdeItems igual que hoy, con
//   editableCantidad: true, mecanico: null
```

Actualizar las fábricas `concepto(overrides)` de `agrupar-conceptos.test.ts` y `tabla-conceptos.test.tsx` agregando `editableCantidad: true, mecanico: null` (solo datos, no expectativas).

- [ ] **Step 5: Buscador con `buscar` por props.** En el `buscador-conceptos.tsx` movido: quitar el import de `buscarParaCotizacionAction`; nuevas props `buscar: (texto: string) => Promise<ResultadosBusquedaCotizacion>` y `permitirCrear?: boolean`. Agregar a `SeleccionBuscador` la variante `{ clase: "crear"; descripcion: string }`; en `aOpciones`, si `permitirCrear` y hay texto, después de las dos opciones libres:

```ts
construir({ clase: "crear", descripcion }, "crear-repuesto", "No está en el catálogo")
```

y en `ContenidoOpcion`: `<PackagePlus …/> Crear «{descripcion}» en el inventario`. Como `aOpciones` es una función del módulo, recibir `permitirCrear` cerrándolo: `aOpciones={(r, t) => aOpciones(r, t, permitirCrear)}`.

- [ ] **Step 6: Tabla compartida.** Crear `src/components/conceptos/tabla-conceptos.tsx` copiando el cuerpo actual de `cotizaciones/[id]/tabla-conceptos.tsx` y cambiando solo:
  - Props según la interfaz de arriba (sin `cotizacionId`).
  - `guardar(concepto, cambios)` llama `adaptador.actualizar(concepto, cambios)`.
  - `agregar`: `adaptador.agregarRepuesto(id)` / `adaptador.aplicarServicio(id)` / `adaptador.agregarLibre({tipo, descripcion})`; usar `resultado.conceptoId` donde hoy está `itemId`; para `clase: "crear"` llamar `crearRepuesto?.(seleccion.descripcion)`.
  - `<BuscadorConceptos buscar={adaptador.buscar} permitirCrear={Boolean(crearRepuesto)} …/>`.
  - Quitar línea: `accion={() => adaptador.quitar(concepto)}`; quitar kit: `accion={() => adaptador.quitarKit(bloque.grupoKitId)}`. Columna de acciones visible con `puedeQuitar` (antes `puedeEditar`).
  - Cantidad: si `!concepto.editableCantidad` mostrar `<p className="text-center text-xs text-muted-foreground">—</p>` (sin botones); si no, `interpretar={cantidadEntera ? interpretarCantidadEntera : interpretarCantidad}`.
  - Debajo de la línea del tipo, `{detalleFila?.(concepto)}`.
  - Texto de tabla vacía: `puedeEditar ? "Aún no hay conceptos. Búscalos arriba por nombre o código." : textoVacio`.

- [ ] **Step 7: Envoltura de la cotización.** Reemplazar `cotizaciones/[id]/tabla-conceptos.tsx` por:

```tsx
"use client";

import { useMemo } from "react";
import { eliminarItemCotizacionFormAction } from "@/app/actions/cotizacion-actions";
import {
  actualizarItemCotizacionAction,
  agregarItemLibreCotizacionAction,
  agregarRepuestoACotizacionAction,
  eliminarGrupoKitCotizacionAction,
} from "@/app/actions/cotizacion-items-actions";
import { buscarParaCotizacionAction } from "@/app/actions/buscar-cotizacion-actions";
import { aplicarServicioACotizacionAction } from "@/app/actions/servicio-actions";
import type { ConceptoVista } from "@/lib/cotizacion/agrupar-conceptos";
import { TablaConceptos as TablaCompartida, type AdaptadorConceptos } from "@/components/conceptos/tabla-conceptos";

const ESTADO_APLICAR_INICIAL = { error: null, success: false, agregados: null };

/** La tabla compartida con las acciones de la cotización. */
export function TablaConceptos({ cotizacionId, conceptos, puedeEditar }: {
  cotizacionId: string; conceptos: ConceptoVista[]; puedeEditar: boolean;
}) {
  const adaptador = useMemo<AdaptadorConceptos>(() => ({
    buscar: buscarParaCotizacionAction,
    async agregarRepuesto(repuestoId) {
      const r = await agregarRepuestoACotizacionAction(cotizacionId, repuestoId);
      return { error: r.error, conceptoId: r.itemId, fusionado: r.fusionado };
    },
    async agregarLibre(input) {
      const r = await agregarItemLibreCotizacionAction(cotizacionId, input);
      return { error: r.error, conceptoId: r.itemId };
    },
    async aplicarServicio(servicioId) {
      const formData = new FormData();
      formData.set("servicioId", servicioId);
      const r = await aplicarServicioACotizacionAction(cotizacionId, ESTADO_APLICAR_INICIAL, formData);
      return { error: r.error, agregados: r.agregados };
    },
    async actualizar(concepto, cambios) {
      const r = await actualizarItemCotizacionAction(cotizacionId, concepto.id, cambios);
      return { error: r.error, conceptoId: r.itemId };
    },
    quitar: (concepto) => eliminarItemCotizacionFormAction(concepto.id, cotizacionId),
    async quitarKit(grupoKitId) {
      const r = await eliminarGrupoKitCotizacionAction(cotizacionId, grupoKitId);
      return { error: r.error, success: r.error === null };
    },
  }), [cotizacionId]);

  return (
    <TablaCompartida adaptador={adaptador} conceptos={conceptos} puedeEditar={puedeEditar}
      puedeQuitar={puedeEditar} textoVacio="Esta cotización no tiene conceptos." />
  );
}
```

- [ ] **Step 8:** `npx tsc --noEmit` y `npx vitest run src/components/conceptos src/lib/cotizacion "src/app/(dashboard)/cotizaciones" src/app/cotizaciones` → PASS, con los tests de la cotización sin cambios de expectativa.

- [ ] **Step 9: Commit** `normalizar-orden-task 1: tabla de conceptos compartida y la cotización como envoltura` + push.

---

### Task 2: Búsqueda de conceptos con el permiso de cada documento

**Files:**
- Create: `src/lib/conceptos/buscar.ts`
- Modify: `src/app/actions/buscar-cotizacion-actions.ts`, `src/components/conceptos/buscador-conceptos.tsx`, `src/components/conceptos/tabla-conceptos.tsx` (tipo)
- Test: `src/app/actions/buscar-cotizacion-actions.test.ts` (sin cambios de expectativa)

**Interfaces:**
- Produces:
  ```ts
  // src/lib/conceptos/buscar.ts (no "use server")
  export interface ResultadoKitBusqueda { id: string; nombre: string; conceptos: number; total: number; repuestosSinExistencia: number }
  export interface ResultadoRepuestoBusqueda { id: string; codigo: string; nombre: string; precioVenta: number; stockActual: number; bodega: string }
  export interface ResultadosBusquedaConceptos { kits: ResultadoKitBusqueda[]; repuestos: ResultadoRepuestoBusqueda[] }
  export async function buscarConceptos(tenantDb: TenantDb, sedeActivaId: string, texto: unknown): Promise<ResultadosBusquedaConceptos>;
  ```
  `buscar-cotizacion-actions.ts` reexporta los tipos (`export type { … }` y `export type ResultadosBusquedaCotizacion = ResultadosBusquedaConceptos`) y `buscarParaCotizacionAction` queda en 3 líneas (`requirePermiso("cotizaciones.editarItems")` + `buscarConceptos`).

- [ ] **Step 1:** Mover a `buscar.ts` las constantes `MAX_KITS`, `MAX_REPUESTOS`, el filtro por palabras y el cuerpo de la consulta (líneas 52-122 actuales), parametrizando `tenantDb` y `sedeActivaId`. El tipo `TenantDb = ReturnType<typeof getTenantDb>`.
- [ ] **Step 2:** `buscarParaCotizacionAction`:

```ts
export async function buscarParaCotizacionAction(texto: string): Promise<ResultadosBusquedaCotizacion> {
  const session = await requirePermiso("cotizaciones.editarItems");
  return buscarConceptos(getTenantDb(session.user.tenantSchema), session.user.sedeActivaId, texto);
}
```

- [ ] **Step 3:** En el buscador y la tabla compartidos, importar los tipos desde `@/lib/conceptos/buscar`.
- [ ] **Step 4:** `npx tsc --noEmit`; `npx vitest run src/app/actions/buscar-cotizacion-actions.test.ts src/components/conceptos "src/app/(dashboard)/cotizaciones"` → PASS sin tocar expectativas.
- [ ] **Step 5: Commit** `normalizar-orden-task 2: búsqueda de conceptos compartida` + push.

---

### Task 3: Conceptos de la orden en una sola lista

**Files:**
- Create: `src/lib/orden/conceptos-orden.ts`, `src/lib/orden/conceptos-orden.test.ts`
- Modify: `src/app/actions/orden-actions.ts` (`ORDEN_DETAIL_INCLUDE.items`), `src/app/actions/orden-actions.test.ts` (expectativa del include)

**Interfaces:**
- Consumes: `ConceptoVista` (Task 1).
- Produces:
  ```ts
  export type TablaOrden = "item" | "mo";
  export function idConceptoOrden(tabla: TablaOrden, id: string): string;      // "item:abc" | "mo:abc"
  export function leerIdConceptoOrden(conceptoId: string): { tabla: TablaOrden; id: string } | null;
  export interface ItemOrdenParaConcepto { id: string; repuestoId: string | null; descripcion: string; cantidad: number;
    precioUnitario: unknown; ivaPct: unknown; grupoKitId: string | null; grupoKitNombre: string | null; createdAt: Date;
    repuesto: { codigo: string; precioVenta: unknown; stockActual: number } | null }
  export interface ManoDeObraParaConcepto { id: string; descripcion: string; valor: unknown; ivaPct: unknown;
    grupoKitId: string | null; grupoKitNombre: string | null; createdAt: Date; mecanico: { id: string; nombre: string } | null }
  export function conceptosDesdeOrden(items: ItemOrdenParaConcepto[], manoDeObra: ManoDeObraParaConcepto[]): ConceptoVista[];
  ```

- [ ] **Step 1: Test que falla** (`conceptos-orden.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { conceptosDesdeOrden, idConceptoOrden, leerIdConceptoOrden } from "./conceptos-orden";

const item = {
  id: "i1", repuestoId: "r1", descripcion: "Filtro", cantidad: 2, precioUnitario: "1000", ivaPct: "5.00",
  grupoKitId: null, grupoKitNombre: null, createdAt: new Date("2026-11-08T10:00:00Z"),
  repuesto: { codigo: "F-1", precioVenta: "1200", stockActual: 3 },
};
const mano = {
  id: "m1", descripcion: "Cambio", valor: "50000", ivaPct: "0", grupoKitId: null, grupoKitNombre: null,
  createdAt: new Date("2026-11-08T09:00:00Z"), mecanico: { id: "t1", nombre: "Carlos" },
};

describe("conceptosDesdeOrden", () => {
  it("une las dos tablas por fecha, con ids prefijados", () => {
    const conceptos = conceptosDesdeOrden([item], [mano]);
    expect(conceptos.map((c) => c.id)).toEqual(["mo:m1", "item:i1"]);
    expect(conceptos[1]).toMatchObject({
      tipo: "REPUESTO", cantidad: 2, precioUnitario: 1000, ivaPct: 5, codigo: "F-1",
      precioCatalogo: 1200, stockActual: 3, editableCantidad: true, mecanico: null,
    });
  });

  it("la mano de obra no tiene cantidad editable y su precio es el valor", () => {
    const [m] = conceptosDesdeOrden([], [mano]);
    expect(m).toMatchObject({
      tipo: "MANO_OBRA", cantidad: 1, precioUnitario: 50000, ivaPct: 0, repuestoId: null,
      precioCatalogo: null, stockActual: null, editableCantidad: false, mecanico: { id: "t1", nombre: "Carlos" },
    });
  });
});

describe("ids de la orden", () => {
  it("van y vuelven, y rechazan lo que no tiene prefijo", () => {
    expect(leerIdConceptoOrden(idConceptoOrden("mo", "m1"))).toEqual({ tabla: "mo", id: "m1" });
    expect(leerIdConceptoOrden("item:i1")).toEqual({ tabla: "item", id: "i1" });
    expect(leerIdConceptoOrden("i1")).toBeNull();
    expect(leerIdConceptoOrden("otro:i1")).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/orden/conceptos-orden.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar** `conceptos-orden.ts`:

```ts
import type { ConceptoVista } from "@/lib/conceptos/conceptos";

export type TablaOrden = "item" | "mo";

export function idConceptoOrden(tabla: TablaOrden, id: string): string {
  return `${tabla}:${id}`;
}

export function leerIdConceptoOrden(conceptoId: string): { tabla: TablaOrden; id: string } | null {
  const separador = conceptoId.indexOf(":");
  if (separador <= 0) return null;
  const tabla = conceptoId.slice(0, separador);
  const id = conceptoId.slice(separador + 1);
  if ((tabla !== "item" && tabla !== "mo") || id === "") return null;
  return { tabla, id };
}

// (interfaces ItemOrdenParaConcepto y ManoDeObraParaConcepto como en Interfaces)

/** Repuestos y mano de obra de la orden en una lista, en el orden en que se agregaron. */
export function conceptosDesdeOrden(items: ItemOrdenParaConcepto[], manoDeObra: ManoDeObraParaConcepto[]): ConceptoVista[] {
  const filas = [
    ...items.map((item) => ({
      creado: item.createdAt.getTime(),
      concepto: {
        id: idConceptoOrden("item", item.id), tipo: "REPUESTO" as const, descripcion: item.descripcion,
        repuestoId: item.repuestoId, codigo: item.repuesto?.codigo ?? null, cantidad: item.cantidad,
        precioUnitario: Number(item.precioUnitario), ivaPct: Number(item.ivaPct),
        precioCatalogo: item.repuesto ? Number(item.repuesto.precioVenta) : null,
        stockActual: item.repuesto ? item.repuesto.stockActual : null,
        grupoKitId: item.grupoKitId, grupoKitNombre: item.grupoKitNombre, editableCantidad: true, mecanico: null,
      },
    })),
    ...manoDeObra.map((linea) => ({
      creado: linea.createdAt.getTime(),
      concepto: {
        id: idConceptoOrden("mo", linea.id), tipo: "MANO_OBRA" as const, descripcion: linea.descripcion,
        repuestoId: null, codigo: null, cantidad: 1, precioUnitario: Number(linea.valor), ivaPct: Number(linea.ivaPct),
        precioCatalogo: null, stockActual: null, grupoKitId: linea.grupoKitId, grupoKitNombre: linea.grupoKitNombre,
        editableCantidad: false, mecanico: linea.mecanico,
      },
    })),
  ];
  return filas.sort((a, b) => a.creado - b.creado).map((fila) => fila.concepto);
}
```

- [ ] **Step 4:** En `ORDEN_DETAIL_INCLUDE`: `items: { include: { repuesto: { select: { codigo: true, precioVenta: true, stockActual: true } } } },` y actualizar la expectativa de ese include en `orden-actions.test.ts`.
- [ ] **Step 5:** `npx tsc --noEmit`; `npx vitest run src/lib/orden/conceptos-orden.test.ts src/app/actions/orden-actions.test.ts` → PASS.
- [ ] **Step 6: Commit** `normalizar-orden-task 3: conceptos de la orden en una lista` + push.

---

### Task 4: Acciones de conceptos de la orden

**Files:**
- Create: `src/app/actions/conceptos-orden-actions.ts`, `src/app/actions/conceptos-orden-actions.test.ts`
- Modify: `src/lib/validation/orden.ts` (esquemas)

**Interfaces:**
- Consumes: `buscarConceptos` (Task 2), `leerIdConceptoOrden`/`idConceptoOrden` (Task 3), `resolverIvaPct` (`src/lib/iva/resolver.ts`), `assertOrdenMutable` (`src/lib/orden/mutable-guard.ts`), `scopeOrdenVisible`/`scopeRepuesto` (`src/lib/sede/scope.ts`), `ROLES_MECANICO`.
- Produces (todas `"use server"`, devuelven datos):
  ```ts
  export async function buscarParaOrdenAction(texto: string): Promise<ResultadosBusquedaConceptos>;          // ordenes.trabajar
  export async function agregarRepuestoAOrdenAction(ordenId: string, repuestoId: string): Promise<ResultadoConcepto>;
  export async function agregarLibreAOrdenAction(ordenId: string, input: { tipo: "REPUESTO" | "MANO_OBRA"; descripcion: string }): Promise<ResultadoConcepto>;
  export async function actualizarConceptoOrdenAction(ordenId: string, conceptoId: string, cambios: CambiosConceptoOrden): Promise<ResultadoConcepto>;
  export async function cambiarTipoConceptoOrdenAction(ordenId: string, conceptoId: string): Promise<ResultadoConcepto>;
  export async function quitarKitOrdenAction(ordenId: string, grupoKitId: string): Promise<ResultadoAccion>;   // ordenes.quitar
  // src/lib/validation/orden.ts
  export const cambiosConceptoOrdenSchema; // { cantidad?: int 1..9999, precioUnitario?: dinero >= 0, ivaPct?: 0..100, descripcion?: 1..200, mecanicoId?: string | null }, al menos uno
  export type CambiosConceptoOrden = z.infer<typeof cambiosConceptoOrdenSchema>;
  ```
  `ResultadoConcepto` se importa como tipo desde `@/components/conceptos/tabla-conceptos`.

Reglas (cada una con su test):
1. Todas comprueban la orden con `scopeOrdenVisible(sede, usuario, puede(session, "ordenes.verTodas"))` y `assertOrdenMutable`; si no, `{ error }` sin escribir.
2. `agregarRepuestoAOrdenAction`: repuesto de la sede (`scopeRepuesto`); si existe `itemOrden` con ese `repuestoId`, sin kit, en la orden → `cantidad: { increment: 1 }` y `fusionado: true`; si no, crea con cantidad 1, `precioVenta` e `ivaPct` del repuesto. Devuelve `conceptoId: "item:<id>"`.
3. `agregarLibreAOrdenAction`: `descripcion` recortada (1-200); IVA con `resolverIvaPct(tx, undefined)`; REPUESTO → `itemOrden` sin repuesto, cantidad 1, precio 0; MANO_OBRA → `manoDeObra` con valor 0 y el mecánico de la orden si sigue en la sede (`usuario` con `role in ROLES_MECANICO` y `sedes.some.sedeId`), si no `null`.
4. `actualizarConceptoOrdenAction`: `cantidad` solo en `item` (en `mo` → error "La mano de obra no tiene cantidad"); `precioUnitario` → `precioUnitario` (item) o `valor` (mo); `ivaPct` con `resolverIvaPct(db, nuevo, actual)`; `descripcion` solo si la línea es libre (sin repuesto y sin kit); `mecanicoId` solo en `mo`, `null` o un técnico de la sede (si no → "El técnico seleccionado no existe o no pertenece a esta sede.").
5. `cambiarTipoConceptoOrdenAction`: solo libres; en una `$transaction`: lee la línea, la borra y crea la del otro tipo con `descripcion`, `ivaPct`, `grupoKitId/Nombre`, `createdAt` (conserva el lugar en la lista) e importe (`item → mo`: `valor = cantidad × precioUnitario`; `mo → item`: `cantidad 1, precioUnitario = valor`); a mano de obra lleva el mecánico de la orden (regla 3). Devuelve el nuevo `conceptoId`.
6. `quitarKitOrdenAction`: `requirePermiso("ordenes.quitar")`; `deleteMany` por `{ ordenId, grupoKitId }` en las dos tablas dentro de una transacción; si no borró nada → "El kit ya no está en esta orden".
7. Todas las que escriben hacen `revalidatePath(`/ordenes/${ordenId}`)`.

- [ ] **Step 1: Tests que fallan** en `conceptos-orden-actions.test.ts` con el mismo patrón de mocks de `cotizacion-items-actions.test.ts` (`@/lib/auth/guards` con `requirePermiso` y `puede`; `@/lib/db/tenant-client` con `ordenTrabajo.findFirst`, `repuesto.findFirst`, `usuario.findFirst`, `itemOrden.{findFirst,create,update,delete,deleteMany}`, `manoDeObra.{findFirst,create,update,delete,deleteMany}`, `tarifaIva.findMany` → 0 y 19 predeterminada, `$transaction: (fn) => fn(db)`; `next/cache`). Un `it` por regla:

```ts
it("suma 1 al repuesto que ya está suelto en la orden", async () => {
  db.itemOrden.findFirst.mockResolvedValue({ id: "i1" });
  const r = await agregarRepuestoAOrdenAction("o1", "r1");
  expect(r).toEqual({ error: null, conceptoId: "item:i1", fusionado: true });
  expect(db.itemOrden.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { cantidad: { increment: 1 } } });
});

it("crea el repuesto con el precio y el IVA del catálogo", async () => {
  db.itemOrden.findFirst.mockResolvedValue(null);
  db.itemOrden.create.mockResolvedValue({ id: "i2" });
  const r = await agregarRepuestoAOrdenAction("o1", "r1");
  expect(r.conceptoId).toBe("item:i2");
  expect(db.itemOrden.create).toHaveBeenCalledWith({
    data: { ordenId: "o1", repuestoId: "r1", descripcion: "Filtro", cantidad: 1, precioUnitario: "25000", ivaPct: "5.00" },
    select: { id: true },
  });
});

it("la mano de obra libre toma el mecánico de la orden y el IVA predeterminado", async () => {
  db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "EN_PROCESO", factura: null, mecanicoId: "t1" });
  db.usuario.findFirst.mockResolvedValue({ id: "t1" });
  db.manoDeObra.create.mockResolvedValue({ id: "m9" });
  const r = await agregarLibreAOrdenAction("o1", { tipo: "MANO_OBRA", descripcion: " Lavado " });
  expect(r.conceptoId).toBe("mo:m9");
  expect(db.manoDeObra.create).toHaveBeenCalledWith({
    data: { ordenId: "o1", descripcion: "Lavado", valor: 0, mecanicoId: "t1", ivaPct: 19 }, select: { id: true },
  });
});

it("rechaza una cantidad en la mano de obra y una cantidad no entera", async () => {
  expect((await actualizarConceptoOrdenAction("o1", "mo:m1", { cantidad: 2 })).error).toMatch(/no tiene cantidad/);
  expect((await actualizarConceptoOrdenAction("o1", "item:i1", { cantidad: 1.5 })).error).toBeTruthy();
});

it("el precio de la mano de obra se guarda como su valor", async () => {
  db.manoDeObra.findFirst.mockResolvedValue({ id: "m1", ivaPct: "19", grupoKitId: null });
  await actualizarConceptoOrdenAction("o1", "mo:m1", { precioUnitario: 45000 });
  expect(db.manoDeObra.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { valor: 45000 } });
});

it("no acepta un mecánico de otra sede", async () => {
  db.manoDeObra.findFirst.mockResolvedValue({ id: "m1", ivaPct: "19", grupoKitId: null });
  db.usuario.findFirst.mockResolvedValue(null);
  const r = await actualizarConceptoOrdenAction("o1", "mo:m1", { mecanicoId: "otro" });
  expect(r.error).toMatch(/no pertenece a esta sede/);
  expect(db.manoDeObra.update).not.toHaveBeenCalled();
});

it("cambia una línea libre de repuesto a mano de obra en una transacción, conservando el importe y la fecha", async () => {
  const creada = new Date("2026-11-08T10:00:00Z");
  db.itemOrden.findFirst.mockResolvedValue({ id: "i1", repuestoId: null, grupoKitId: null, grupoKitNombre: null,
    descripcion: "Soldadura", cantidad: 2, precioUnitario: "15000", ivaPct: "19", createdAt: creada });
  db.manoDeObra.create.mockResolvedValue({ id: "m5" });
  const r = await cambiarTipoConceptoOrdenAction("o1", "item:i1");
  expect(r).toEqual({ error: null, conceptoId: "mo:m5" });
  expect(db.itemOrden.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  expect(db.manoDeObra.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ descripcion: "Soldadura", valor: 30000, ivaPct: "19", createdAt: creada }),
  }));
});

it("no cambia el tipo de una línea del catálogo", async () => {
  db.itemOrden.findFirst.mockResolvedValue({ id: "i1", repuestoId: "r1", grupoKitId: null });
  expect((await cambiarTipoConceptoOrdenAction("o1", "item:i1")).error).toMatch(/libres/);
});

it("quitar un kit exige el permiso de quitar y borra en las dos tablas", async () => {
  db.itemOrden.deleteMany.mockResolvedValue({ count: 2 });
  db.manoDeObra.deleteMany.mockResolvedValue({ count: 1 });
  await expect(quitarKitOrdenAction("o1", "g1")).resolves.toEqual({ error: null, success: true });
  expect(mockRequirePermiso).toHaveBeenCalledWith("ordenes.quitar");
  expect(db.itemOrden.deleteMany).toHaveBeenCalledWith({ where: { ordenId: "o1", grupoKitId: "g1" } });
  expect(db.manoDeObra.deleteMany).toHaveBeenCalledWith({ where: { ordenId: "o1", grupoKitId: "g1" } });
});

it("no escribe nada en una orden facturada", async () => {
  db.ordenTrabajo.findFirst.mockResolvedValue({ estado: "ENTREGADA", factura: { id: "f1" }, mecanicoId: null });
  expect((await agregarLibreAOrdenAction("o1", { tipo: "REPUESTO", descripcion: "x" })).error).toBeTruthy();
  expect(db.itemOrden.create).not.toHaveBeenCalled();
});
```

  En `beforeEach`: sesión con permisos `["ordenes.trabajar", "ordenes.quitar", "ordenes.verTodas"]`, sede `sede-1`; orden `{ estado: "EN_PROCESO", factura: null, mecanicoId: null }`; repuesto `{ id: "r1", nombre: "Filtro", precioVenta: "25000", ivaPct: "5.00" }`; `itemOrden.findFirst` → `{ id: "i1", repuestoId: "r1", grupoKitId: null, ivaPct: "19" }`.

- [ ] **Step 2:** `npx vitest run src/app/actions/conceptos-orden-actions.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar** el esquema en `lib/validation/orden.ts`:

```ts
export const cambiosConceptoOrdenSchema = z
  .object({
    cantidad: z.number().int("La cantidad de un repuesto debe ser un número entero").min(1, "La cantidad debe ser al menos 1").max(9999).optional(),
    precioUnitario: z.number().min(0, "El precio debe ser 0 o mayor").optional(),
    ivaPct: z.number().min(0).max(100).optional(),
    descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(200).optional(),
    mecanicoId: z.string().min(1).nullable().optional(),
  })
  .refine((datos) => Object.values(datos).some((valor) => valor !== undefined), { message: "No hay cambios que guardar" });
export type CambiosConceptoOrden = z.infer<typeof cambiosConceptoOrdenSchema>;
```

  y `conceptos-orden-actions.ts` con un helper no exportado `ordenEditable(tenantDb, session, ordenId)` → `{ error: string } | { mecanicoId: string | null }`, otro `mecanicoDeLaSede(tenantDb, mecanicoId, sedeId)` (misma consulta que `servicio-actions.ts:mecanicoDeLaSede`), y las seis acciones siguiendo las reglas 1-7. Errores de Prisma con `friendlyPrismaErrorMessage(err, "…")`.
- [ ] **Step 4:** `npx tsc --noEmit`; `npx vitest run src/app/actions/conceptos-orden-actions.test.ts src/lib/validation` → PASS.
- [ ] **Step 5: Commit** `normalizar-orden-task 4: acciones de conceptos de la orden` + push.

---

### Task 5: La orden usa la tabla compartida

**Files:**
- Create: `src/app/(dashboard)/ordenes/[id]/conceptos-orden.tsx`, `src/app/(dashboard)/ordenes/[id]/conceptos-orden.test.tsx`
- Modify: `src/app/(dashboard)/ordenes/[id]/page.tsx`
- Delete (con `git rm`, solo tras confirmar con `grep -rn` que nadie más los usa): `agregar-al-trabajo.tsx` (+test), `agregar-item-form.tsx` (+test), `agregar-mano-obra-form.tsx` (+test), `aplicar-servicio-form.tsx` (+test), `iva-linea-orden.tsx`; `cambiarIvaLineaOrdenAction` y su `describe` en `item-orden-actions(.test).ts`; `addItemOrdenAction` / `addManoDeObraAction` y sus tests si quedan sin uso (revisar también `scripts/`); `src/lib/orden/kits-orden.ts` (+test) si queda sin uso.

**Interfaces:**
- Consumes: `TablaConceptos` y `AdaptadorConceptos` (Task 1), acciones de Task 4, `aplicarServicioAOrdenAction`, `deleteItemOrdenFormAction`, `deleteManoDeObraFormAction`, `conceptosDesdeOrden`/`leerIdConceptoOrden` (Task 3), `NuevoRepuestoDialog` (`src/app/(dashboard)/repuestos/nuevo-repuesto-dialog.tsx`), `TecnicoOption`.
- Produces:
  ```ts
  export function ConceptosOrden(props: {
    ordenId: string; conceptos: ConceptoVista[]; puedeEditar: boolean; puedeQuitar: boolean;
    tecnicos: TecnicoOption[];
    crearRepuesto: { bodegas: Bodega[]; proveedores: Proveedor[]; verCostos: boolean } | null;
  }): JSX.Element;
  ```

- [ ] **Step 1: Test que falla** (`conceptos-orden.test.tsx`; mocks de `@/app/actions/conceptos-orden-actions`, `item-orden-actions`, `mano-de-obra-actions`, `servicio-actions`, `next/navigation`, `sonner`, y `../../repuestos/nuevo-repuesto-dialog` como componente vacío):

```tsx
it("la mano de obra muestra su mecánico y no deja editar la cantidad", () => {
  render(<ConceptosOrden ordenId="o1" puedeEditar puedeQuitar tecnicos={[{ id: "t1", nombre: "Carlos" }, { id: "t2", nombre: "Javier" }]}
    crearRepuesto={null} conceptos={[mo({ mecanico: { id: "t1", nombre: "Carlos" } })]} />);
  expect(screen.getByRole("combobox", { name: "Mecánico de Cambio de pastillas" })).toHaveTextContent("Carlos");
  expect(screen.queryByLabelText("Cantidad de Cambio de pastillas")).not.toBeInTheDocument();
});

it("cambiar el mecánico llama la acción de la orden con el id de la línea", async () => {
  mockActualizar.mockResolvedValue({ error: null, conceptoId: "mo:m1" });
  render(/* igual que arriba */);
  await userEvent.click(screen.getByRole("combobox", { name: "Mecánico de Cambio de pastillas" }));
  await userEvent.click(await screen.findByRole("option", { name: "Javier" }));
  expect(mockActualizar).toHaveBeenCalledWith("o1", "mo:m1", { mecanicoId: "t2" });
});

it("un tipo de línea libre se cambia con la acción de cambiar tipo", async () => {
  mockCambiarTipo.mockResolvedValue({ error: null, conceptoId: "mo:m7" });
  render(<ConceptosOrden ordenId="o1" puedeEditar puedeQuitar tecnicos={[]} crearRepuesto={null}
    conceptos={[repuestoLibre({ id: "item:i7", descripcion: "Soldadura" })]} />);
  await userEvent.click(screen.getByTitle("Cambiar entre repuesto y mano de obra"));
  expect(mockCambiarTipo).toHaveBeenCalledWith("o1", "item:i7");
});

it("sin permiso de editar muestra el mecánico como texto", () => {
  render(<ConceptosOrden ordenId="o1" puedeEditar={false} puedeQuitar={false} tecnicos={[]} crearRepuesto={null}
    conceptos={[mo({ mecanico: { id: "t1", nombre: "Carlos" } })]} />);
  expect(screen.getByText("Mecánico: Carlos")).toBeInTheDocument();
});
```

  con fábricas `mo(overrides)` (`id: "mo:m1"`, `tipo: "MANO_OBRA"`, `descripcion: "Cambio de pastillas"`, `cantidad: 1`, `precioUnitario: 135000`, `ivaPct: 19`, `editableCantidad: false`, kit `null`, `repuestoId: null`, `codigo: null`, `precioCatalogo: null`, `stockActual: null`, `mecanico: null`) y `repuestoLibre(overrides)` (`tipo: "REPUESTO"`, `editableCantidad: true`, resto igual sin mecánico).

- [ ] **Step 2:** `npx vitest run "src/app/(dashboard)/ordenes/[id]/conceptos-orden.test.tsx"` → FAIL.
- [ ] **Step 3: Implementar** `conceptos-orden.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  actualizarConceptoOrdenAction, agregarLibreAOrdenAction, agregarRepuestoAOrdenAction,
  buscarParaOrdenAction, cambiarTipoConceptoOrdenAction, quitarKitOrdenAction,
} from "@/app/actions/conceptos-orden-actions";
import { deleteItemOrdenFormAction } from "@/app/actions/item-orden-actions";
import { deleteManoDeObraFormAction } from "@/app/actions/mano-de-obra-actions";
import { aplicarServicioAOrdenAction } from "@/app/actions/servicio-actions";
import type { TecnicoOption } from "@/app/actions/orden-actions";
import type { ConceptoVista } from "@/lib/conceptos/conceptos";
import { leerIdConceptoOrden } from "@/lib/orden/conceptos-orden";
import { TablaConceptos, type AdaptadorConceptos } from "@/components/conceptos/tabla-conceptos";
import { SelectField } from "@/components/ui/select-field";
import { NuevoRepuestoDialog } from "../../repuestos/nuevo-repuesto-dialog";

const ESTADO_APLICAR_INICIAL = { error: null, success: false, agregados: null };
const SIN_ASIGNAR = "__sin_asignar__";

export function ConceptosOrden({ ordenId, conceptos, puedeEditar, puedeQuitar, tecnicos, crearRepuesto }: {
  ordenId: string; conceptos: ConceptoVista[]; puedeEditar: boolean; puedeQuitar: boolean;
  tecnicos: TecnicoOption[];
  crearRepuesto: { bodegas: Parameters<typeof NuevoRepuestoDialog>[0]["bodegas"];
    proveedores: Parameters<typeof NuevoRepuestoDialog>[0]["proveedores"]; verCostos: boolean } | null;
}) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);

  const adaptador = useMemo<AdaptadorConceptos>(() => ({
    buscar: buscarParaOrdenAction,
    agregarRepuesto: (repuestoId) => agregarRepuestoAOrdenAction(ordenId, repuestoId),
    agregarLibre: (input) => agregarLibreAOrdenAction(ordenId, input),
    async aplicarServicio(servicioId) {
      const formData = new FormData();
      formData.set("servicioId", servicioId);
      const r = await aplicarServicioAOrdenAction(ordenId, ESTADO_APLICAR_INICIAL, formData);
      return { error: r.error, agregados: r.agregados };
    },
    actualizar: (concepto, cambios) =>
      cambios.tipo !== undefined
        ? cambiarTipoConceptoOrdenAction(ordenId, concepto.id)
        : actualizarConceptoOrdenAction(ordenId, concepto.id, cambios),
    async quitar(concepto) {
      const linea = leerIdConceptoOrden(concepto.id);
      if (!linea) return { error: "Línea no reconocida", success: false };
      return linea.tabla === "item"
        ? deleteItemOrdenFormAction(linea.id, ordenId)
        : deleteManoDeObraFormAction(linea.id, ordenId);
    },
    quitarKit: (grupoKitId) => quitarKitOrdenAction(ordenId, grupoKitId),
  }), [ordenId]);

  async function cambiarMecanico(concepto: ConceptoVista, valor: string) {
    const mecanicoId = valor === SIN_ASIGNAR ? null : valor;
    if (mecanicoId === (concepto.mecanico?.id ?? null)) return;
    const r = await actualizarConceptoOrdenAction(ordenId, concepto.id, { mecanicoId });
    if (r.error) toast.error(r.error);
    else router.refresh();
  }

  function detalleFila(concepto: ConceptoVista) {
    if (concepto.tipo !== "MANO_OBRA") return null;
    if (!puedeEditar) {
      return <p className="mt-1 text-xs text-muted-foreground">Mecánico: {concepto.mecanico?.nombre ?? "Sin asignar"}</p>;
    }
    return (
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Mecánico:</span>
        <SelectField
          size="sm"
          aria-label={`Mecánico de ${concepto.descripcion}`}
          className="h-7 w-40 text-xs"
          value={concepto.mecanico?.id ?? SIN_ASIGNAR}
          onValueChange={(valor) => void cambiarMecanico(concepto, valor)}
          items={[{ value: SIN_ASIGNAR, label: "Sin asignar" }, ...tecnicos.map((t) => ({ value: t.id, label: t.nombre }))]}
        />
      </div>
    );
  }

  return (
    <>
      <TablaConceptos
        adaptador={adaptador}
        conceptos={conceptos}
        puedeEditar={puedeEditar}
        puedeQuitar={puedeQuitar}
        cantidadEntera
        detalleFila={detalleFila}
        crearRepuesto={crearRepuesto ? () => setCreando(true) : undefined}
        textoVacio="Esta orden no tiene conceptos."
      />
      {crearRepuesto ? (
        <NuevoRepuestoDialog
          open={creando}
          onOpenChange={setCreando}
          bodegas={crearRepuesto.bodegas}
          proveedores={crearRepuesto.proveedores}
          verCostos={crearRepuesto.verCostos}
          onCreated={async (repuestoId) => {
            setCreando(false);
            const r = await agregarRepuestoAOrdenAction(ordenId, repuestoId);
            if (r.error) toast.error(r.error);
            else toast.success("Repuesto creado y agregado a la orden");
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Página.** En `ordenes/[id]/page.tsx`, pestaña Trabajo: dejar las tres cifras; reemplazar la tarjeta "Kits aplicados", "Agregar al trabajo" y las tarjetas Repuestos y Mano de obra por:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Conceptos</CardTitle>
  </CardHeader>
  <CardContent>
    <ConceptosOrden
      ordenId={orden.id}
      conceptos={conceptosDesdeOrden(orden.items, orden.manoDeObra)}
      puedeEditar={esOrdenMutable(orden) && puede(session, "ordenes.trabajar")}
      puedeQuitar={esOrdenMutable(orden) && puede(session, "ordenes.quitar")}
      tecnicos={tecnicos}
      crearRepuesto={puede(session, "inventario.editar") ? { bodegas, proveedores, verCostos: puede(session, "inventario.costos") } : null}
    />
  </CardContent>
</Card>
```

  Quitar imports, columnas (`ITEMS_COLUMNS`, `MANO_OBRA_COLUMNS`, `conColumnaIva`, `conColumnaQuitar`), `kits` y los datos que queden sin uso en el `Promise.all` (`listRepuestoOptions`, `listServicios`) — confirmar con grep dentro del archivo antes de quitar cada uno.
- [ ] **Step 5: Retirar** los archivos y acciones listados en **Files → Delete**, cada uno solo si `grep -rn "<nombre>" src scripts` no muestra otros usos.
- [ ] **Step 6:** `npx tsc --noEmit`; `npx vitest run "src/app/(dashboard)/ordenes" src/app/actions src/lib/orden src/components/conceptos` → PASS.
- [ ] **Step 7: Commit** `normalizar-orden-task 5: la orden captura conceptos con la tabla compartida` + push.

---

### Task 6: Verificación completa y prueba en el navegador

**Files:** ninguno nuevo (correcciones puntuales si aparecen).

- [ ] **Step 1:** `npx tsc --noEmit` y `npx vitest run` (en segundo plano) → todo en verde. Si falla un test de UI por carga, correrlo solo una vez antes de concluir.
- [ ] **Step 2:** Pedir permiso al usuario para reiniciar la app (no hay migraciones). Con la app arriba y la sesión iniciada por el usuario, en una orden en proceso (datos ficticios):
  1. Buscar y agregar un repuesto; volver a agregarlo → suma 1 (destello y aviso).
  2. Aplicar un servicio/kit → aparece agrupado y abierto, con su mano de obra y mecánico de la orden.
  3. Agregar "Lavado de motor" como mano de obra; cambiarle el valor, el IVA y el mecánico.
  4. Agregar una línea libre como repuesto, cambiar su cantidad (probar "1,5" → rechazado) y pasarla a mano de obra con ⇄.
  5. Volver un precio al de catálogo con ↺; quitar una línea y un kit.
  6. Confirmar que las cifras de arriba y la Cuenta cambian con cada acción.
  7. "Crear «x» en el inventario" abre el diálogo de nuevo repuesto y al guardarlo queda en la orden.
  8. Revisar la cotización #43 (aprobada, solo lectura) y una cotización en borrador: la tabla se ve y se comporta igual que antes.
  9. Una orden facturada: la tabla queda de solo lectura.
- [ ] **Step 3:** Commit de correcciones si las hubo (`normalizar-orden-task 6: …`), merge `--no-ff` a `main`, push, pasos de despliegue (sin migraciones) y actualizar la memoria `project_ajustes_taller_hector.md`.
