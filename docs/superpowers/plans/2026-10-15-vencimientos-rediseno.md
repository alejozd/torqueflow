# Plan — Rediseño de la lista de Vencimientos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar `/vencimientos` a la grilla compacta del diseño de Stitch sin perder el aviso por WhatsApp.

**Architecture:** La action `listVencimientos` agrega marca, modelo, año y teléfono a cada fila. El filtrado
pasa a una función pura (`filtro-lista.ts`) con chips de filtro rápido con conteo. La tabla del cliente
se rearma con celdas compuestas (vehículo, cliente, documento, vencimiento, días, aviso).

**Tech Stack:** Next.js (leer `node_modules/next/dist/docs/` antes de tocar APIs de Next), React, Tailwind, Vitest + Testing Library, Prisma (tenant).

**Diseño de referencia:** `docs/Evidencias/vencimientos/screen.png` (+ `code.html`). Decisiones acordadas con el usuario:
- **Se toma:** celda Vehículo (placa amarilla + marca/modelo + tipo · año), teléfono bajo el cliente,
  documento como chip con ícono, badge de estado con fecha, pill de días con color, chips rápidos con conteo,
  separar "Vence pronto" (PROXIMO, ≤7 días) de "Por vencer" (POR_VENCER), "Configurar alertas".
- **Se conserva del actual:** columna de aviso (botón WhatsApp + último aviso), oculta para TECNICO.
- **NO se hace:** "Recordatorios masivos" (wa.me es uno a uno), 4ª tarjeta "Gestionados este mes",
  "Exportar Excel", botón refrescar, links "Filtrar lista" en las tarjetas, paginación custom (DataTable ya pagina).

## Global Constraints

- Rama `vencimientos-rediseno` desde `main`. Commits `vencimientos-task N: descripción` + push tras cada task (RULES.md §3).
- Textos en español de Colombia, lenguaje sencillo. KPI en una fila. Sin librerías nuevas.
- Reusar: `PlacaVehiculo` (`as="span"`), `VencimientoBadge`, `KpiCard`/`KPI_TONE`, `DataTable`, `SelectField`, `AvisarWhatsappButton`.
- `tsc --noEmit` y tests solo al final de cada task. No tocar backlog de fases anteriores (RULES.md §7).
- No hay cambios de esquema ni migraciones.

---

### Task 1: Datos del vehículo y teléfono en la fila

**Files:**
- Modify: `src/app/actions/vencimiento-actions.ts` (interfaz `FilaVencimiento`, `select` y `filas.push` de `listVencimientos`)
- Test: `src/app/actions/vencimiento-actions.test.ts`

**Interfaces:**
- Produces: `FilaVencimiento` gana `marca: string; modelo: string; anio: number | null; clienteTelefono: string | null`.

- [ ] **Step 1: Test que falla.** En el `it("una fila por documento que requiere aviso…")`, agregar `marca`, `modelo`, `anio` a los mocks de vehículo (ej. Ana: `marca: "Renault", modelo: "Duster", anio: 2021`; Luis: `anio: null`) y añadir:

```ts
expect(filas[0]).toMatchObject({ marca: "Renault", modelo: "Duster", anio: 2021, clienteTelefono: "3105550142" });
expect(filas.find((f) => f.clienteNombre === "Luis")?.clienteTelefono).toBeNull();
```
(Ajustar el índice a la fila de Ana según el orden que ya verifica el test.)

- [ ] **Step 2:** `npx vitest run src/app/actions/vencimiento-actions.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**

```ts
export interface FilaVencimiento {
  id: string;
  vehiculoId: string;
  placa: string;
  tipoVehiculo: TipoVehiculoValor;
  marca: string;
  modelo: string;
  anio: number | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  // …resto igual
}
```
En el `select`: `marca: true, modelo: true, anio: true,`. En `filas.push`: `marca: vehiculo.marca, modelo: vehiculo.modelo, anio: vehiculo.anio, clienteTelefono: vehiculo.cliente.telefono,`.

- [ ] **Step 4:** test → PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** commit `vencimientos-task 1: la fila trae marca, modelo, año y teléfono del cliente` + push.

---

### Task 2: Filtro de la lista como función pura

**Files:**
- Create: `src/lib/vencimientos/filtro-lista.ts`
- Test: `src/lib/vencimientos/filtro-lista.test.ts`

**Interfaces:**
- Produces:
```ts
export type FiltroRapido = "TODOS" | "VENCIDO" | "PROXIMO" | "POR_VENCER" | "SIN_AVISAR";
export type FiltroDocumento = "TODOS" | TipoDocumento;
export type FilaFiltrable = Pick<FilaVencimiento, "tipo" | "estado" | "ultimoAviso">;
export function filtrarVencimientos<T extends FilaFiltrable>(filas: readonly T[], documento: FiltroDocumento, rapido: FiltroRapido): T[];
export function contarPorFiltro(filas: readonly FilaFiltrable[], documento: FiltroDocumento): Record<FiltroRapido, number>;
export const ETIQUETA_FILTRO_RAPIDO: Record<FiltroRapido, string>; // Todos, Vencidos, Vencen pronto, Por vencer, Sin avisar
```
Los conteos de los chips respetan el filtro de documento (si eliges "SOAT", los chips cuentan solo SOAT).

- [ ] **Step 1: Tests que fallan.**

```ts
import { describe, expect, it } from "vitest";
import { contarPorFiltro, filtrarVencimientos } from "./filtro-lista";

const aviso = { canal: "WHATSAPP" as const, enviadoAt: new Date("2026-10-10T00:00:00Z") };
const filas = [
  { id: "a", tipo: "SOAT" as const, estado: "VENCIDO" as const, ultimoAviso: null },
  { id: "b", tipo: "SOAT" as const, estado: "PROXIMO" as const, ultimoAviso: aviso },
  { id: "c", tipo: "TECNOMECANICA" as const, estado: "PROXIMO" as const, ultimoAviso: null },
  { id: "d", tipo: "TECNOMECANICA" as const, estado: "POR_VENCER" as const, ultimoAviso: null },
];

describe("filtrarVencimientos", () => {
  it("TODOS devuelve todo", () => {
    expect(filtrarVencimientos(filas, "TODOS", "TODOS").map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("separa vence pronto de por vencer", () => {
    expect(filtrarVencimientos(filas, "TODOS", "PROXIMO").map((f) => f.id)).toEqual(["b", "c"]);
    expect(filtrarVencimientos(filas, "TODOS", "POR_VENCER").map((f) => f.id)).toEqual(["d"]);
  });
  it("sin avisar excluye los que tienen último aviso", () => {
    expect(filtrarVencimientos(filas, "TODOS", "SIN_AVISAR").map((f) => f.id)).toEqual(["a", "c", "d"]);
  });
  it("combina documento y filtro rápido", () => {
    expect(filtrarVencimientos(filas, "TECNOMECANICA", "PROXIMO").map((f) => f.id)).toEqual(["c"]);
  });
});

describe("contarPorFiltro", () => {
  it("cuenta cada chip", () => {
    expect(contarPorFiltro(filas, "TODOS")).toEqual({ TODOS: 4, VENCIDO: 1, PROXIMO: 2, POR_VENCER: 1, SIN_AVISAR: 3 });
  });
  it("respeta el documento elegido", () => {
    expect(contarPorFiltro(filas, "SOAT")).toEqual({ TODOS: 2, VENCIDO: 1, PROXIMO: 1, POR_VENCER: 0, SIN_AVISAR: 1 });
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/vencimientos/filtro-lista.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar.**

```ts
import type { FilaVencimiento } from "@/app/actions/vencimiento-actions";
import type { TipoDocumento } from "./estado-vencimiento";

export type FiltroRapido = "TODOS" | "VENCIDO" | "PROXIMO" | "POR_VENCER" | "SIN_AVISAR";
export type FiltroDocumento = "TODOS" | TipoDocumento;
export type FilaFiltrable = Pick<FilaVencimiento, "tipo" | "estado" | "ultimoAviso">;

export const FILTROS_RAPIDOS: readonly FiltroRapido[] = ["TODOS", "VENCIDO", "PROXIMO", "POR_VENCER", "SIN_AVISAR"];

export const ETIQUETA_FILTRO_RAPIDO: Record<FiltroRapido, string> = {
  TODOS: "Todos",
  VENCIDO: "Vencidos",
  PROXIMO: "Vencen pronto",
  POR_VENCER: "Por vencer",
  SIN_AVISAR: "Sin avisar",
};

function cumple(fila: FilaFiltrable, rapido: FiltroRapido): boolean {
  if (rapido === "TODOS") return true;
  if (rapido === "SIN_AVISAR") return fila.ultimoAviso === null;
  return fila.estado === rapido;
}

export function filtrarVencimientos<T extends FilaFiltrable>(
  filas: readonly T[],
  documento: FiltroDocumento,
  rapido: FiltroRapido,
): T[] {
  return filas.filter((fila) => (documento === "TODOS" || fila.tipo === documento) && cumple(fila, rapido));
}

export function contarPorFiltro(filas: readonly FilaFiltrable[], documento: FiltroDocumento): Record<FiltroRapido, number> {
  const delDocumento = filtrarVencimientos(filas, documento, "TODOS");
  return Object.fromEntries(
    FILTROS_RAPIDOS.map((rapido) => [rapido, delDocumento.filter((fila) => cumple(fila, rapido)).length]),
  ) as Record<FiltroRapido, number>;
}
```
(Si el import de tipo desde `app/actions` crea un ciclo con `"use server"`, es solo `import type`; no afecta al bundle.)

- [ ] **Step 4:** tests → PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** commit `vencimientos-task 2: filtro de la lista con chips rápidos y conteos` + push.

---

### Task 3: Grilla nueva de la tabla

**Files:**
- Modify: `src/app/(dashboard)/vencimientos/vencimientos-table.tsx` (reescritura)
- Test: `src/app/(dashboard)/vencimientos/vencimientos-table.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `FilaVencimiento` (Task 1), `filtrarVencimientos`, `contarPorFiltro`, `FILTROS_RAPIDOS`, `ETIQUETA_FILTRO_RAPIDO` (Task 2).
- Produces: `VencimientosTable({ filas, puedeAvisar, ahora })` — misma firma que hoy.

**Layout** (dentro de la `Card`):
- `CardHeader`: título "Listado de vencimientos" + contador `{visibles.length} registros` (badge gris mono pequeño).
- Barra: buscador del `DataTable` (placeholder "Buscar por placa o cliente…") + `SelectField` de documento (se queda). **Se quitan** el select de estados y el checkbox "Solo sin avisar".
- Fila de chips: "Filtros rápidos:" + un `<button type="button" aria-pressed>` por `FILTROS_RAPIDOS` con texto `Vencidos (2)`. Activo `TODOS` → fondo oscuro; los demás con el tono de su estado (rojo VENCIDO, ámbar PROXIMO, azul POR_VENCER, gris SIN_AVISAR) con fondo suave, y anillo cuando están activos.

**Columnas:**
1. **Vehículo** — `<Link href=/vehiculos/{id}>` con `<PlacaVehiculo as="span" placa={…} className="text-sm" />` y a la derecha dos líneas: `{marca} {modelo}` (font-medium) y `{ETIQUETA_TIPO_VEHICULO[tipoVehiculo]}{anio ? ` · ${anio}` : ""}` (xs muted). `searchValue`: `` `${placa} ${marca} ${modelo}` ``.
2. **Cliente** — nombre y debajo, si hay teléfono, ícono `Phone` (size-3) + teléfono (xs muted). `searchValue`: `` `${clienteNombre} ${clienteTelefono ?? ""}` ``.
3. **Documento** — chip: SOAT con `FileText` en azul suave; Tecnomecánica con `Wrench` en violeta suave.
4. **Vencimiento** — `<VencimientoBadge estado fecha />` (ya trae punto, etiqueta y fecha).
5. **Días** — `textoDias` (sin cambios) dentro de pill mono xs con fondo según estado: VENCIDO rojo, PROXIMO ámbar, POR_VENCER gris.
6. **Aviso** (solo si `puedeAvisar`) — `AvisarWhatsappButton` y debajo, en xs muted, `Avisado por WhatsApp · hace 2 días` o "Sin avisar". Si `!puedeAvisar` (TECNICO), igual mostrar la columna "Último aviso" como texto, como hoy.

Mantener `emptyMessage="No hay vencimientos con este filtro."`.

- [ ] **Step 1: Tests que fallan** (Testing Library; mockear `AvisarWhatsappButton` si el test de la acción complica — ver `avisar-whatsapp-button.test.tsx` para el mock de `registrarAvisoWhatsappAction` y `sonner`):

```tsx
const base = {
  vehiculoId: "v1", tipoVehiculo: "CARRO" as const, marca: "Mazda", modelo: "3", anio: 2020,
  clienteNombre: "Andrea Valencia", clienteTelefono: "3148892341", fechaVencimiento: new Date("2026-10-17T00:00:00Z"),
  urlWhatsapp: "https://wa.me/573148892341?text=x",
};
const filas: FilaVencimiento[] = [
  { ...base, id: "1", placa: "YOR558", tipo: "SOAT", estado: "VENCIDO", diasRestantes: -14, ultimoAviso: null },
  { ...base, id: "2", placa: "MRW615", tipo: "TECNOMECANICA", estado: "PROXIMO", diasRestantes: 2,
    ultimoAviso: { canal: "WHATSAPP", enviadoAt: new Date("2026-10-13T00:00:00Z") } },
];
const ahora = new Date("2026-10-15T12:00:00Z");

it("muestra vehículo, teléfono y días", () => {
  render(<VencimientosTable filas={filas} puedeAvisar ahora={ahora} />);
  expect(screen.getByText("YOR558")).toBeInTheDocument();
  expect(screen.getAllByText("Mazda 3")).toHaveLength(2);
  expect(screen.getAllByText("3148892341").length).toBeGreaterThan(0);
  expect(screen.getByText("Hace 14 días")).toBeInTheDocument();
});

it("los chips muestran conteo y filtran", async () => {
  render(<VencimientosTable filas={filas} puedeAvisar ahora={ahora} />);
  await userEvent.click(screen.getByRole("button", { name: "Vencidos (1)" }));
  expect(screen.getByText("YOR558")).toBeInTheDocument();
  expect(screen.queryByText("MRW615")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Vencidos (1)" })).toHaveAttribute("aria-pressed", "true");
});

it("técnico ve el último aviso pero no el botón", () => {
  render(<VencimientosTable filas={filas} puedeAvisar={false} ahora={ahora} />);
  expect(screen.queryByRole("button", { name: /avisar por whatsapp/i })).not.toBeInTheDocument();
  expect(screen.getByText(/WhatsApp ·/)).toBeInTheDocument();
});
```
(Si `PlacaVehiculo` pasa la placa a mayúsculas, los textos ya lo están. Confirmar el texto exacto de `formatoFechaRelativa` antes de afinar el regex.)

- [ ] **Step 2:** `npx vitest run "src/app/(dashboard)/vencimientos"` → FAIL.
- [ ] **Step 3:** Reescribir `vencimientos-table.tsx` según el layout de arriba, con estado `documento: FiltroDocumento` y `rapido: FiltroRapido`; `visibles = filtrarVencimientos(filas, documento, rapido)`; `conteos = contarPorFiltro(filas, documento)`. Clases de color por estado en un `Record<EstadoVencimiento, string>` local (mismos tonos oklch de `vencimiento-badge.tsx`).
- [ ] **Step 4:** tests → PASS (incluye `avisar-whatsapp-button.test.tsx`); `npx tsc --noEmit`.
- [ ] **Step 5:** commit `vencimientos-task 3: grilla compacta con vehículo, teléfono, chips de filtro y columna de aviso` + push.

---

### Task 4: Cabecera y tarjetas

**Files:**
- Modify: `src/app/(dashboard)/vencimientos/page.tsx`
- Modify: `src/app/(dashboard)/vencimientos/loading.tsx` (que el esqueleto calce con la nueva cabecera, si cambia la forma)

**Interfaces:**
- Consumes: `getDiasAvisoVencimiento()` de `@/app/actions/configuracion-taller-actions` (ya existe; la usa `/configuracion-smtp`).

- [ ] **Step 1:** Cabecera: título + subtítulo "SOAT y revisión técnico-mecánica próximos a vencer o vencidos". A la derecha, **solo si `session.user.role === "ADMIN"`**, botón `variant="outline"` con `Settings` → `Link href="/configuracion-smtp"` texto "Configurar alertas" (antes, confirmar en `configuracion-smtp/page.tsx` qué rol exige y usar ese mismo).
- [ ] **Step 2:** Tarjetas (siguen siendo 3 y en una fila): "Vencidos" / "documentos vencidos sin renovar"; "Vencen en 7 días" / "requieren aviso ya"; "Por vencer ({diasAviso} días)" / "dentro de la ventana de aviso". Pedir `getDiasAvisoVencimiento()` en el mismo `Promise.all`.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx vitest run "src/app/(dashboard)/vencimientos"`. Lanzar `npm run dev` en background y pedir revisión manual al usuario en `/vencimientos` (con ADMIN y con TECNICO).
- [ ] **Step 4:** commit `vencimientos-task 4: cabecera con configurar alertas y tarjetas con la ventana de aviso` + push.

---

### Task 5: Cierre

- [ ] Nota corta en `docs/TRASPASO-AGENTES.md` (qué cambió, qué se descartó del diseño de Stitch y por qué). Sin migraciones.
- [ ] Revisión final; merge `--no-ff` de `vencimientos-rediseno` a `main` + push. Recordar al usuario que falta desplegar.
