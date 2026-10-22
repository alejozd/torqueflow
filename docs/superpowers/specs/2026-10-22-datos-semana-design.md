# Datos de la semana: script para llenar el taller de prueba (diseño)

**Fecha:** 2026-10-22 · **Estado:** aprobado por el usuario en conversación, pendiente de revisión del documento.

## Objetivo

Un comando que el usuario corre cuando quiere ver el sistema con datos realistas: llena un rango de fechas elegido con movimiento de taller en **todos los flujos**, para examinar el Inicio, la caja, los reportes y el resto de pantallas, y para mostrarlo a terceros. El tenant `taller_dev` solo lo usa el usuario (desarrollo y demostración); dev y producción comparten base, así que los datos también se ven en `torqueflow.zdevs.uk` para ese taller, y eso es lo buscado.

## Decisiones

- **D1. TypeScript con Prisma directo, no SQL.** Las reglas del negocio (totales e IVA, stock, saldo derivado, caja abierta para el efectivo, cuenta por pagar que nace de la entrada) viven en el código; el script **importa las funciones puras de `src/lib`** (`computeFacturaTotales`, `computeCotizacionTotales`, `calcularTotalesVenta`, `totalDevolucion`, `calcularResumenCaja`, `calcularMontoLiquidacion`, `calcularRecurrentesPendientes`, `totalOrden`, etc.) en lugar de copiarlas. No llama a las server actions (exigen sesión y contexto de Next) ni maneja un navegador.
- **D2. Solo `taller_dev`.** Con cualquier otro schema se detiene antes de leer o escribir.
- **D3. Sin envíos.** Nunca manda correos ni WhatsApp. Los correos inventados usan `@ejemplo.test`.
- **D4. No toca** usuarios, sedes, configuración del taller ni los datos de demostración que el usuario pidió conservar (cliente Andrea Valencia Ríos y placas JKT482, MRW615, HBL290, DFN734). Nunca crea usuarios.
- **D5. Marca.** Todo lo creado lleva `[datos-semana]` en un campo de notas u observaciones. **No hay comando de borrado** (el usuario no lo necesita); la marca permite agregarlo después.
- **D6. Consecutivos.** Los pone la base (`autoincrement`). Efecto aceptado: llenar una semana pasada después de la actual da números más altos a fechas más viejas.
- **D7. Transacción por día y sede.** Un fallo deshace ese día completo, detiene el script y dice en qué día y paso falló; los días anteriores quedan.
- **D8. Azar repetible.** Semilla mostrada al final; `--semilla N` repite la misma semana.

## Uso

Desde el portátil, con Tailscale encendido (mismo `.env` que `npm run dev`):

```
npm run datos:semana
npm run datos:semana -- --semilla 1234
```

Preguntas, en orden:

1. **Desde / hasta** (por defecto: lunes de esta semana → hoy). No acepta futuro ni "hasta" < "desde". Sirve también para llenar semanas anteriores (histórico).
2. **Sede:** una o todas.
3. **Clientes:** crear nuevos (cuántos) o usar existentes.
4. **Volumen:** bajo / medio / alto.
5. **Liquidar mecánicos** al final del periodo: sí / no.
6. **Resumen y confirmación** antes de escribir ("vas a crear 42 órdenes, 18 facturas, 6 cajas…").

Al terminar: lo creado por tipo, la semilla y el resultado del cuadre.

## Archivos

- `scripts/datos-semana/index.ts` — orquesta: validaciones previas → preguntas → plan → ejecución por día → verificación.
- `scripts/datos-semana/preguntas.ts` — preguntas en consola (con valores por defecto).
- `scripts/datos-semana/plan.ts` — **función pura**: dado rango, sedes, volumen, semilla y catálogo existente, decide qué crear cada día y a qué hora. Lo más probado.
- Un archivo por flujo: `clientes.ts`, `citas.ts`, `cotizaciones.ts`, `ordenes.ts`, `dinero.ts` (caja, facturas, pagos, anticipos), `mostrador.ts`, `compras.ts`, `gastos.ts`, `liquidaciones.ts`.
- `scripts/datos-semana/azar.ts` — generador con semilla y datos colombianos inventados (nombres, cédulas, teléfonos, placas `ABC123` sin chocar con las existentes).
- `scripts/datos-semana/verificacion.ts` — cuadre final.
- `scripts/cli/datos-semana.ts` — punto de entrada; `package.json`: `"datos:semana": "tsx scripts/cli/datos-semana.ts"`.
- Tests `*.test.ts` al lado de cada archivo, como los demás scripts.

## Qué crea

**Calendario:** lunes a sábado, 7:30 a. m. – 6:00 p. m. hora de Bogotá; domingos sin movimiento. Horas al azar pero en orden lógico (la caja abre antes del primer cobro, una orden se factura después de terminar…).

**Catálogo previo:** usa mecánicos (`ROLES_MECANICO`), repuestos, servicios, proveedores, bodegas y categorías de gasto existentes. Si falta algo indispensable crea lo mínimo, marcado (un par de proveedores, una categoría, unos repuestos básicos). Sin mecánicos se detiene.

**Volumen por día y sede:**

| | bajo | medio | alto |
|---|---|---|---|
| Órdenes nuevas | 3 | 6 | 10 |
| Citas | 2 | 4 | 6 |
| Cotizaciones | 1 | 3 | 5 |
| Ventas de mostrador | 2 | 4 | 8 |
| Gastos | 1 | 2 | 4 |

**Cada día, por sede:**

1. **Caja:** abre en la mañana con base y cierra en la tarde con arqueo (a veces con una pequeña diferencia). Si el rango termina hoy, la caja de hoy queda abierta.
2. **Clientes y vehículos:** nuevos o existentes según la respuesta; algunos con SOAT o tecnomecánica por vencer en las próximas semanas (Vencimientos).
3. **Citas:** mayoría completadas (se vuelven orden), algunas confirmadas/programadas para días siguientes, alguna cancelada.
4. **Cotizaciones** con repuestos y mano de obra: unas aprobadas (se vuelven orden), otras enviadas con seguimiento, rechazadas o vencidas.
5. **Órdenes** que avanzan a lo largo del rango: recepción (kilometraje, daños), checklist DVI, repuestos (descuentan stock) y mano de obra repartida entre mecánicos (incluido el Jefe de taller). Las de los últimos días quedan en proceso o terminadas; ~1 de cada 20 anulada; alguna en borrador. Las entregadas llevan acta firmada; algunas, garantía.
6. **Facturas y pagos:** toda orden entregada se factura; ~7 de cada 10 pagadas completas, el resto con saldo o pendientes (cartera). Pagos en efectivo, tarjeta y transferencia; algunos anticipos al recibir. El efectivo solo con la caja abierta.
7. **Mostrador:** ventas al contado y algunas fiadas a clientes; alguna devolución parcial. Solo vende con stock.
8. **Gastos:** del día y las recurrentes del periodo cuando les toque.

**A lo largo del rango:** pedidos de compra (unos recibidos con entrada de mercancía → sube stock y crea cuenta por pagar; otros enviados), abonos a cuentas por pagar, y al menos dos repuestos bajo el mínimo (alertas de inventario).

**Al final (opcional):** liquidación de mecánicos del periodo según su esquema.

## Validaciones y errores

- Antes de escribir: conexión a `taller_dev`, mecánicos existentes, fechas válidas. Si algo falla, se detiene sin tocar la base.
- Durante: transacción por día y sede (D7).

## Verificación de cuadre (al final)

1. Facturas: estado coherente con lo pagado (pagada ⇔ saldo 0).
2. Stock por repuesto tocado = inicial + entradas − usado en órdenes − vendido + devuelto; ninguno negativo.
3. Cada caja cerrada cuadra con sus movimientos en efectivo (cobros, ventas, devoluciones, anticipos, gastos y abonos en efectivo).
4. Cuentas por pagar: saldo = total de la entrada − abonos.

Un descuadre se muestra en rojo con detalle y no borra nada: es una pista de un error del script o de la app.

## Pruebas

- `plan.ts` (sin base): misma semilla ⇒ mismo plan; sin domingos ni futuro; horas en horario; órdenes avanzan en orden lógico; volúmenes por nivel.
- Cada flujo con la base simulada (patrón del proyecto): usa las funciones de `src/lib`, respeta caja abierta para efectivo, no vende sin stock, marca `[datos-semana]`, no toca datos protegidos (D4).
- `verificacion.ts`: detecta descuadres armados a propósito.
- La punta a punta contra la base real no se automatiza: primera corrida juntos con volumen bajo y un solo día, revisando el dashboard.

## Fuera de alcance

Comando de borrado; crear usuarios o sedes; otros tenants; enviar correos o WhatsApp; datos en fechas futuras.
