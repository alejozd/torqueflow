# Fase 24 — Mostrador y compras: venta de mostrador con devoluciones, cuentas por pagar y exportación (spec + plan de tareas)

> Rama: `fase24-mostrador-compras` · Roadmap ítems **22** (venta de mostrador con devoluciones),
> **23** (cuentas por pagar a proveedores) y **24** (exportar CSV/PDF), los tres de prioridad baja pero con
> **dinero de por medio**. Depende de la fase 17 (caja y cartera), ya mergeada.
> Documento **autocontenido**: puede ejecutarlo cualquier agente sin el historial de la conversación.
> Leer completo antes de empezar. **Estado: plan escrito, NO ejecutado.** Empezar por la Task 1.

---

## 0. Instrucciones para el agente ejecutor (OBLIGATORIAS)

1. Leer antes de tocar código: `AGENTS.md` (este Next.js 16 tiene cambios incompatibles: consultar
   `node_modules/next/dist/docs/` antes de usar APIs de Next), `RULES.md` y `PROJECT_BRIEF.md`.
2. Trabajar **solo** en la rama `fase24-mostrador-compras`. No tocar `main`.
3. **Una tarea a la vez.** Al terminar cada tarea:
   - `npx tsc --noEmit --incremental false` limpio y `npm test` completo pasando (pegar el resumen
     "Test Files / Tests").
   - `npx eslint <archivos tocados>` sin errores.
   - Commit `fase24-task N: <descripción>` con trailer `Co-Authored-By: <modelo que ejecuta> <noreply@…>`; `git push`.
   - Reportar en 3–5 líneas y **detenerse a pedir aprobación**, salvo que el usuario autorice continuar sin
     aprobación por tarea: en ese caso se reporta al final de todas.
4. **No reintentos automáticos** (RULES §1): máximo 1 corrección por error; si vuelve a fallar, detenerse y reportar.
5. **Nunca aplicar migraciones sin autorización explícita ni sin respaldo previo.** Esta fase **sí lleva
   migración** (seis modelos nuevos + un evento de auditoría): se aplica al final, con respaldo `pg_dump` y
   aprobación (ver §6). La única base del `.env` (`100.87.12.1`) es **la misma de producción**.
6. TDD: escribir primero los tests, verlos fallar, implementar, verlos pasar.
7. Archivos con finales de línea CRLF: preferir edición por reemplazo exacto, no `sed`.
8. Español en toda la UI y en los mensajes de validación (los planes de fase van en español; los comentarios
   de `src/` van en inglés, como el resto del repo).
9. Sandbox confinado (p. ej. el agente DSH en modo `workspace-write`): `npx tsc --noEmit` falla con `TS5033`
   al escribir `tsconfig.tsbuildinfo` → usar `--incremental false`. `npm test`, `npm run build`,
   `npm install` y `npx prisma …` **no** arrancan en modo confinado (lanzan subprocesos con pipes:
   `spawn EPERM`), así que requieren acceso completo o ejecutarlos el usuario; **no son fallos del proyecto**.

### Patrones del proyecto a reutilizar (leerlos)

- **El descuento de stock, con su guarda (el patrón central de la fase)**: al facturar se decrementa con
  `updateMany({ where: { id, stockActual: { gte: cantidad } } })` y se lanza si no alcanzó
  (`src/app/actions/factura-actions.ts:166-173`), **agregando las líneas repetidas por repuesto** en un mapa
  (`:143-148`). El stock solo se mueve ahí, al recibir mercancía
  (`src/app/actions/entrada-mercancia-actions.ts:143`), al recibir un pedido
  (`src/app/actions/pedido-compra-actions.ts:328`) y en la importación
  (`src/app/actions/importacion-actions.ts:294`); editar un repuesto **no** lo toca
  (`src/app/actions/repuesto-actions.ts`, con test en `repuesto-actions.test.ts`).
- **La cartera es el espejo de las cuentas por pagar**: saldo en el documento
  (`Factura.saldoPendiente`, `prisma/tenant/schema.prisma:555`), abonos en tabla hija (`Pago`, `:567-581`)
  creados en `$transaction` con decremento **guardado** (`saldoPendiente: { gte: monto }`,
  `src/app/actions/pago-actions.ts:44-67`), "pagada" **derivado** (no un flag manual), y la antigüedad en
  lógica pura con test (`src/lib/cartera/antiguedad.ts:34-81`).
- **La caja (y el hueco que esta fase cierra)**: `CajaSesion` (`schema.prisma:981-998`: `sedeId`,
  `baseInicial`, `abiertaAt`, `cerradaAt?`, `efectivoEsperado?`, `efectivoContado?`) con índice parcial
  "una abierta por sede" (`prisma/tenant/migrations/20261012120000_caja_cartera_anticipos/migration.sql:83`);
  abrir/cerrar en `src/app/actions/caja-actions.ts:176-177`, `:212`, `:236`. El arqueo **esperado** se calcula
  por **sede + `createdAt`** dentro de la ventana de la sesión (`:79-89`: pagos con
  `metodoPago != ANTICIPO` y `factura: { orden: { sedeId } }`, anticipos, devoluciones de anticipo por
  `devueltoAt`, y gastos `pagadoEnEfectivo`), y el resumen puro vive en `src/lib/caja/resumen.ts:20-38`.
  **`registrarPagoAction` NO exige caja abierta** (`src/app/actions/pago-actions.ts:17-77`): un cobro con la
  caja cerrada se registra y **no aparece en ningún arqueo**. Esta fase lo cierra (D2).
- **Compras**: `PedidoCompra` (`:798-823`, estados BORRADOR/ENVIADO/RECIBIDO/CANCELADO en `:783-788`) no tiene
  saldo ni pagado, y recibirlo solo crea `EntradaMercancia` + sube stock + marca RECIBIDO
  (`pedido-compra-actions.ts:310-338`, con guarda condicional `:334-337`). `EntradaMercancia` (`:497-513`)
  tiene `proveedorId` y `bodegaId` **obligatorios**, `items` (`:515-528`, con `cantidad` y
  `precioCompraUnitario`) y `pedidoCompra?`; **la sede sale de `bodega.sedeId`** (`Bodega.sedeId` obligatorio,
  `:434`). `Gasto` **no tiene proveedor, ni fecha de pago, ni estado, ni pago** (`:887-912`): solo
  `pagadoEnEfectivo`.
- **Exportación**: `write-excel-file` **ya es dependencia** (entró con la importación de la fase 20) y su
  precedente de descarga es una ruta API con `Content-Disposition` (`src/app/api/importacion/plantilla/route.ts:23`,
  con test del encabezado en `route.test.ts:26`). Ojo: la fase 20 aprendió que la entrada `/node` de esas
  librerías no acepta un `File`/`Blob`; en una ruta (Node) hay que generar el archivo con la API de Node.
  Existe además un CSV propio (`src/app/(dashboard)/citas/page.tsx:167-197`) que comilla bien pero **no lleva
  BOM ni pista de separador y no sanea fórmulas**: no se extiende, se deja como está (esta fase exporta `.xlsx`).
- **Numeración**: `Factura.numero`, `PedidoCompra.numero` y `Cotizacion.numero` son
  `Int @unique @default(autoincrement())`, **globales por schema de taller, no por sede** (`:545`, `:800`).
- **Auditoría**: `src/lib/auditoria/catalogo.ts` — añadir un tipo toca el enum del schema
  (`prisma/tenant/schema.prisma:17-32`) **y los dos sitios** del catálogo (array `:8-23` y mapa de etiquetas
  `:25-40`); `registrarEventoAuditoria(tx, …)` (`src/lib/auditoria/registrarEvento.ts:10-21`) va **dentro** de
  la transacción del llamador.
- **Tests**: acciones con `vi.mock` de guards/tenant-client/cache y un `$transaction` falso
  (`src/app/actions/orden-actions.test.ts:21-49`); páginas de servidor invocadas con la promesa resuelta y
  renderizadas (`src/app/(dashboard)/reportes/page.test.tsx:44`); rutas API con un `NextRequest` falso y
  `{ params: Promise.resolve(...) }` (`src/app/api/importacion/plantilla/route.test.ts`). **Los tests mockean
  `getTenantDb`**, así que un campo nuevo que falte en la migración **no hace fallar los tests**: por eso §6
  exige probar el flujo una vez contra la base real.

---

## 1. Objetivo y decisiones

**Objetivo:** que el taller pueda **vender en el mostrador** lo que tiene en inventario (cobrando y
descontando stock), **devolver** una venta sin descuadrar ni el stock ni la caja, **saber lo que debe a sus
proveedores** desde que la mercancía entra, y **sacar los reportes del día en un archivo** que un contador
pueda abrir.

**Fuera de alcance de esta fase** (documentarlo, no improvisarlo): devolver **saldo a favor** en lugar de
dinero (se eligió devolver el dinero); que la venta de mostrador genere una **factura** o pase por una orden
de trabajo (se eligió documento propio); registrar la deuda **desde el pedido** o desde el gasto (se eligió
desde la entrada de mercancía); exportar a **CSV/PDF** (se eligió Excel); inventario valorizado y gastos por
categoría en los reportes; y cualquier comprobante impreso de la venta (no se pidió).

| # | Decisión |
|---|---|
| **D1** | **La venta de mostrador es un documento propio** (`VentaMostrador` + `VentaMostradorItem`), con **sede obligatoria**, número consecutivo propio (`@unique @default(autoincrement())`, como la factura) y **cliente opcional**. No se toca `Factura` ni su `ordenId` obligatorio y único (`schema.prisma:547-548`). |
| **D2** | **Cobrar exige caja abierta, y se cierra el hueco heredado**: además de exigirlo en el mostrador, `registrarPagoAction` (fase 17) pasa a exigir una `CajaSesion` abierta de la sede. Es la forma barata y correcta de arreglarlo: el arqueo calcula la ventana por **sede + `createdAt`** (`caja-actions.ts:79-89`), así que si todo movimiento nace dentro de una sesión abierta, ninguno queda fuera. **No** se añade `sesionId` a los pagos (sería una migración sobre el corazón del dinero sin necesidad). |
| **D3** | **Cliente opcional**, con "Consumidor final" como etiqueta cuando no hay cliente. Sin cliente no hay crédito: la venta tiene que quedar **pagada** para cerrarse. Con cliente identificado sí se admite saldo (espejo de la factura). |
| **D4** | **La devolución devuelve dinero** por el mismo método con que se cobró, **reingresa el stock** a la bodega del repuesto y queda registrada en el arqueo de la sesión. Es un documento propio (`DevolucionMostrador` + items) con número consecutivo y **auditada**. |
| **D5** | **Las cuentas por pagar nacen de la entrada de mercancía** (`CuentaPorPagar` con `entradaId @unique`): es el hecho económico y el único punto que ya mueve el stock. La entrada puede registrarse **pagada al contado**, en cuyo caso la cuenta nace y se salda en la misma transacción. Una sola fuente de deuda por entrada: imposible contarla dos veces. |
| **D6** | **Abonos a proveedor con guarda**: `PagoProveedor` con decremento atómico guardado (`saldoPendiente: { gte: monto }`, el patrón de `pago-actions.ts:44-67`) y "pagada" **derivado** del saldo, nunca un flag manual. |
| **D7** | **El arqueo suma ventas de mostrador y resta sus devoluciones**: la ventana sigue siendo sede + `createdAt`, pero con dos fuentes nuevas en `caja-actions.ts` y el cálculo en la lógica pura de `src/lib/caja/resumen.ts`. Mismo tratamiento que pagos y gastos: **efectivo** separado de no efectivo. |
| **D8** | **El mostrador descuenta stock con el mismo patrón guardado de la factura** (`updateMany where stockActual >= cantidad` + agregado por repuesto) y **dentro de la misma transacción** que la venta: no hay ventana para sobrevender. |
| **D9** | **Una devolución no puede superar lo vendido menos lo ya devuelto**, y se calcula con lógica pura y testeada (`cantidadDevolvible`). El stock se reingresa en la misma transacción. |
| **D10** | **Exportación en `.xlsx`** con la dependencia que ya existe (`write-excel-file`), desde **rutas API** con `Content-Disposition` (precedente: la plantilla de importación), filtradas **por sede en el servidor**. Cuatro reportes: cartera, cuentas por pagar, ventas del día y arqueos de caja. |
| **D11** | **Roles**: vender, cobrar y devolver: `ADMIN`, `RECEPCION` y `TECNICO` (es trabajo de mostrador, como el cambio de estado de una orden). Cobrar y abonar a proveedores: `ADMIN` y `RECEPCION`. Registrar entradas de mercancía y pagos a proveedor ya tienen sus roles hoy y no cambian. Exportar: cualquier sesión (los reportes de dinero ya se ven en el panel). |
| **D12** | **Se audita la devolución** (`VENTA_DEVOLVER`): es dinero que sale del cajón. Registrar ventas, cobros y abonos **no** se audita, por coherencia con la facturación y los pagos actuales (el catálogo no los audita hoy). |
| **D13** | **Sin comprobante impreso de la venta** en esta fase (no se pidió); si algún día se quiere, el precedente de impresión es la cotización y el acta. |
| **D14** | **La deuda de un proveedor no se mezcla con los gastos**: `Gasto` se queda como está (sin proveedor ni estado de pago). Si el taller compra algo que no entra a inventario, sigue siendo un gasto. |

---

## 2. Modelo, validación y lógica (Task 1)

**Migración** `prisma/tenant/migrations/<timestamp>_mostrador_compras/migration.sql`, generada con
`prisma migrate diff` desde el schema de `main` (como las fases 21 y 22; sin retoques salvo el `ALTER TYPE`
del evento de auditoría, una sentencia por valor):

```prisma
model VentaMostrador {                 // @@map("ventas_mostrador")
  id, numero Int @unique @default(autoincrement())
  estado          EstadoFactura @default(PENDIENTE)   // se reutiliza PENDIENTE|PAGADA
  sedeId + sede                      // obligatorio, indexado: el arqueo llega a la sede por aquí
  clienteId? + cliente (SetNull)     // sin cliente = "Consumidor final"
  subtotal, descuento, iva, total, saldoPendiente   // Decimal(10,2), como la factura
  creadoPorId + creadoPor
  items VentaMostradorItem[], pagos PagoVentaMostrador[], devoluciones DevolucionMostrador[]
  createdAt, updatedAt               // @@index([sedeId, createdAt])
}

model VentaMostradorItem {             // @@map("venta_mostrador_items")
  id, ventaId (Cascade), repuestoId? (SetNull), descripcion, cantidad, precioUnitario, createdAt
}

model PagoVentaMostrador {             // @@map("pagos_venta_mostrador")
  id, ventaId, monto Decimal(10,2), metodoPago MetodoPago, referencia?, registradoPorId, createdAt
}

model DevolucionMostrador {            // @@map("devoluciones_mostrador")
  id, numero Int @unique @default(autoincrement())
  ventaId, sedeId, motivo?, total Decimal(10,2), metodoPago MetodoPago, creadoPorId, items[], createdAt
}

model DevolucionMostradorItem {        // @@map("devolucion_mostrador_items")
  id, devolucionId (Cascade), ventaItemId, repuestoId?, cantidad, precioUnitario
}

model CuentaPorPagar {                 // @@map("cuentas_por_pagar")
  id, entradaId String @unique       // una deuda por entrada: imposible duplicarla
  entrada, proveedorId + proveedor, total, saldoPendiente Decimal(10,2)
  estado EstadoFactura @default(PENDIENTE), fecha @db.Date, creadoPorId, pagos PagoProveedor[]
  createdAt, updatedAt               // @@index([proveedorId, estado])
}

model PagoProveedor {                  // @@map("pagos_proveedor")
  id, cuentaId, monto Decimal(10,2), metodoPago MetodoPago, referencia?, registradoPorId, createdAt
}
```

**Validación** (`src/lib/validation/mostrador.ts` y `.../compras.ts`, Zod v4, mensajes en español):
`ventaMostradorInputSchema` (líneas con `repuestoId` o descripción, cantidad ≥ 1, precio ≥ 0, descuento 0–100,
cliente y método opcionales, `pagadoAlContado`), `devolucionMostradorInputSchema` (venta, líneas con cantidad
≥ 1 y motivo opcional) y `abonoProveedorInputSchema` (monto > 0). Reusar `MONTO_MAXIMO` y los patrones de
`src/lib/validation` (cuidado con `z.coerce.number()` y el `""` → 0).

**Lógica pura** (sin Prisma, con test propio, como `src/lib/cartera/antiguedad.ts`):

```ts
// src/lib/mostrador/ventas.ts
export function calcularTotalesVenta(lineas: { cantidad: number; precioUnitario: number }[], descuentoPct: number): { subtotal, descuento, iva, total }
export function cantidadDevolvible(vendida: number, yaDevuelta: number): number
export function totalDevolucion(lineas: { cantidad: number; precioUnitario: number }[]): number
// src/lib/caja/resumen.ts (extender lo que ya existe)
export function calcularResumenCaja(...) // + ventas de mostrador (ingreso) y devoluciones (egreso)
// src/lib/proveedores/cuentas-por-pagar.ts
export function agruparCuentasPorPagar(...)   // antigüedad por fecha, espejo de la cartera
```

---

## 3. Tareas

### Task 1: esquema, migración, validación y lógica pura

**Archivos:** `prisma/tenant/schema.prisma`, `prisma/tenant/migrations/<ts>_mostrador_compras/migration.sql`,
`src/lib/validation/mostrador.ts`, `src/lib/validation/compras.ts` (o ampliar los existentes),
`src/lib/auditoria/catalogo.ts`, `src/lib/mostrador/ventas.ts`, `src/lib/proveedores/cuentas-por-pagar.ts`,
`src/lib/caja/resumen.ts` (+ tests de cada pieza pura).

1. Los seis modelos de §2, el evento `VENTA_DEVOLVER` en el enum y en **los dos** sitios del catálogo.
2. Migración con `prisma migrate diff`. **No aplicarla** todavía (§6). Regenerar el cliente (ambos schemas).
3. Validación y lógica pura con tests: totales con descuento e IVA, devolvible nunca negativo, resumen de
   caja con las dos fuentes nuevas, y antigüedad de cuentas por pagar.
4. Verificar (§0.3) y commit `fase24-task 1: esquema, migracion, validacion y logica de mostrador y compras`.

### Task 2: venta de mostrador, cobro y caja

**Archivos:** `src/app/actions/venta-mostrador-actions.ts` (+ `.test.ts`), `src/app/actions/pago-actions.ts`,
`src/app/actions/caja-actions.ts`, `src/lib/caja/resumen.ts`.

1. `crearVentaMostradorAction`: `requireRole(["ADMIN","RECEPCION","TECNICO"])`, validación, **caja abierta
   obligatoria** (helper nuevo `sesionDeCajaAbierta(tenantDb, sedeId)` reutilizable), y en **una sola
   `$transaction`**: crear la venta con sus líneas, **descontar stock con la guarda** (agregado por repuesto) y
   registrar el cobro si se cobra en el momento (efectivo/tarjeta/transferencia). Sin cliente, la venta debe
   quedar pagada (D3).
2. `cobrarVentaMostradorAction`: abono con decremento atómico guardado (`saldoPendiente: { gte: monto }`) y
   error claro si alguien cobró antes ("otra persona registró un cobro"), con la misma estructura que
   `pago-actions.ts:44-67`.
3. **Cerrar el hueco heredado (D2)**: `registrarPagoAction` exige caja abierta de la sede de la factura;
   actualizar sus tests y añadir el caso "caja cerrada → no cobra".
4. Extender el **arqueo** (`caja-actions.ts` + `resumen.ts`): las ventas de mostrador entran como ingreso y
   las devoluciones como egreso, en la misma ventana (sede + `createdAt`), con separación efectivo/no efectivo.
5. Tests: venta con stock suficiente y con stock insuficiente (no deja stock negativo ni crea la venta),
   líneas repetidas del mismo repuesto, venta sin cliente sin cobrar (rechazada), cobro parcial, cobro doble
   (rechazado), caja cerrada (rechazada) y arqueo con ventas incluidas.
6. Verificar y commit `fase24-task 2: venta de mostrador, cobro y caja abierta obligatoria`.

### Task 3: devoluciones de mostrador

**Archivos:** `src/app/actions/devolucion-mostrador-actions.ts` (+ `.test.ts`),
`src/app/actions/caja-actions.ts` (arqueo), `src/app/actions/venta-mostrador-actions.ts` (consulta del
devuelto).

1. `crearDevolucionAction`: valida contra **lo vendido menos lo ya devuelto** (lógica pura), exige caja
   abierta, y en una `$transaction`: crea la devolución con sus líneas, **reingresa el stock**
   (`increment`), registra la salida de dinero (mismo método que el cobro) y **audita** `VENTA_DEVOLVER` con
   importe y motivo. La venta vuelve a `PENDIENTE` si queda saldo a favor del cliente… **no**: la devolución
   devuelve dinero, así que **no** toca el `saldoPendiente` de la venta si esta estaba pagada; si estaba
   pendiente, la devolución reduce el saldo por el importe efectivamente cobrado (documentarlo en el código).
2. Test del tope: devolver más de lo vendido o devolver dos veces la misma línea falla con mensaje claro.
3. Verificar y commit `fase24-task 3: devoluciones de mostrador con stock, caja y auditoria`.

### Task 4: cuentas por pagar a proveedores

**Archivos:** `src/app/actions/cuenta-por-pagar-actions.ts` (+ `.test.ts`),
`src/app/actions/entrada-mercancia-actions.ts`, `src/app/actions/pedido-compra-actions.ts` (recepción),
`src/app/(dashboard)/proveedores/[id]/page.tsx` o la ficha que corresponda.

1. Al registrar una `EntradaMercancia` (y también al recibir un pedido, que crea una entrada) se crea su
   **`CuentaPorPagar`** en la misma transacción, con el total calculado de los items y la **fecha** de la
   entrada; si la entrada se registra como pagada al contado, se crea además el `PagoProveedor` que la salda
   (D5). El `pedidoCompra` que ya se guarda en la entrada (`schema.prisma:507`) sirve para trazabilidad.
2. `abonarCuentaPorPagarAction`: `requireRole(["ADMIN","RECEPCION"])`, decremento guardado, saldo derivado,
   y **auditoría no** (coherente con los pagos actuales).
3. Consulta para la pantalla: totales por proveedor y antigüedad, con la lógica pura de §2 y `select` mínimo.
4. Tests: la entrada crea la cuenta con el total correcto y una sola vez; entrada pagada al contado nace
   saldada; abono parcial y abono que excede el saldo (rechazado); doble abono simultáneo (uno falla);
   recepción de pedido también genera su cuenta.
5. Verificar y commit `fase24-task 4: cuentas por pagar desde la entrada de mercancia con abonos`.

### Task 5: pantallas de mostrador y cuentas por pagar

**Archivos:** `src/app/(dashboard)/mostrador/page.tsx` (+ componentes y tests),
`src/app/(dashboard)/cuentas-por-pagar/page.tsx` (o dentro de proveedores), y los enlaces en
`dashboard-sidebar.tsx` / `layout.tsx` (visibilidad por rol, como `puedeVerFinanzas`).

1. **Mostrador**: buscador de repuesto (con su stock disponible), carrito con cantidades y precio editable,
   descuento, total, método de cobro, cliente opcional, y el estado de la caja (**sin caja abierta, avisar y
   no dejar cobrar**). Tras vender: la venta queda listada abajo con su número, total y saldo.

   **Ojo con el stock "comprometido"**: antes de vender conviene mostrar `stockActual` menos lo comprometido
   en órdenes abiertas, no el crudo (el proyecto ya calcula eso: `src/lib/inventario/comprometido.ts`).
2. **Devoluciones**: desde la venta, elegir líneas y cantidades (el máximo lo dice la lógica pura), motivo, y
   confirmación en línea porque sale dinero (`ConfirmacionEnLinea`).
3. **Cuentas por pagar**: por proveedor, con saldo, antigüedad y botón de abono; y aviso de las vencidas.
4. Tests de los componentes nuevos (render, totales, tope de devolución, aviso de caja cerrada) y de la
   página si se puede aislar; los helpers con lógica van a módulos puros y se prueban aparte.
5. Verificar y commit `fase24-task 5: pantallas de mostrador, devoluciones y cuentas por pagar`.

### Task 6: exportación en Excel de los cuatro reportes

**Archivos:** `src/app/api/exportar/[reporte]/route.ts` (+ `.test.ts`), `src/lib/exportacion/excel.ts`
(+ `.test.ts`), botones de exportar en `/cartera`, `/cuentas-por-pagar`, `/mostrador` y `/caja`.

1. Un módulo `excel.ts` que arme el libro con `write-excel-file` (encabezados en español, moneda y fechas con
   formato, anchos), **una función por reporte** y un tipo de fila explícito. Sin lógica de negocio: recibe
   filas ya preparadas y probadas.
2. Una ruta `GET /api/exportar/<reporte>` con `requireSession` + `requireRole`, filtrada **por la sede activa
   del servidor** (nunca por parámetro), `Content-Disposition: attachment` y sin caché (patrón de
   `src/app/api/importacion/plantilla/route.ts:23`). Reportes: `cartera`, `cuentas-por-pagar`, `ventas-hoy`,
   `arqueos` (con rango de fechas como `searchParams`, validado).
3. Botón de exportar (enlace directo a la ruta, sin JS) en cada pantalla.
4. Tests: la ruta devuelve el tipo MIME y el nombre de archivo correctos, exige sesión, ignora un `sedeId`
   pasado por parámetro, y el módulo arma las filas esperadas para una lista de ejemplo (incluida una celda
   con texto que empieza por `=` para comprobar que **no** se interpreta como fórmula).
5. Verificar y commit `fase24-task 6: exportacion en Excel de cartera, cuentas por pagar, ventas y arqueos`.

---

## 4. Seguridad

Todo pasa por `getTenantDb(session.user.tenantSchema)` con `requireSession`/`requireRole` antes de cualquier
lectura o escritura, y cada documento se busca con `findFirst` + el scope de sede que corresponda (nunca
`findUnique` por id suelto). El dinero se mueve **siempre** dentro de una `$transaction` y con guardas
condicionales (`stockActual >= cantidad`, `saldoPendiente >= monto`), que es lo que evita sobreventa, doble
cobro y doble devolución. La venta guarda el precio **copiado** en la línea (no referencia el precio del
repuesto, que puede cambiar después). Las exportaciones se filtran por la sede de la sesión en el servidor y
nunca aceptan una sede por parámetro; los archivos no se escriben en disco, se envían en la respuesta. No se
añade ninguna dependencia nueva.

## 5. Verificación final de la fase

`npx tsc --noEmit --incremental false`, `npm test` completo, `npx eslint` en lo tocado y `npm run build`.
Revisión del diff completo contra este documento (revisión final con otro modelo) y fix round de los
hallazgos. Reporte.

## 6. Cierre (solo con aprobación del usuario)

1. Respaldo en el servidor (`ssh` + `pg_dump` a `~/backups/torqueflow_<fecha>_pre_fase24.sql`, con la URL de
   `DATABASE_URL` del `.env` sin `?schema=`).
2. Aplicar la migración a cada schema de tenant (`taller_dev`, `taller_dev_reference`):
   `TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=<schema>" npx prisma migrate deploy --schema=prisma/tenant/schema.prisma`
   y verificar `npx prisma migrate diff --from-url "<misma URL>" --to-schema-datamodel prisma/tenant/schema.prisma --script` → "empty migration".
   Como los tests mockean el cliente, comprobar además con `psql` que las seis tablas nuevas existen en
   `taller_dev`.
3. Dejar `npm run dev` corriendo para la prueba manual del usuario (en un clon aparte del checkout de
   producción, como en las fases 20–22) y probar el flujo completo: abrir caja → vender un repuesto (ver el
   stock bajar) → intentar vender sin caja abierta (debe impedirlo) → cobrar una venta a crédito → devolver
   una línea (stock vuelve y el arqueo lo refleja) → registrar una entrada de mercancía y ver la cuenta por
   pagar → abonarla → exportar los cuatro reportes y abrirlos en Excel.
4. Con el visto bueno: `git checkout main && git pull && git merge --no-ff fase24-mostrador-compras`,
   actualizar `PROJECT_BRIEF.md` y `git push`.
