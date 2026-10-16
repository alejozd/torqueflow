# Plan — Rediseño del Mostrador

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/mostrador` en una pantalla de venta rápida con teclado (esquema de la cotización), cobro mixto, comprobante, pestaña de Ventas con devoluciones de hasta 30 días, y ventas a crédito visibles en Cartera.

**Architecture:** Las reglas nuevas (pagos, tope de descuento, plazo de devolución) van en funciones puras de `src/lib/mostrador/` con tests; las server actions las usan. La pantalla Vender es un carrito en estado local (no se guarda nada hasta cobrar) que reutiliza el buscador, el resumen y el editor de descuento de la cotización, extraídos a componentes compartidos. Ventas es una segunda pestaña con `DataTable`.

**Tech Stack:** Next.js (leer `node_modules/next/dist/docs/` antes de tocar APIs de Next), React, Tailwind, Prisma (tenant), Zod, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-15-mostrador-rediseno-propuesta.md` (decisiones D1-D5 al inicio). Maqueta: `docs/Evidencias/mostrador/propuesta.html`.

## Global Constraints

- Rama `mostrador-rediseno` desde `main`. Commits `mostrador-task N: descripción` + push tras cada task (RULES.md §3). Merge `--no-ff` a `main` al cerrar.
- Español de Colombia, lenguaje sencillo. KPI en una fila. Sin librerías nuevas. Gráficos solo CSS.
- WhatsApp solo por enlace wa.me; correo solo por SMTP. Nada de envíos masivos.
- Acciones destructivas con `ConfirmacionEnLinea`.
- Roles: vender, cobrar y devolver = `ADMIN` y `RECEPCION` (`ROLES_MOSTRADOR`); TECNICO no entra.
- D2: RECEPCION descuenta hasta `descuentoMaxRecepcion` % (por defecto 10); ADMIN sin tope. El servidor lo hace cumplir.
- D3: dejar saldo pendiente exige cliente registrado.
- D4: devolver hasta 30 días desde la venta; venta de una caja ya cerrada → solo ADMIN.
- Se conserva la lógica que ya funciona: precios del servidor (M2), descuento de stock con guarda en la transacción, `calcularTotalesVenta`, `totalDevolucion`, `montoADevolverPermitido`, `montoEnEfectivo`, `exigirCajaParaEfectivo`.
- `tsc --noEmit`, tests y eslint al final de cada task. No tocar backlog de fases anteriores (RULES.md §7).
- Una sola migración de tenant (Task 1). Recordar en el traspaso que el despliegue la necesita.

---

### Task 1: Tope de descuento de recepción (opción del taller)

**Files:**
- Modify: `prisma/tenant/schema.prisma` (`ConfiguracionTaller`: `descuentoMaxRecepcion Int @default(10) @map("descuento_max_recepcion")`) + migración de tenant (seguir cómo se hicieron las de `exigirActaFirmada`/`usarControlCaja`: buscar en `prisma/tenant/migrations` y el script de migración de tenants en `package.json`).
- Modify: `src/lib/configuracion/opciones-taller.ts` (`OpcionesTaller` gana `descuentoMaxRecepcion: number`; por defecto 10; lector).
- Modify: `src/app/actions/configuracion-taller-actions.ts` (`guardarOpcionesTallerAction` lee y valida 0-100 entero).
- Modify: el formulario de opciones del taller en `/configuracion-smtp` (campo numérico "Descuento máximo para recepción (%)").
- Tests: los existentes de opciones/acción + casos nuevos (valor por defecto, rango inválido rechazado).

**Interfaces:**
- Produces: `OpcionesTaller.descuentoMaxRecepcion: number`; `leerOpcionesTaller(db)` lo devuelve.

- [ ] Test que falla → implementar → test pasa → `npx prisma generate` según el proyecto → tsc → commit `mostrador-task 1: tope de descuento para recepción como opción del taller` + push.

---

### Task 2: Reglas de cobro y acción de venta con pagos mixtos

**Files:**
- Create: `src/lib/mostrador/cobro.ts` + `cobro.test.ts`
- Modify: `src/app/actions/venta-mostrador-actions.ts` (`crearVentaMostradorAction`) + su test.

**Interfaces (Produces):**
```ts
export interface PagoEntrada { metodoPago: MetodoPago; monto: number; referencia?: string | null }
/** Suma de pagos; vueltas = exceso pagado en EFECTIVO sobre el total (nunca de otro método). */
export function resumirPagos(total: number, pagos: PagoEntrada[], recibidoEfectivo: number | null):
  { pagado: number; saldo: number; vueltas: number; error: string | null };
export function porcentajeDescuento(subtotal: number, descuento: number): number;
export function descuentoPermitido(rol: "ADMIN" | "RECEPCION", porcentaje: number, tope: number): boolean;
```
Reglas (tests obligatorios para cada una):
- Pagos con monto ≤ 0 → error. Suma de pagos > total → error, salvo que el exceso salga del efectivo recibido (vueltas).
- `saldo = total − pagado` (≥ 0). Saldo > 0 sin cliente → error "Para dejar saldo pendiente elige un cliente registrado".
- RECEPCION con descuento > tope → error "Tu descuento máximo es N %"; ADMIN sin tope.
- La acción recibe `pagos` como JSON en el `FormData` (campo `pagos`), validado con Zod; reemplaza `cobrarTodo`/`metodoPago` sueltos. Crea un `PagoVentaMostrador` por pago dentro de la misma transacción; `saldoPendiente` = saldo; estado PAGADA si saldo 0.
- Efectivo sigue exigiendo caja solo si hay pago en EFECTIVO (`exigirCajaParaEfectivo`); al cajón entra el efectivo neto (monto del pago, no lo recibido).
- La acción devuelve `{ ventaId, numero, total, pagos, vueltas }` en éxito para la tarjeta de venta cobrada.

- [ ] Tests de `cobro.ts` (RED) → implementar → tests de la acción ampliados (pago mixto crea 2 pagos; saldo sin cliente rechazado; tope por rol) → tsc → commit `mostrador-task 2: cobro mixto, crédito solo con cliente y tope de descuento en el servidor` + push.

---

### Task 3: Búsqueda en servidor y buscador compartido

**Files:**
- Create: `src/components/buscador-conceptos.tsx` extraído de `src/app/(dashboard)/cotizaciones/[id]/buscador-conceptos.tsx`, con la acción de búsqueda y el render de cada resultado inyectables; la cotización pasa a usarlo sin cambio visible (sus tests deben seguir pasando).
- Modify: `src/app/actions/venta-mostrador-actions.ts`: `buscarParaMostradorAction(q: string)` → repuestos de la sede con `disponible` (stock − comprometido, misma cuenta que hoy hace `getMostradorDatos`), límite 20; si `q` coincide exacto con un código, ese va primero y se marca `exacto: true`. `getMostradorDatos` deja de mandar todo el inventario (P10).
- Tests: acción (filtro, límite, exacto primero, disponible) y buscador compartido (flechas, Enter, resultado sin unidades no se agrega).

- [ ] Commit `mostrador-task 3: búsqueda de repuestos en servidor y buscador compartido con la cotización` + push.

---

### Task 4: Carrito con teclado

**Files:**
- Create: `src/app/(dashboard)/mostrador/tabla-carrito.tsx`, `use-carrito.ts` (estado local puro: agregar con fusión +1, cambiar cantidad con tope = disponible, quitar, vaciar, línea libre), `use-atajos-mostrador.ts`; tests de `use-carrito` y de la tabla.
- Retirar `carrito-mostrador.tsx` cuando la nueva pantalla lo reemplace (Task 5 lo conecta; aquí se puede dejar sin usar).

Comportamiento (spec §3.3, §4.1, §4.4): buscador como última fila con foco al entrar; código exacto se agrega solo; repetir = +1; − / + con tope y chip de disponibilidad (verde/ámbar/rojo, `lib/cotizacion/disponibilidad.ts` con `disponible`); quitar y vaciar con `ConfirmacionEnLinea`; atajos F1 o `/`, ↑ desde el buscador, `+`/`−`, Supr, Esc. Pie "N productos · M unidades".

- [ ] Commit `mostrador-task 4: carrito con teclado, fusión de repetidos y tope por disponible` + push.

---

### Task 5: Resumen, descuento y tarjeta de cobro

**Files:**
- Create: `src/components/resumen-economico.tsx` generalizado desde `cotizaciones/[id]/resumen-cotizacion.tsx` (la cotización lo usa sin cambio visible); editor %/$ compartido en modo local (sin guardar) desde `descuento-cotizacion-form.tsx`.
- Create: `src/app/(dashboard)/mostrador/tarjeta-cobro.tsx` + test: métodos Efectivo/Tarjeta/Transferencia (los valores de `MetodoPago`), Recibido con atajos (Justo y billetes redondos siguientes), Vueltas, "+ Agregar otro método" (la última fila se autocompleta con lo que falta), "Dejar a crédito" solo con cliente, aviso "Queda debiendo $X", Efectivo deshabilitado con motivo si la caja está cerrada y el control de caja está activo. F9 / Ctrl+Enter. Usa `resumirPagos` de Task 2 para mostrar lo mismo que validará el servidor.
- Modify: `src/app/(dashboard)/mostrador/page.tsx`: layout de dos columnas (lateral `sticky top-4`), cabecera con chip de caja; en angosto, barra inferior fija con total y Cobrar. Pestañas Vender / Ventas (Ventas puede mostrar por ahora la tabla actual del día hasta Task 8).
- El descuento muestra el tope cuando el usuario es RECEPCION ("Máximo 10 %").

- [ ] Commit `mostrador-task 5: resumen, descuento y tarjeta de cobro con pago mixto` + push.

---

### Task 6: Cliente con búsqueda y creación rápida

**Files:**
- Create: `src/app/(dashboard)/mostrador/selector-cliente.tsx` + test, con `components/ui/combobox.tsx` y búsqueda en servidor por nombre, documento, teléfono o placa (acción nueva en `venta-mostrador-actions.ts` o reutilizar una de clientes si ya existe; buscar antes). Tarjeta del cliente: nombre, documento, teléfono, saldo pendiente en mostrador (ámbar). "Consumidor final" por defecto. F2.
- `Dialog` "Crear cliente rápido" (nombre, teléfono, documento) reutilizando la acción y validación de clientes existentes.

- [ ] Commit `mostrador-task 6: buscar cliente por nombre, documento, teléfono o placa y crearlo rápido` + push.

---

### Task 7: Venta cobrada y comprobante

**Files:**
- Create: `src/app/(dashboard)/mostrador/venta-cobrada.tsx` + test: "Venta #N cobrada · $total · métodos · Vueltas $X", botones Imprimir, Enviar por WhatsApp (wa.me con texto, `lib/whatsapp/url`), Enviar por correo (SMTP, solo si el cliente tiene correo; seguir el patrón de `cotizaciones/[id]/enviar-cotizacion-form.tsx`), "Nueva venta (Enter)".
- Create: ruta imprimible del comprobante (ej. `src/app/(dashboard)/mostrador/[id]/comprobante/page.tsx` o el patrón de impresión que ya use la app — buscar "imprimir"/"print" antes de decidir).
- Si el servidor responde stock insuficiente, el carrito no se vacía y la fila afectada se marca.

- [ ] Commit `mostrador-task 7: tarjeta de venta cobrada con comprobante para imprimir, WhatsApp o correo` + push.

---

### Task 8: Pestaña Ventas y devoluciones hasta 30 días

**Files:**
- Create: `src/lib/mostrador/plazo-devolucion.ts` + test: `puedeDevolver({ fechaVenta, ahora, rol, cajaCerrada }): { permitido: boolean; motivo: string | null }` — > 30 días → no; caja cerrada y rol ≠ ADMIN → no.
- "Caja cerrada" (ruling del plan): si el control de caja está activo, la venta pertenece a una caja cerrada cuando no hay caja abierta en la sede o la caja abierta se abrió después de la venta; si el control de caja está apagado, se toma "la venta es de un día anterior (hora Bogotá)".
- Modify: `src/app/actions/devolucion-mostrador-actions.ts` aplica `puedeDevolver` en el servidor + tests.
- Create: `src/app/(dashboard)/mostrador/ventas/` (componentes de la pestaña): KPI en una fila (Vendido hoy · Nº ventas · Efectivo por mostrador · Por cobrar · Devuelto hoy), `DataTable` con Nº, Hora, Cliente, Productos resumidos, Métodos, Total, Saldo, Estado; filtro Hoy / Ayer / Últimos 30 días; búsqueda por número, cliente o producto; acciones Ver, Cobrar saldo y Devolver en `Sheet` (reutilizan `cobrar-venta-form.tsx` y `devolucion-form.tsx`), Imprimir. La devolución muestra cuánto sale del cajón antes de confirmar.
- Acción de listado con rango de fechas (máx. 30 días) en `venta-mostrador-actions.ts` + test.

- [ ] Commit `mostrador-task 8: pestaña de ventas con filtros, cobro de saldo y devoluciones hasta 30 días` + push.

---

### Task 9: Ventas de mostrador en Cartera

**Files:**
- Modify: `src/app/actions/cartera-actions.ts`: además de facturas, trae `VentaMostrador` con `saldoPendiente > 0` (misma sede/filtros) y las normaliza a la fila de cartera con `origen: "MOSTRADOR"`, cliente o "Consumidor final", número "M-<numero>", días de mora desde `createdAt`. Tests.
- Modify: `src/app/(dashboard)/cartera/` tabla y KPI: etiqueta de origen (Factura / Mostrador), enlace "Cobrar" que lleva a Mostrador → Ventas con esa venta abierta; WhatsApp de cobro (wa.me) solo si hay teléfono. Exportar incluye el origen.

- [ ] Commit `mostrador-task 9: ventas de mostrador con saldo pendiente en cartera` + push.

---

### Task 10: Cierre

- [ ] Nota en `docs/TRASPASO-AGENTES.md` (qué cambió, D1-D5, **migración de tenant de Task 1 obligatoria al desplegar**).
- [ ] Revisión final de la rama; dejar la app corriendo para revisión manual del usuario (venta rápida solo con teclado, pago mixto, crédito, devolución de ayer, cartera); merge `--no-ff` a `main` + push tras su visto bueno.

---

### Task 7b: Guardar lo recibido en efectivo y las vueltas (pedido del usuario, 2026-10-16)

**Files:**
- Modify: `prisma/tenant/schema.prisma` (`VentaMostrador`: `recibidoEfectivo Decimal? @map("recibido_efectivo") @db.Decimal(10, 2)`, `vueltas Decimal @default(0) @db.Decimal(10, 2)`) + segunda migración de tenant (mismo estilo que la de Task 1, nombre posterior).
- Modify: `crearVentaMostradorAction` guarda `recibidoEfectivo` (null si no vino) y `vueltas` (de `resumirPagos`) dentro de la misma transacción; tests.
- Modify: comprobante (`src/app/mostrador/[id]/comprobante/`, `cargarComprobante`, texto de WhatsApp y correo) lee recibido y vueltas de la base; se quita el parámetro `?vueltas=` de la URL y de quien la arma; tests.
- Commit `mostrador-task 7b: lo recibido en efectivo y las vueltas quedan guardados en la venta` + push.
