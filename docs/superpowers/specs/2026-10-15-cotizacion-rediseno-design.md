# Rediseño de la ficha de cotización — diseño

Origen: propuesta de Stitch (`docs/Evidencias/stitch_inventory_alert_dashboard_redesign/`), ajustada
con el usuario el 2026-10-15.

## Decisiones

| # | Decisión |
|---|----------|
| D1 | Los kits dejan de "explotarse" en filas sueltas: cada fila guarda el grupo de kit del que salió. |
| D2 | El grupo se identifica por `grupoKitId` (cuid generado al aplicar) + `grupoKitNombre` (copia del nombre) + `servicioId` opcional. Aplicar el mismo kit dos veces da dos grupos. Renombrar o borrar el servicio no altera cotizaciones viejas. |
| D3 | La orden también recuerda el agrupado: `ItemOrden` y `ManoDeObra` reciben los mismos tres campos; aprobar la cotización los copia, y aplicar un servicio en la orden también los llena. |
| D4 | Descuento por % o por monto fijo en $. `Cotizacion.descuentoTipo` (`PORCENTAJE`/`MONTO`) + `descuentoMonto`. El monto se limita al subtotal. |
| D5 | Agregar ítems desde un único buscador en la última fila de la tabla (kits/servicios, repuestos, ítem libre). Sin formularios aparte ni botón "Agregar". |
| D6 | Celdas editables en el sitio (cantidad, precio; descripción y tipo en ítems libres), guardado automático al salir de la celda o con Enter; Esc deshace. |
| D7 | Repuesto suelto ya presente → se suma 1 a su cantidad en vez de duplicar la fila. Los repuestos dentro de un kit no cuentan para esta fusión. |
| D8 | Quitar una fila o un kit completo pide confirmación (`ConfirmacionEnLinea`). |
| D9 | Disponibilidad por repuesto con `stockActual` de la sede: verde "N en bodega" si alcanza, ámbar "Solo hay N", rojo "Sin existencia". El kit cerrado muestra aviso si a alguna parte le falta. No sale en el PDF. |
| D10 | PDF: cada kit sale con su nombre como título y sus partes debajo; el descuento indica % o monto. |
| D11 | Un solo botón de aprobación, "Aprobar y generar orden de trabajo", en la tarjeta de decisión (ya crea la OT hoy). Sin botón duplicado en la cabecera. |
| D12 | Descartado de Stitch: "Poner en espera", mecánico en la línea de mano de obra, texto de reserva de repuestos, enlace de aprobación interactiva. WhatsApp sigue siendo wa.me. |
| D13 | Cotización no mutable (aprobada/rechazada/vencida): tabla de solo lectura, sin buscador. |

## Pantalla

1. **Cabecera**: placa grande (mismo estilo que la ficha de la orden), vehículo, cliente con
   WhatsApp (wa.me), sede, fecha de creación, motivo. Chips de estado y de vencimiento ("Vence en N días").
   Acciones secundarias: Imprimir/PDF.
2. **Conceptos cotizados** (columna principal): tabla sin paginación. Columnas: Tipo · Descripción
   (código debajo) · Disponibilidad · Cant. · Precio unit. · Importe · quitar.
   - Kit: fila de grupo plegable con nombre, nº de conceptos, subtotal y aviso de existencia.
   - Última fila: buscador. Resultados por sección; Enter/clic agrega con cantidad 1 y precio de
     catálogo y lleva el foco a la cantidad; Tab → precio; Enter → vuelve al buscador.
   - Precio distinto del catálogo: marca "precio modificado" con botón para volver al de catálogo.
   - Pie: contador "N conceptos · X repuestos · Y mano de obra".
3. **Resumen económico** (columna lateral): repuestos, mano de obra, subtotal, descuento con
   selector %/$, IVA 19 %, total destacado.
4. **Decisión del cliente**: "Aprobar y generar orden de trabajo" (primario), "Marcar rechazada".
5. **Enviar**: WhatsApp (wa.me), correo, copiar texto — lo que ya existe, reubicado.
6. **Historial de seguimiento**: sin cambios funcionales.

En tablet: una columna, botones − / + en la cantidad, objetivos táctiles grandes.

## Fuera de alcance

Pedido de compra desde la cotización, enlace público de aprobación, facturas con agrupado de kits.

## Despliegue

Requiere migración en todos los esquemas de tenant (campos nuevos en `items_cotizacion`,
`items_orden`, `mano_de_obra`, `cotizaciones`).
