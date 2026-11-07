# Ajustes taller Héctor — tanda 2

Rama: `ajustes-hector-2` desde `main`. Un commit por tarea (`ajustes-hector2-task N: …`),
push inmediato, y al final merge `--no-ff` a `main`. Entre tareas se pregunta antes de seguir.

Pedidos (numeración del usuario): 6 buscador notorio, 7 IVA por línea, 8 desglose de IVA, 9 fotos Ingreso/Salida.

## Decisiones tomadas

- **Buscador (6):** sube encima de la tabla de conceptos, más grande y con borde de color; con la cotización vacía queda con el foco.
- **Alcance del IVA (7–8):** cotización → orden → factura (y Mostrador, que reutiliza el cálculo de la factura).
- **Tarifas:** lista **configurable** por taller (Configuración → Tarifas de IVA). Arranca con 0 % (exento), 5 % y 19 % (predeterminada).
- **IVA inicial de una línea:** el del catálogo (repuesto o servicio; 19 % por defecto) y se puede cambiar en la línea.

## Reglas de diseño

- Cada línea guarda **una copia del porcentaje** (`ivaPct Decimal(5,2)`), no una referencia a la tarifa: cambiar o desactivar una tarifa no altera documentos ya hechos.
- Todo lo existente queda en **19 %** (valor por defecto de las columnas nuevas): ningún total cambia al migrar.
- **Descuento global** (de la cotización o la factura): se reparte entre las bases de cada tarifa en proporción a su peso, y cada base paga su IVA. Con una sola tarifa el resultado es idéntico al de hoy.
- **Desglose:** el resumen muestra una fila por tarifa usada, p. ej. `IVA 19 % sobre $ 500.000 … $ 95.000` y `IVA 5 % sobre $ 80.000 … $ 4.000`; las líneas al 0 % aparecen como "Exento".
- El selector de una línea solo ofrece las tarifas **activas**; si una línea tiene un porcentaje que ya no está activo, se muestra igual y se puede cambiar.

## Tareas

1. **Fotos Ingreso / Salida (9).** En la inspección de la orden, "Antes/Después" pasa a "Ingreso/Salida" (selector, etiqueta de la foto, textos alternativos). Sin cambio de base: el enum sigue ANTES/DESPUES.
2. **Buscador destacado (6).** Buscador encima de la tabla, con borde y ayuda "Escribe nombre o código y Enter"; foco automático si no hay conceptos.
3. **Tarifas de IVA configurables.** Modelo `TarifaIva` (porcentaje único, nombre, activa, predeterminada) + migración con 0/5/19 + página en Configuración (permiso `configuracion.taller`): agregar, renombrar, activar/desactivar, marcar predeterminada. No se puede desactivar la predeterminada.
4. **IVA en el catálogo.** `Repuesto.ivaPct` y `Servicio.ivaPct` (mano de obra del servicio), por defecto la tarifa predeterminada; selector en los formularios de repuesto y servicio. Columna opcional en la importación de Excel de repuestos.
5. **Cotización con IVA por línea (7) y desglose (8).** `ItemCotizacion.ivaPct`; al agregar toma el del catálogo (libre → predeterminada); columna "IVA" después de "Cant." con selector; totales por tarifa; resumen con desglose; impresión y correo con desglose.
6. **Orden.** `ItemOrden.ivaPct` y `ManoDeObra.ivaPct`; se copian al aprobar la cotización; al agregar líneas en la orden se toma del catálogo; se ve y se puede cambiar en la orden.
7. **Factura.** El cálculo usa el IVA de cada línea de la orden; la factura guarda su desglose (para que no cambie si después se edita algo) y la impresión lo muestra.
8. **Mostrador.** Las líneas de venta toman el IVA del repuesto; cobro, comprobante y devoluciones con el mismo cálculo por tarifa.

Migraciones: tareas 3, 4, 5, 6, 7 y 8 (columnas nuevas con valor por defecto 19, más la tabla de tarifas). Todas aditivas: el código en producción sigue funcionando mientras se despliega.

Verificación por tarea: tests del cálculo (una tarifa = resultado de hoy; varias tarifas + descuento), `tsc`, y prueba en el navegador de lo que cambia en pantalla.

## Fuera de alcance

- Facturación electrónica DIAN (aplazada, fase 23).
- Retenciones (ReteFuente, ReteIVA, ReteICA).
- Precios con IVA incluido: los precios siguen siendo antes de IVA, como hoy.
