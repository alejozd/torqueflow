# Cuentas por pagar — propuesta de rediseño

**Problema:** el formulario en línea venía con el saldo completo ya escrito y sin etiqueta. «Abonar» pagaba todo y la cuenta desaparecía (Bosch: $ 6.515.899 por accidente). Nada mostraba qué se pagó ni para qué era la deuda.
**Idea:** la lista solo muestra datos y cada entrada tiene un botón **Abonar** que abre un **diálogo**. El monto empieza vacío, el botón dice la cifra y lo pagado sigue a la vista.
**Diálogo, no hoja lateral:** es una sola tarea corta y hay que verla completa. Con 630 px de alto una hoja lateral deja poco espacio, y el diálogo ya existe (`ui/dialog.tsx`). En el celular ocupa toda la pantalla.

## Distribución
- Encabezado + fila de 5 KPI (la misma de hoy) + **lectura sencilla**: «Lo más urgente: 3 entradas pasan de 60 días…».
- Pestañas `Pendientes (n)` | `Pagadas · 30 días (n)`, con el estilo de las pestañas de Citas o Mostrador.
- Una tarjeta por proveedor con el título en `TituloSeccion` (ícono de camión, tono azul), un bloque teñido «Le debes $ X» y el botón opcional «Abonar al proveedor».
- Cada entrada va en una fila de rejilla: enlace **«Entrada del 4 sep. 2026 ↗»** (a `/entradas-mercancia/[id]`) + «3 referencias · Batería NGK ×20…», chip de antigüedad con punto, barra de pagado vs total («Pagado $ 200.000 de $ 5.073.557»), «Debe» y el botón **Abonar**.
- Si la entrada tiene abonos, aparece debajo «▾ 1 abono registrado», que se despliega: fecha y hora, monto, método · referencia, quién lo registró.
- En el celular la fila se apila: entrada arriba, chip y saldo, barra, botón.

## Cambios numerados (en orden para implementar)
1. **Servidor, lectura:** `getCuentasPorPagar(filtro: "pendientes" | "pagadas")` debe devolver por cuenta:
   - `pagado` (total − saldo)
   - `entrada: { id, referencias: n, resumen: "Batería NGK ×20, … y 1 más" }`, con los 2 ítems de mayor cantidad
   - `pagos[]: { id, monto, metodoPago, referencia, registradoPor: nombre, createdAt }`, del más reciente al más viejo
   - `pagadas`: `estado PAGADA` con último pago ≥ hoy − 30 días, solo para el conteo de la pestaña
   - Llevar los mismos campos a `CuentaPorPagarFila` en `lib/proveedores/cuentas-por-pagar.ts` (la agrupación no cambia).
2. **Lista nueva** (`cuentas-por-pagar/proveedor-cuentas.tsx`, componente de servidor). Quitar `AbonoCuentaForm` de la página. Agregar la lectura «Lo más urgente» (cuentas > 60 días, nombres y días).
3. **Historial** (`historial-abonos.tsx`, cliente): botón que despliega la lista de abonos. Viene abierto si el último abono es de hoy.
4. **Diálogo `AbonoCuentaDialog`** (cliente, reemplaza `abono-cuenta-form.tsx`):
   - Resumen (entrada + enlace «Ver entrada», Total / Ya pagado / Debe).
   - Campo con etiqueta **«¿Cuánto vas a pagar?»**, **vacío**, con separador de miles mientras se escribe (`inputMode="numeric"`; el form envía el número limpio).
   - Botones rápidos con punto de color: `Pagar todo · $X`, `La mitad · $X`, `Otro valor`.
   - Método con 4 botones segmentados (`aria-pressed`), sin select.
   - Si el método es **Efectivo**, una nota: «El dinero sale de la caja abierta».
   - **Referencia (opcional)** (`name="referencia"`, que la acción ya acepta).
   - Vista previa en vivo: «Después de este abono le quedarás debiendo $Y a Pirelli por esta entrada», con una barra que muestra lo pagado más el abono. Si se paga todo: «✓ Con este abono la entrada queda pagada».
   - Botón de confirmar: «Escribe el monto» (desactivado) → «Registrar abono de $ 200.000» → «Pagar todo: $ 4.873.557».
5. **Estados del diálogo:**
   - *Monto mayor al saldo:* error junto al campo y botón desactivado.
   - *Caja cerrada* (el servidor responde con `exigirCajaParaEfectivo`): para no esperar al envío, la página ya pasa `cajaAbierta: boolean` y el diálogo muestra la alerta roja junto al método («La caja está cerrada… Abrir caja →») y desactiva el botón. El error del servidor sigue siendo la protección final y se muestra en el mismo lugar.
   - *Cargando:* «Registrando…».
   - *Éxito:* el contenido del diálogo cambia a ✓ verde vivo sin círculo + «Abono registrado», «$ 300.000 a Terpel por transferencia · ref. 004581233», lo que queda o «quedó pagada, la encuentras en Pagadas». Botones «Hacer otro abono» y «Listo».
6. **Nada se esconde sin aviso:** al cerrar después de pagar todo, la fila sigue en Pendientes con «✓ Pagada» y un resaltado verde hasta recargar. Para eso la acción devuelve `{ success, montoRegistrado, saldoRestante, cuentaId }` y la fila lee `?abonada=<id>` o un estado local.
7. **Pestaña Pagadas:** las mismas tarjetas, con el chip «Pagada hoy / el 12 oct.» en lugar de la antigüedad, el historial abierto y sin botón Abonar.
8. **Vacío:** «✓ Todo está pagado. No le debes nada a ningún proveedor.» Si hay filtro: «No hay cuentas pagadas en los últimos 30 días».
9. **Opcional — «Abonar al proveedor»** (solo si tiene ≥ 2 entradas por pagar):
   - Diálogo con monto total, botones rápidos `Todo` y `Lo de más de 60 días`, y una tabla «Así se reparte» (de la más vieja a la más nueva: recibe / después).
   - Botón «Registrar $ 5.000.000 en 2 entradas».
   - Servidor: una acción nueva `abonarProveedorAction(proveedorId, monto, metodoPago, referencia)` que en **una transacción** crea un `PagoProveedor` por cuenta tocada, con la misma guarda atómica `saldoPendiente gte`. La revisión de caja se hace una sola vez.
   - Se puede posponer sin afectar los pasos 1 a 8.

## Reutilizar
`KpiCard`/`KPI_TONE`, `TituloSeccion`, `Card`, `Dialog`, `Button`, `Input`, `Label`, `Alert`, el enlace con estilo de `cartera-table.tsx`, y `formatoMoneda` (es-CO, sin decimales).
**No hace falta `ConfirmacionEnLinea`:** el diálogo ya es la confirmación, porque el botón dice el monto.

## Datos reales usados en el mockup (taller_dev, 16 oct. 2026)
12 cuentas pendientes con 5 proveedores, por **$ 35.742.199** (Gates $ 9.793.986, Andina $ 8.981.530, Bosch $ 8.725.606, Pirelli $ 4.873.557, Terpel $ 3.367.520). Pirelli ya abonó $ 200.000 y Bosch tiene la entrada del 9 ago. pagada hoy. Ninguna referencia guardada.
