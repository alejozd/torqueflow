# Tanda 3: precios con IVA incluido — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos los precios llevan el IVA incluido; la factura y el Mostrador lo separan por dentro; la captura no permite repuestos libres y quita líneas con un bote de basura rojo.

**Architecture:** Un solo cálculo (`separarIvaIncluido` en `src/lib/iva/desglose.ts`) reemplaza al de "IVA encima" en cotización, factura y Mostrador. La cotización y la orden dejan de mostrar el IVA (guardan la tarifa sin mostrarla); la factura gana un paso de revisión de tarifas. Una migración sube los precios del catálogo y de los documentos abiertos con su IVA.

**Tech Stack:** Next.js 16.4.5, React 19, Prisma 6 (multi-tenant), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-iva-incluido-design.md`

## Global Constraints

- Rama `ajustes-hector-3`. Un commit por tarea con push: `ajustes-hector3-task N: …`, con las líneas `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_018YL6snH3zmvMAubejesikY`.
- Precio = precio final con IVA incluido en todo el sistema. Ningún total suma IVA encima.
- `TramoIva` conserva su forma `{ ivaPct, base, iva }` (los desgloses guardados se siguen leyendo).
- La migración de datos se aplica **solo con permiso explícito** y **justo antes del despliegue** (la base `taller_dev` es la de producción: con la migración aplicada y el código viejo, producción cobraría IVA dos veces).
- Archivos con CRLF: editar con Edit o scripts que respeten `\r\n`.
- `tsc --noEmit` y tests al final de cada tarea; antes de pasar a la siguiente, "vamos en N de 7" y preguntar.

---

## Estructura de archivos

| Archivo | Cambio |
|---|---|
| `src/lib/iva/desglose.ts` | `separarIvaIncluido` reemplaza a `desglosarIva`. |
| `src/lib/cotizacion/totales.ts`, `src/lib/factura/totales.ts`, `src/lib/mostrador/ventas.ts` | Totales con IVA incluido; devolución sin sumar IVA. |
| `src/components/conceptos/buscador-conceptos.tsx`, `tabla-conceptos.tsx` | Sin "como repuesto", sin ⇄, bote de basura, `mostrarIva`, crear con nombre. |
| `src/app/actions/cotizacion-items-actions.ts`, `conceptos-orden-actions.ts`, `src/lib/validation/cotizacion.ts`, `orden.ts` | Libre solo mano de obra; sin cambio de tipo. |
| `src/app/(dashboard)/repuestos/nuevo-repuesto-dialog.tsx`, `nuevo-repuesto-form.tsx` | `nombreInicial`. |
| `src/app/(dashboard)/cotizaciones/[id]/*`, `src/components/resumen-economico.tsx`, `src/app/cotizaciones/[id]/imprimir/page.tsx`, `src/lib/cotizacion/plantilla-envio.ts` | Sin IVA visible; "IVA incluido". |
| `src/app/(dashboard)/ordenes/[id]/cuenta-orden.tsx`, `generar-factura-form.tsx`, `page.tsx` | Cuenta con IVA incluido; revisión de tarifas al facturar. |
| `src/app/actions/factura-actions.ts`, `src/lib/validation/factura.ts`, `src/app/(dashboard)/facturas/[id]/page.tsx` | Tarifas elegidas; factura con base/IVA. |
| `src/app/(dashboard)/mostrador/*`, `src/lib/mostrador/comprobante.ts`, `src/app/mostrador/[id]/comprobante/page.tsx` | "Incluye IVA". |
| `prisma/tenant/migrations/20261108120000_iva_incluido/`, `scripts/iva-incluido/recalcular-cotizaciones.ts` | Migración de datos y recálculo. |

---

### Task 1: Cálculo con IVA incluido

**Files:**
- Modify: `src/lib/iva/desglose.ts`, `src/lib/cotizacion/totales.ts`, `src/lib/factura/totales.ts`, `src/lib/mostrador/ventas.ts`, todos los usos de `desglosarIva` (`grep -rn desglosarIva src`)
- Test: `src/lib/iva/desglose.test.ts`, `src/lib/cotizacion/totales.test.ts`, `src/lib/factura/totales.test.ts`, `src/lib/mostrador/ventas.test.ts`, `src/app/actions/factura-actions.test.ts`, `src/app/actions/venta-mostrador-actions.test.ts`, `src/app/actions/servicio-actions.test.ts`, `src/app/(dashboard)/mostrador/vender-mostrador.test.tsx` (expectativas de totales)

**Interfaces:**
- Produces:
  ```ts
  // src/lib/iva/desglose.ts
  export interface TramoIva { ivaPct: number; base: number; iva: number }        // sin cambios
  export interface DesgloseIva { tramos: TramoIva[]; iva: number; base: number }
  /** Separa el IVA que ya viene dentro de los importes; reparte el descuento entre tarifas. */
  export function separarIvaIncluido(lineas: { importe: number; ivaPct?: number }[], descuento: number): DesgloseIva;
  export function etiquetaTramoIva(tramo: Pick<TramoIva, "ivaPct">): string;     // sin cambios
  export function leerDesgloseGuardado(valor: unknown): TramoIva[];               // sin cambios
  // totales (mismas firmas): CotizacionTotales y FacturaTotales con total = subtotal − descuento
  // src/lib/mostrador/ventas.ts
  export function totalDevolucion(lineas: { cantidad: number; precioUnitario: number }[], venta: { subtotal: number; descuento: number }): number;
  ```

- [ ] **Step 1: Tests que fallan** en `desglose.test.ts` (reemplazar el `describe("desglosarIva")`):

```ts
describe("separarIvaIncluido", () => {
  it("con una tarifa separa base e IVA del total", () => {
    expect(separarIvaIncluido([{ importe: 119_000, ivaPct: 19 }], 0)).toEqual({
      tramos: [{ ivaPct: 19, base: 100_000, iva: 19_000 }],
      iva: 19_000,
      base: 100_000,
    });
  });

  it("reparte el descuento entre tarifas y la suma de base + IVA es exactamente subtotal − descuento", () => {
    const r = separarIvaIncluido(
      [
        { importe: 119_000, ivaPct: 19 },
        { importe: 105_000, ivaPct: 5 },
        { importe: 50_000, ivaPct: 0 },
      ],
      27_400,
    );
    expect(r.tramos.map((t) => t.ivaPct)).toEqual([19, 5, 0]);
    const suma = r.tramos.reduce((s, t) => s + t.base + t.iva, 0);
    expect(suma).toBeCloseTo(274_000 - 27_400, 2);
    expect(r.tramos[2]).toEqual({ ivaPct: 0, base: 45_000, iva: 0 });
  });

  it("sin tarifa usa 19 %, omite tramos sin valor y limita el descuento", () => {
    expect(separarIvaIncluido([{ importe: 11_900 }, { importe: 0, ivaPct: 5 }], 0).tramos).toEqual([
      { ivaPct: 19, base: 10_000, iva: 1_900 },
    ]);
    expect(separarIvaIncluido([{ importe: 1_000, ivaPct: 19 }], 5_000)).toEqual({ tramos: [], iva: 0, base: 0 });
    expect(separarIvaIncluido([], 0)).toEqual({ tramos: [], iva: 0, base: 0 });
  });
});
```

  En `cotizacion/totales.test.ts` y `factura/totales.test.ts` cambiar las expectativas a la regla nueva, p. ej.:

```ts
// cotización: 2×50.000 repuesto + 100.000 mano de obra, 10 % de descuento
expect(computeCotizacionTotales({ items, descuentoPct: 10 })).toEqual({
  subtotalRepuestos: 100_000, subtotalManoObra: 100_000, subtotal: 200_000, descuento: 20_000,
  iva: 28_739.5, desgloseIva: [{ ivaPct: 19, base: 151_260.5, iva: 28_739.5 }], total: 180_000,
});
```

  (`151_260.5 = roundMoney(180_000 / 1.19)`; ajustar los demás casos con la misma regla: `total = subtotal − descuento`). En `ventas.test.ts`, `totalDevolucion([{ cantidad: 1, precioUnitario: 100000 }], { subtotal: 200000, descuento: 50000 })` → `75000`.

- [ ] **Step 2:** `npx vitest run src/lib/iva src/lib/cotizacion/totales.test.ts src/lib/factura src/lib/mostrador/ventas.test.ts` → FAIL.
- [ ] **Step 3: Implementar** en `desglose.ts` (borrar `desglosarIva`):

```ts
export interface DesgloseIva {
  tramos: TramoIva[];
  iva: number;
  /** Suma de las bases (lo que queda sin IVA). */
  base: number;
}

/**
 * Los precios ya traen el IVA. Agrupa por tarifa, reparte el descuento entre
 * tarifas en proporción a su peso (la última se queda con el residuo, así
 * base + IVA suma exactamente subtotal − descuento) y separa en cada tramo
 * la base y el IVA que lleva dentro.
 */
export function separarIvaIncluido(lineas: { importe: number; ivaPct?: number }[], descuento: number): DesgloseIva {
  const brutas = new Map<number, number>();
  for (const linea of lineas) {
    const pct = linea.ivaPct ?? IVA_PREDETERMINADO_RESPALDO;
    brutas.set(pct, (brutas.get(pct) ?? 0) + linea.importe);
  }
  const ordenadas = [...brutas.entries()]
    .map(([ivaPct, bruta]) => ({ ivaPct, bruta: roundMoney(bruta) }))
    .filter((t) => t.bruta > 0)
    .sort((a, b) => b.ivaPct - a.ivaPct);

  const subtotal = roundMoney(ordenadas.reduce((suma, t) => suma + t.bruta, 0));
  const descuentoReal = roundMoney(Math.min(Math.max(descuento, 0), subtotal));
  const totalNeto = roundMoney(subtotal - descuentoReal);

  const tramos: TramoIva[] = [];
  let repartido = 0;
  ordenadas.forEach((t, i) => {
    const total =
      i === ordenadas.length - 1
        ? roundMoney(totalNeto - repartido)
        : roundMoney(t.bruta - (subtotal > 0 ? (descuentoReal * t.bruta) / subtotal : 0));
    repartido = roundMoney(repartido + total);
    if (total <= 0) return;
    const base = roundMoney(total / (1 + t.ivaPct / 100));
    tramos.push({ ivaPct: t.ivaPct, base, iva: roundMoney(total - base) });
  });

  return {
    tramos,
    iva: roundMoney(tramos.reduce((suma, t) => suma + t.iva, 0)),
    base: roundMoney(tramos.reduce((suma, t) => suma + t.base, 0)),
  };
}
```

  `computeCotizacionTotales`: `const { tramos, iva } = separarIvaIncluido(…, descuento); const total = roundMoney(subtotal - descuento);`
  `computeFacturaTotales`: igual (`total = roundMoney(subtotal - descuento)`).
  `totalDevolucion`:

```ts
export function totalDevolucion(
  lineas: { cantidad: number; precioUnitario: number }[],
  venta: { subtotal: number; descuento: number },
): number {
  if (venta.subtotal <= 0) return 0;
  const factor = 1 - Math.min(Math.max(venta.descuento, 0), venta.subtotal) / venta.subtotal;
  return roundMoney(lineas.reduce((suma, linea) => suma + linea.cantidad * linea.precioUnitario, 0) * factor);
}
```

  Reemplazar cada `desglosarIva(` por `separarIvaIncluido(` en los usos (página de la cotización, impresión, envío por correo); quitar `ivaPct` de las llamadas a `totalDevolucion` (acción, formulario y `scripts/datos-semana/mostrador.ts`).
- [ ] **Step 4:** `npx tsc --noEmit`; `npx vitest run src/lib src/app/actions "src/app/(dashboard)/mostrador" "src/app/(dashboard)/cotizaciones" "src/app/(dashboard)/ordenes"` → corregir **solo expectativas de totales** que cambian por la regla (en cada una, comprobar a mano que el número nuevo = subtotal − descuento). PASS.
- [ ] **Step 5: Commit** `ajustes-hector3-task 1: cálculo con IVA incluido` + push.

---

### Task 2: Captura sin repuestos libres y con bote de basura

**Files:**
- Modify: `src/components/conceptos/buscador-conceptos.tsx`, `src/components/conceptos/tabla-conceptos.tsx`, `src/app/(dashboard)/cotizaciones/[id]/tabla-conceptos.tsx`, `src/app/(dashboard)/cotizaciones/[id]/page.tsx`, `src/app/(dashboard)/ordenes/[id]/conceptos-orden.tsx`, `src/app/actions/cotizacion-items-actions.ts`, `src/app/actions/conceptos-orden-actions.ts`, `src/lib/validation/cotizacion.ts`, `src/lib/validation/orden.ts`, `src/app/(dashboard)/repuestos/nuevo-repuesto-dialog.tsx`, `src/app/(dashboard)/repuestos/nuevo-repuesto-form.tsx`, `src/lib/cotizacion/tipo-sugerido-libre.ts` (si queda sin uso, borrar con su test)
- Test: `src/app/(dashboard)/cotizaciones/[id]/tabla-conceptos.test.tsx`, `src/app/actions/cotizacion-items-actions.test.ts`, `src/app/actions/conceptos-orden-actions.test.ts`, `src/app/(dashboard)/ordenes/[id]/conceptos-orden.test.tsx`, `src/components/conceptos/tabla-conceptos.test.tsx` (nuevo)

**Interfaces:**
- Produces:
  ```ts
  // buscador: SeleccionBuscador libre solo { clase: "libre"; tipo: "MANO_OBRA"; descripcion }
  // tabla compartida: CambiosConcepto sin `tipo`; AdaptadorConceptos.agregarLibre(input: { descripcion: string })
  // NuevoRepuestoDialog/NuevoRepuestoForm: prop opcional `nombreInicial?: string`
  // cotización: TablaConceptos({ cotizacionId, conceptos, puedeEditar, crearRepuesto }) con crearRepuesto igual que la orden
  ```
  Se borra `cambiarTipoConceptoOrdenAction` (y sus tests).

- [ ] **Step 1: Tests que fallan:**
  - `cotizacion-items-actions.test.ts`: `agregarItemLibreCotizacionAction("q1", { tipo: "REPUESTO", descripcion: "Bujía" })` → `error` "Lo que no está en el inventario solo se agrega como mano de obra" y no crea; el caso actual de libre pasa a `tipo: "MANO_OBRA"`.
  - `conceptos-orden-actions.test.ts`: lo mismo con `agregarLibreAOrdenAction`; borrar los `describe` de cambiar tipo.
  - `components/conceptos/tabla-conceptos.test.tsx` (nuevo; mocks como en el test de la orden):

```tsx
it("quitar una línea es un bote de basura rojo", () => {
  render(<TablaConceptos adaptador={adaptadorVacio} conceptos={[concepto()]} puedeEditar puedeQuitar textoVacio="" />);
  const boton = screen.getByRole("button", { name: "Quitar Filtro" });
  expect(boton.querySelector("svg.lucide-trash-2")).not.toBeNull();
  expect(boton).toHaveClass("text-destructive");
});

it("el buscador no ofrece agregar un repuesto escrito a mano", async () => {
  render(<TablaConceptos adaptador={adaptadorVacio} conceptos={[]} puedeEditar puedeQuitar textoVacio="" />);
  await userEvent.type(screen.getByRole("combobox", { name: "Agregar repuesto, servicio o kit" }), "Bujía rara");
  expect(await screen.findByText(/como mano de obra/)).toBeInTheDocument();
  expect(screen.queryByText(/como repuesto/)).not.toBeInTheDocument();
});

it("no muestra el botón para cambiar entre repuesto y mano de obra", () => {
  render(<TablaConceptos adaptador={adaptadorVacio} conceptos={[concepto({ repuestoId: null })]} puedeEditar puedeQuitar textoVacio="" />);
  expect(screen.queryByTitle("Cambiar entre repuesto y mano de obra")).not.toBeInTheDocument();
});
```

- [ ] **Step 2:** correr esos archivos → FAIL.
- [ ] **Step 3: Implementar.**
  - `libreOrdenInputSchema` y `itemLibreCotizacionInputSchema`: `tipo: z.literal("MANO_OBRA", { error: "Lo que no está en el inventario solo se agrega como mano de obra" })`. La edición de la cotización deja de aceptar `tipo` (`actualizarItemCotizacionInputSchema` sin `tipo`).
  - Buscador: `opcionesLibres` devuelve solo la de mano de obra; quitar `tipoSugeridoLibre` del buscador.
  - Tabla compartida: quitar el `<button>` ⇄ (el tipo se muestra siempre como `<span>`); `CambiosConcepto` sin `tipo`; en "Quitar" pasar a `QuitarConConfirmacion` un `icono={Trash2}` y `className="text-destructive hover:text-destructive"` (agregar esas props opcionales a `src/components/quitar-con-confirmacion.tsx` con `X` como icono por defecto, sin cambiar otros usos). `crearRepuesto?.(descripcion)` ya pasa el texto buscado.
  - Orden: `actualizar` del adaptador llama siempre a `actualizarConceptoOrdenAction`; borrar `cambiarTipoConceptoOrdenAction`. `NuevoRepuestoDialog` recibe `nombreInicial={descripcionACrear}` (guardar el texto en estado al abrir).
  - `NuevoRepuestoForm`: `defaultValues.nombre = nombreInicial ?? ""`.
  - Cotización: la envoltura recibe `crearRepuesto: { bodegas; proveedores; verCostos } | null` y monta el mismo diálogo; al crear llama `agregarRepuestoACotizacionAction`. La página pasa `crearRepuesto` si `puede(session, "inventario.editar")` (cargar `listBodegas()` y `listProveedores()` solo en ese caso).
- [ ] **Step 4:** `npx tsc --noEmit`; `npx vitest run src/components/conceptos "src/app/(dashboard)/cotizaciones" "src/app/(dashboard)/ordenes/[id]" src/app/actions/cotizacion-items-actions.test.ts src/app/actions/conceptos-orden-actions.test.ts "src/app/(dashboard)/repuestos" src/lib/validation` → PASS.
- [ ] **Step 5: Commit** `ajustes-hector3-task 2: captura sin repuestos libres, crear en el inventario y bote de basura` + push.

---

### Task 3: Cotización y orden sin IVA visible

**Files:**
- Modify: `src/components/conceptos/tabla-conceptos.tsx` (prop `mostrarIva`), `src/components/resumen-economico.tsx`, `src/app/(dashboard)/cotizaciones/[id]/resumen-cotizacion.tsx`, `src/app/(dashboard)/cotizaciones/[id]/page.tsx`, `src/app/cotizaciones/[id]/imprimir/page.tsx`, `src/lib/cotizacion/plantilla-envio.ts`, `src/app/actions/cotizacion-actions.ts`, `src/app/(dashboard)/cotizaciones/[id]/enviar-cotizacion-form.tsx`, `src/app/(dashboard)/ordenes/[id]/cuenta-orden.tsx`, `src/app/(dashboard)/ordenes/[id]/page.tsx`
- Test: `cuenta-orden.test.tsx`, `tabla-conceptos.test.tsx` (cotización), `plantilla-envio.test.ts`, `enviar-cotizacion-form.test.tsx`

**Interfaces:**
- Produces: `TablaConceptos` prop `mostrarIva?: boolean` (por defecto `false`); `ResumenEconomico` prop `modoIva: "incluido" | "desglose"`; `CuentaOrden` props sin `desgloseIva` (la orden ya no muestra IVA).

- [ ] **Step 1: Tests que fallan:**
  - Tabla de la cotización: no hay `columnheader` "IVA".
  - `cuenta-orden.test.tsx`: muestra "Total (IVA incluido)" con el total y ninguna fila "IVA 19 %".
  - `plantilla-envio.test.ts`: el texto contiene "Precios con IVA incluido" y no contiene "IVA 19 %".
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3: Implementar.**
  - Tabla compartida: con `mostrarIva` falso no renderiza `<col>`, `<th>` ni `<td>` del IVA (ajustar `colSpan`).
  - `ResumenEconomico`: con `modoIva="incluido"` muestra Subtotal, Descuento y Total con la nota "IVA incluido", sin filas de IVA; `"desglose"` (Mostrador) muestra "Incluye IVA X % sobre $ base … $ iva" en gris bajo el total.
  - Cotización: `ResumenCotizacion` sin `desgloseIva`; la página deja de calcular el desglose.
  - Impresión: sin columna IVA ni filas de IVA; bajo el total "Precios con IVA incluido".
  - Correo y WhatsApp: `filasIva` se reemplaza por la línea "Precios con IVA incluido."; `desgloseIva` sale de `DatosMensajeCotizacion` y del resumen del formulario de envío.
  - Cuenta de la orden: Repuestos, Mano de obra, Descuento (si hay factura), **Total (IVA incluido)**, Anticipos, Saldo. La página ya no calcula `desgloseIva` para la cuenta (total = factura.total si hay factura; si no, subtotal).
- [ ] **Step 4:** `npx tsc --noEmit`; `npx vitest run "src/app/(dashboard)/cotizaciones" "src/app/(dashboard)/ordenes" src/lib/cotizacion src/components` → PASS.
- [ ] **Step 5: Commit** `ajustes-hector3-task 3: cotización y orden con precios con IVA incluido, sin IVA visible` + push.

---

### Task 4: Factura con revisión de tarifas

**Files:**
- Modify: `src/lib/validation/factura.ts`, `src/app/actions/factura-actions.ts`, `src/app/(dashboard)/ordenes/[id]/generar-factura-form.tsx`, `src/app/(dashboard)/ordenes/[id]/cuenta-orden.tsx`, `src/app/(dashboard)/ordenes/[id]/page.tsx`, `src/app/(dashboard)/facturas/[id]/page.tsx`
- Test: `src/app/actions/factura-actions.test.ts`, `src/app/(dashboard)/ordenes/[id]/generar-factura-form.test.tsx`

**Interfaces:**
- Consumes: `separarIvaIncluido` (Task 1), `resolverIvaPct`, `leerIdConceptoOrden` (`src/lib/orden/conceptos-orden.ts`), `SelectorIva`.
- Produces:
  ```ts
  // src/lib/validation/factura.ts
  export const tarifasFacturaSchema = z.array(z.object({ conceptoId: z.string().min(1), ivaPct: z.number().min(0).max(100) }));
  // crearFacturaAction lee formData "tarifas" (JSON) además de "descuento"
  // GenerarFacturaForm({ ordenId, lineas: { conceptoId: string; descripcion: string; importe: number; ivaPct: number }[] })
  ```

- [ ] **Step 1: Tests que fallan** (`factura-actions.test.ts`):

```ts
it("guarda la tarifa elegida en cada línea antes de emitir", async () => {
  const formData = new FormData();
  formData.set("tarifas", JSON.stringify([{ conceptoId: "item:i1", ivaPct: 0 }]));
  await crearFacturaAction("o1", initialState, formData);
  expect(mockItemOrdenUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { ivaPct: 0 } });
});

it("rechaza una tarifa que no está activa y no emite", async () => {
  const formData = new FormData();
  formData.set("tarifas", JSON.stringify([{ conceptoId: "item:i1", ivaPct: 7 }]));
  const r = await crearFacturaAction("o1", initialState, formData);
  expect(r.error).toMatch(/no está activa/);
  expect(mockFacturaCreate).not.toHaveBeenCalled();
});
```

  y la expectativa de la factura creada con la regla nueva (`total = subtotal − descuento`, `desgloseIva` separado del total). En `generar-factura-form.test.tsx`: muestra cada línea con su selector "IVA de <descripción>" y al confirmar envía `tarifas`.
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3: Implementar.**
  - Acción: tras validar la orden, parsear `tarifas` (JSON vacío = `[]`); para cada una, `leerIdConceptoOrden`, comprobar que la línea es de la orden y `resolverIvaPct(tenantDb, ivaPct, actual)`; dentro de la transacción de emisión, actualizar `ivaPct` de cada línea (`itemOrden.update` / `manoDeObra.update`) y luego emitir con los valores nuevos (volver a leer las líneas o aplicar los cambios en memoria antes de `emitirFacturaEnTransaccion`).
  - Formulario: debajo del descuento, la lista de líneas (descripción, importe, `SelectorIva` compacto con la tarifa actual); las tarifas viajan como `tarifas` en el FormData. `CuentaOrden` recibe `lineas` y se las pasa; la página las arma desde `conceptosDesdeOrden`.
  - Página de la factura: columna "Precio (IVA incl.)" y "IVA"; liquidación: Subtotal, Descuento, por tramo "Base X % … / IVA X % …" y **Total**. Facturas viejas: su `desgloseIva` guardado se muestra igual.
- [ ] **Step 4:** `npx tsc --noEmit`; `npx vitest run src/app/actions/factura-actions.test.ts "src/app/(dashboard)/ordenes" "src/app/(dashboard)/facturas" src/lib/factura` → PASS.
- [ ] **Step 5: Commit** `ajustes-hector3-task 4: factura con revisión de tarifas y separación del IVA` + push.

---

### Task 5: Mostrador con IVA incluido

**Files:**
- Modify: `src/app/(dashboard)/mostrador/vender-mostrador.tsx`, `src/lib/mostrador/comprobante.ts`, `src/app/mostrador/[id]/comprobante/page.tsx`, `src/app/(dashboard)/mostrador/devolucion-form.tsx`, `src/app/actions/devolucion-mostrador-actions.ts`
- Test: `vender-mostrador.test.tsx`, `src/lib/mostrador/comprobante.test.ts`, `devolucion-form.test.tsx`, `devolucion-mostrador-actions.test.ts`

- [ ] **Step 1: Tests que fallan:**
  - `vender-mostrador.test.tsx`: con un filtro de $100.000 y 5 % de descuento, `total-resumen` = $95.000 y se ve "Incluye IVA".
  - `comprobante.test.ts`: el texto dice "Incluye IVA 19 % sobre $ …" y el total es la suma menos el descuento.
  - Devolución: devolver una línea de $100.000 de una venta de $200.000 con $50.000 de descuento → $75.000.
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3: Implementar.** `ResumenEconomico modoIva="desglose"`; comprobante: en lugar de "IVA: …" la línea "Incluye IVA X % sobre $ base: $ iva" por tramo; página del comprobante igual. Devolución: llamadas a `totalDevolucion` sin `ivaPct` (ya cambiado en Task 1; aquí solo la vista).
- [ ] **Step 4:** `npx tsc --noEmit`; `npx vitest run "src/app/(dashboard)/mostrador" src/lib/mostrador src/app/actions/venta-mostrador-actions.test.ts src/app/actions/devolucion-mostrador-actions.test.ts src/app/mostrador` → PASS.
- [ ] **Step 5: Commit** `ajustes-hector3-task 5: Mostrador con precios con IVA incluido` + push.

---

### Task 6: Migración de datos y recálculo (sin aplicar)

**Files:**
- Create: `prisma/tenant/migrations/20261108120000_iva_incluido/migration.sql`, `scripts/iva-incluido/recalcular-cotizaciones.ts`

- [ ] **Step 1:** `migration.sql`:

```sql
-- Tanda 3: los precios pasan a ser con IVA incluido. Se suben con su IVA
-- el catálogo y las líneas de documentos abiertos; lo cerrado no se toca.
UPDATE "repuestos" SET "precio_venta" = ROUND("precio_venta" * (1 + "iva_pct" / 100));
UPDATE "servicios" SET "precio_mano_obra" = ROUND("precio_mano_obra" * (1 + "iva_pct" / 100));

UPDATE "items_cotizacion" ic SET "precio_unitario" = ROUND(ic."precio_unitario" * (1 + ic."iva_pct" / 100))
FROM "cotizaciones" c
WHERE c."id" = ic."cotizacion_id" AND c."estado" IN ('BORRADOR', 'ENVIADA');

UPDATE "items_orden" io SET "precio_unitario" = ROUND(io."precio_unitario" * (1 + io."iva_pct" / 100))
FROM "ordenes_trabajo" o
WHERE o."id" = io."orden_id" AND o."estado" <> 'ANULADA'
  AND NOT EXISTS (SELECT 1 FROM "facturas" f WHERE f."orden_id" = o."id");

UPDATE "mano_de_obra" mo SET "valor" = ROUND(mo."valor" * (1 + mo."iva_pct" / 100))
FROM "ordenes_trabajo" o
WHERE o."id" = mo."orden_id" AND o."estado" <> 'ANULADA'
  AND NOT EXISTS (SELECT 1 FROM "facturas" f WHERE f."orden_id" = o."id");
```

  (Confirmar los nombres de tabla con `@@map` en `prisma/tenant/schema.prisma` antes de guardar.)
- [ ] **Step 2:** `scripts/iva-incluido/recalcular-cotizaciones.ts`: abre el cliente del tenant con `TENANT_DATABASE_URL`, busca las cotizaciones en `BORRADOR`/`ENVIADA` y, para cada una, `await db.$transaction((tx) => recomputeCotizacionTotales(tx, id))`; imprime cuántas recalculó.
- [ ] **Step 3:** `npx prisma migrate diff --from-schema-datasource … --to-schema-datamodel …` contra `taller_dev_reference` debe seguir vacío (la migración solo cambia datos). Commit `ajustes-hector3-task 6: migración de precios con IVA incluido` + push. **No aplicar todavía.**

---

### Task 7: Verificación, prueba en el navegador y cierre

- [ ] **Step 1:** `npx tsc --noEmit` y `npx vitest run` completos (en segundo plano) → verde; `npm run build` → OK.
- [ ] **Step 2:** Pedir permiso al usuario para aplicar la migración en `taller_dev_reference` y luego en `taller_dev`, **avisando que hay que desplegar enseguida** (producción compartiría la base con el código viejo). Aplicar, correr `npx tsx --env-file=.env scripts/iva-incluido/recalcular-cotizaciones.ts` con `schema=taller_dev`, y reportar los conteos.
- [ ] **Step 3:** Navegador (datos ficticios): cotización nueva con kit y mano de obra libre (sin columna IVA, total con IVA incluido, intentar un repuesto escrito a mano → solo "como mano de obra" / "Crear en el inventario" con nombre prellenado, quitar con bote rojo) → aprobar → orden (Cuenta "Total (IVA incluido)") → terminar → generar factura cambiando una tarifa → la factura separa base e IVA y el total no sube. Mostrador: venta con dos tarifas y descuento, comprobante "Incluye IVA", devolución.
- [ ] **Step 4:** Merge `--no-ff` a `main`, push, pasos de despliegue (pull, install, build, revisar `BUILD_ID`, restart) y actualizar la memoria.
