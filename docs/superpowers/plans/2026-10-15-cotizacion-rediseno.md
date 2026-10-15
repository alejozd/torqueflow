# Plan — Rediseño de la ficha de cotización

Diseño: `docs/superpowers/specs/2026-10-15-cotizacion-rediseno-design.md`
Rama: `cotizacion-rediseno`. Commits: `cotizacion-task N: ...`.

## Task 1 — Esquema y totales
- `ItemCotizacion`, `ItemOrden`, `ManoDeObra`: `grupoKitId String?`, `grupoKitNombre String?`,
  `servicioId String?` (FK a `Servicio`, `onDelete: SetNull`, con índice).
- `Cotizacion`: enum `TipoDescuento { PORCENTAJE MONTO }`, `descuentoTipo` (default PORCENTAJE),
  `descuentoMonto Decimal @default(0)`.
- Migración de tenant. `computeCotizacionTotales` acepta tipo y monto (monto limitado al subtotal) + tests.

## Task 2 — Actions de ítems
- `aplicarServicioACotizacionAction` y `aplicarServicioAOrdenAction` llenan el grupo (D2/D3).
- `agregarItemCotizacionAction` desde el buscador: repuesto (fusiona si ya existe suelto, D7) o ítem libre.
- `actualizarItemCotizacionAction` (cantidad, precio, descripción/tipo en libres) con guarda de mutabilidad.
- `eliminarGrupoKitCotizacionAction`.
- Descuento: action acepta tipo + valor.
- `aprobarCotizacionAction` copia el grupo a `ItemOrden`/`ManoDeObra`.
- Tests de cada action.

## Task 3 — Búsqueda del buscador
- Server action `buscarParaCotizacion(q)`: kits/servicios activos de la sede, repuestos con precio y
  `stockActual`, límite por sección. Tests.

## Task 4 — Tabla editable
- Componente cliente: filas, grupos de kit plegables, celdas editables con guardado automático,
  marca de precio modificado, disponibilidad (D9), quitar con confirmación, contador, solo lectura (D13).
- Línea de captura con el buscador y el flujo de teclado. Tests.

## Task 5 — Cabecera, resumen y decisión
- Cabecera con placa (reusar estilo de `cabecera-orden.tsx`), chips de estado/vencimiento.
- Resumen económico con selector %/$; tarjeta de decisión; envío reubicado.
- Retirar los formularios viejos (`agregar-item-cotizacion-form`, `aplicar-servicio-cotizacion-form`) y sus tests.

## Task 6 — PDF
- Kits como título + desglose; descuento muestra % o monto.

## Task 7 — Orden agrupa kits
- Pestaña Trabajo de la orden muestra los kits agrupados (mismo patrón visual).

## Task 8 — Traspaso
- Nota en `docs/TRASPASO-AGENTES.md`; recordatorio de migraciones de tenant al desplegar.
