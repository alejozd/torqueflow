# Tanda 3 (Héctor): precios con IVA incluido, sin repuestos libres y bote de basura — diseño

Rama: `ajustes-hector-3` desde `main`. Pedido de Héctor: quienes manejan el programa escriben en la
cotización el precio final (con IVA); el IVA no se ve ni se captura en cotización ni orden, y solo se
separa al facturar.

## Decisiones (del usuario)

- **IVA incluido:** todo precio que se escribe o se ve es el precio final con IVA. En la factura (y en el
  Mostrador, que cobra) el mismo total se separa en base + IVA; el total no sube.
- **Catálogo:** los precios de venta actuales (antes de IVA) se suben con su IVA en una migración.
- **Mostrador:** también con IVA incluido.
- **Tarifa por línea:** sale del catálogo sin mostrarse en cotización/orden; se puede cambiar al generar la factura.
- **Repuestos libres:** se quitan de la captura. Lo libre queda solo para mano de obra.
- **Mano de obra libre:** queda solo en su documento (sin catálogo).
- **Quitar línea:** bote de basura rojo en lugar de la ✕ negra.

## Regla de cálculo

`src/lib/iva/desglose.ts` gana `separarIvaIncluido(lineas, descuento)`:

- Agrupa por tarifa los importes **con IVA**; reparte el descuento entre tarifas en proporción (la última se
  queda con el residuo, como hoy); por tramo: `total` = bruto − su parte del descuento,
  `base = roundMoney(total / (1 + pct/100))`, `iva = total − base`.
- Devuelve `{ tramos: TramoIva[] (ivaPct, base, iva), iva, base }`; la suma de `base + iva` de los tramos es
  exactamente `subtotal − descuento`.
- `TramoIva` no cambia de forma, así el desglose guardado en facturas y ventas se sigue leyendo igual.

Totales de cotización (`computeCotizacionTotales`) y de factura/venta (`computeFacturaTotales`):
`subtotal` = suma de importes con IVA, `descuento`, `total = subtotal − descuento`,
`iva` = IVA incluido (informativo), `desgloseIva` = tramos. Ningún total suma IVA encima.

## Cotización y orden

- La tabla compartida pierde la columna IVA (prop `mostrarIva`, falsa en ambas; el Mostrador no usa esta tabla).
- Resumen económico de la cotización: Repuestos, Mano de obra, Subtotal, Descuento y **Total (IVA incluido)**,
  sin filas de IVA. La Cuenta de la orden: Repuestos, Mano de obra, Descuento (si hay factura), **Total (IVA incluido)**,
  Anticipos, Saldo.
- Impresión, correo y WhatsApp de la cotización: sin filas de IVA; nota "Precios con IVA incluido". La columna IVA
  de la impresión se quita.
- Cada línea sigue guardando `ivaPct` (del catálogo; mano de obra libre → tarifa predeterminada). No se edita aquí.
- Al aprobar la cotización, la orden copia precios e `ivaPct` como hoy.

## Factura

- "Generar factura" (orden terminada o entregada) abre un paso de revisión: lista de líneas con su precio y un
  `SelectorIva` por línea (tarifa del catálogo por defecto), más el descuento. "Emitir" envía las tarifas elegidas.
- `crearFacturaAction` acepta `tarifas: { conceptoId: "item:…" | "mo:…", ivaPct }[]`, valida cada una con
  `resolverIvaPct`, las guarda en las líneas de la orden (`ivaPct`) y emite con `emitirFacturaEnTransaccion`
  usando el cálculo con IVA incluido.
- La factura muestra: precio por línea (con IVA) y su tarifa; Subtotal, Descuento, por tarifa "Base … / IVA …",
  y Total. El `desgloseIva` guardado tiene la misma forma que hoy.

## Mostrador

- El carrito conserva su selector de IVA por línea (es el momento de cobro). Precios con IVA incluido.
- Resumen y comprobante: Subtotal, Descuento, "Incluye IVA X % sobre base …", Total. `totalEsperado` = total con IVA incluido.
- Devoluciones: `totalDevolucion` = importe de las líneas × (1 − descuento/subtotal), sin sumar IVA.
- "Agregar línea libre" del Mostrador se mantiene (mano de obra/servicio suelto) con la tarifa predeterminada.

## Captura (cotización y orden)

- El buscador ya no ofrece "Agregar «…» como repuesto"; solo "como mano de obra". Si quien busca tiene permiso
  `inventario.editar`, ofrece "Crear «…» en el inventario" (ahora también en la cotización), con el nombre buscado
  prellenado en el diálogo.
- Las acciones `agregarItemLibreCotizacionAction` y `agregarLibreAOrdenAction` rechazan `tipo: "REPUESTO"`.
- Se quita el botón ⇄ (cambiar tipo) y `cambiarTipoConceptoOrdenAction`; la cotización deja de aceptar `tipo` en la edición.
  Las líneas libres de repuesto que ya existan se siguen viendo, editando y quitando.
- Quitar línea y quitar kit: icono `Trash2` en rojo (`text-destructive`), mismo texto de confirmación.

## Migración de datos (tenant)

`20261108120000_iva_incluido` (pedir permiso antes de aplicarla en `taller_dev` y `taller_dev_reference`):

1. `repuestos.precio_venta = round(precio_venta * (1 + iva_pct/100))`.
2. `servicios.precio_mano_obra = round(precio_mano_obra * (1 + iva_pct/100))`.
3. Líneas de documentos abiertos, mismo factor:
   - `items_cotizacion.precio_unitario` de cotizaciones en `BORRADOR` o `ENVIADA`;
   - `items_orden.precio_unitario` y `mano_de_obra.valor` de órdenes sin factura y no `ANULADA`.
4. Los totales guardados de esas cotizaciones (`subtotal`, `descuento`, `iva`, `total`) se recalculan con un script
   de una sola vez, `scripts/iva-incluido/recalcular-cotizaciones.ts`, que llama a `recomputeCotizacionTotales`
   (la misma función de la app) para cada cotización en `BORRADOR` o `ENVIADA`. Así el cálculo no se duplica en SQL.
   El script imprime cuántas recalculó y se corre después de la migración, con permiso.

Documentos cerrados (facturas, ventas del Mostrador, cotizaciones aprobadas/rechazadas/vencidas) no se tocan y se
muestran con sus totales guardados. Limitación aceptada: devolver algo de una venta del Mostrador anterior al cambio
usa la regla nueva (son datos de prueba).

## Pruebas

- `separarIvaIncluido`: una tarifa, varias tarifas con descuento, exento, suma exacta, sin líneas.
- Totales de cotización y factura con la regla nueva (ajustar expectativas: el total ya no sube).
- Acciones: libre `REPUESTO` rechazado; `crearFacturaAction` con tarifas elegidas (válida, inactiva rechazada).
- Componentes: sin columna IVA en la tabla; bote de basura; buscador sin "como repuesto"; paso de revisión de la factura.
- Migración probada en `taller_dev_reference` antes que en `taller_dev`, con conteo de filas afectadas.
- Navegador: cotización → orden → factura con tarifas mixtas y descuento; Mostrador con venta y devolución.

## Fuera de alcance

- DIAN, retenciones.
- Guardar mano de obra libre en el catálogo.
