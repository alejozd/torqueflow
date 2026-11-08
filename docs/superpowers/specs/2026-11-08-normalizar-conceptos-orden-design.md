# Normalizar la captura de conceptos de la orden — diseño

Rama: `normalizar-orden` desde `main`. Pedido del usuario (tanda de Héctor): agregar repuestos y mano de obra
en la orden igual que en la cotización.

## Problema

Hoy cada documento captura distinto:

- **Cotización:** un buscador destacado (repuesto, servicio/kit o línea libre con Enter) y una tabla única editable
  en la celda (cantidad, precio, IVA; descripción y tipo en las libres), con kits agrupados.
- **Orden:** bloque "Agregar al trabajo" con tres formularios separados (Aplicar servicio, + Repuesto, + Mano de obra)
  y dos tablas (Repuestos, Mano de obra) que solo permiten cambiar el IVA y quitar.

La orden es donde más se agrega mientras se trabaja; debe funcionar como la cotización.

## Decisiones

- **Una sola tabla** en la orden, como la cotización: repuestos y mano de obra mezclados, kits agrupados,
  edición en la celda. La mano de obra muestra su mecánico en la misma fila.
- **Enfoque A:** un componente de tabla compartido por cotización y orden, parametrizado por un adaptador de acciones.
  En la base la orden conserva `items_orden` y `mano_de_obra` (garantías, reportes, comisiones y factura dependen de ellas).
- **Cambio de tipo de una línea libre** también en la orden: mueve la línea entre las dos tablas en una transacción.
- **Sin cambios:** factura (documento cerrado) y Mostrador (flujo propio de lector de códigos).
- **Sin migraciones.**

## Estructura

### Componente compartido

`src/components/conceptos/tabla-conceptos.tsx` (extraído de `cotizaciones/[id]/tabla-conceptos.tsx`):
buscador destacado arriba, kits agrupados y desplegables, celdas editables (`CeldaEditable`), columna IVA
(`SelectorIva` compacto), volver al precio de catálogo (↺), existencia en bodega, confirmación al quitar, foco y teclado.

No importa acciones de ningún documento. Recibe:

```ts
interface AdaptadorConceptos {
  agregarRepuesto(repuestoId: string): Promise<ResultadoConcepto>;
  agregarLibre(input: { tipo: "REPUESTO" | "MANO_OBRA"; descripcion: string }): Promise<ResultadoConcepto>;
  aplicarServicio(servicioId: string): Promise<ResultadoServicio>;
  actualizar(concepto: ConceptoVista, cambios: CambiosConcepto): Promise<ResultadoConcepto>;
  quitar(concepto: ConceptoVista): Promise<ResultadoAccion>;
  quitarKit(grupoKitId: string): Promise<ResultadoAccion>;
}
```

`CambiosConcepto` = `{ cantidad?, precioUnitario?, ivaPct?, descripcion?, tipo?, mecanicoId? }` (un campo por vez).
Props adicionales: `puedeEditar`, `puedeQuitar`, `cantidadEntera`, y un render opcional por fila
(`detalleFila(concepto)`) que la orden usa para el selector de mecánico.

El buscador (`cotizaciones/[id]/buscador-conceptos.tsx`) pasa a `components/conceptos/` sin cambios de comportamiento.

### Tipo común

`ConceptoVista` y `agruparConceptos`/`contarConceptos`/`importeConcepto` pasan de `src/lib/cotizacion/agrupar-conceptos.ts`
a `src/lib/conceptos/` (la cotización reexporta o actualiza sus imports). Campos nuevos:

- `editableCantidad: boolean` — falso en la mano de obra de la orden.
- `mecanico?: { id: string; nombre: string } | null` — solo en la mano de obra de la orden.

### Cotización

`cotizaciones/[id]/tabla-conceptos.tsx` queda como envoltura (~40 líneas) que arma el adaptador con sus acciones actuales
(`cotizacion-items-actions`, `aplicarServicioACotizacionAction`, `eliminarItemCotizacionFormAction`).
Comportamiento idéntico: sus tests actuales deben pasar sin cambios de expectativa (solo de imports si hace falta).

### Orden

- `src/lib/orden/conceptos-orden.ts`: `conceptosDesdeOrden(items, manoDeObra)` → `ConceptoVista[]` ordenado por `createdAt`.
  Repuesto: `cantidad` entera, `precioCatalogo`/`stockActual` del repuesto. Mano de obra: `cantidad` 1, `precioUnitario` = `valor`,
  `editableCantidad: false`, `mecanico`. Los `id` se prefijan por tabla (`item:<id>`, `mo:<id>`) para que no choquen.
- `src/app/actions/conceptos-orden-actions.ts` (responden con datos, nunca lanzan, como las de la cotización):
  - `agregarRepuestoAOrdenAction(ordenId, repuestoId)` — precio e IVA del catálogo; si el repuesto ya está suelto, suma 1.
  - `agregarLibreAOrdenAction(ordenId, { tipo, descripcion })` — precio 0, IVA predeterminado; la mano de obra toma el mecánico de la orden (si sigue en la sede).
  - `actualizarConceptoOrdenAction(ordenId, conceptoId, cambios)` — cantidad (entera, solo repuestos), precio/valor, IVA (tarifa activa), descripción (solo libres), mecánico (solo mano de obra, técnico de la sede).
  - `cambiarTipoConceptoOrdenAction(ordenId, conceptoId)` — solo libres: borra en una tabla y crea en la otra en una transacción, conservando descripción, precio×cantidad, IVA, kit y fecha; al pasar a mano de obra toma el mecánico de la orden.
  - `quitarKitOrdenAction(ordenId, grupoKitId)` — borra las líneas del kit en las dos tablas.
  - Se reutilizan `aplicarServicioAOrdenAction`, `deleteItemOrdenFormAction`, `deleteManoDeObraFormAction`.
  - Permisos: agregar/editar/cambiar tipo con `ordenes.trabajar`; quitar con `ordenes.quitar`. Todas comprueban la sede y `assertOrdenMutable`.
- `cambiarIvaLineaOrdenAction` queda absorbida por `actualizarConceptoOrdenAction` (se retira junto con `iva-linea-orden.tsx`).

### Pantalla de la orden (pestaña Trabajo)

Se mantienen las tres cifras (Repuestos, Mano de obra, Total del trabajo). Debajo, la tarjeta **Conceptos** con el buscador y la tabla única.
Se retiran: `agregar-al-trabajo.tsx`, `agregar-item-form.tsx`, `agregar-mano-obra-form.tsx`, `aplicar-servicio-form.tsx`
(y sus tests), las dos tablas de Repuestos/Mano de obra y la tarjeta "Kits aplicados" (la tabla ya agrupa).
La tarjeta Cuenta no cambia.

- Mano de obra: "Mecánico: Carlos ▾" bajo la descripción, selector con los técnicos de la sede.
- Cantidad: entera en repuestos; "—" en mano de obra (la celda de precio edita el valor).
- Solo lectura con la orden facturada, entregada o anulada (`esOrdenMutable`) o sin `ordenes.trabajar`; sin `ordenes.quitar` no aparece la ✕.

## Errores

Las acciones devuelven `{ error }` con mensajes en español (orden no encontrada o no modificable, tarifa inactiva,
técnico fuera de la sede, cantidad no entera, línea que ya no existe). La tabla los muestra con `toast.error` y conserva el valor anterior,
igual que la cotización.

## Pruebas

- Tests actuales de la tabla y de las acciones de la cotización: pasan sin cambios de expectativa.
- `conceptos-orden.test.ts`: conversión de las dos tablas, orden por fecha, ids prefijados, mano de obra no editable en cantidad.
- `conceptos-orden-actions.test.ts`: permisos, orden bloqueada, fusión del repuesto suelto, IVA del catálogo y predeterminado,
  cantidad entera, mecánico de otra sede rechazado, cambio de tipo en una transacción, quitar kit en las dos tablas.
- Test de la tabla compartida con el adaptador de orden: selector de mecánico, "—" en la cantidad de mano de obra.
- `tsc`, suite completa y prueba en el navegador (agregar repuesto, servicio y libre; editar celdas; cambiar tipo y mecánico; quitar kit).

## Fuera de alcance

- Factura y Mostrador.
- Cambiar el modelo de datos de la orden.
- Cantidad en la mano de obra de la orden.
