# Fase 17 — Caja diaria, cartera y anticipos (spec + plan de tareas)

> Rama: `fase17-caja-cartera-anticipos` · Roadmap ítems 3, 4 y 5
> (`docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`).
> Documento **autocontenido**: puede ejecutarlo cualquier agente (Claude, DeepSeek, etc.)
> sin el historial de la conversación. Leer completo antes de empezar.

---

## 0. Instrucciones para el agente ejecutor (OBLIGATORIAS)

1. Leer antes de tocar código: `AGENTS.md` (este Next.js 16 tiene cambios incompatibles: consultar
   `node_modules/next/dist/docs/` antes de usar APIs de Next), `RULES.md` y `PROJECT_BRIEF.md`.
2. Trabajar **solo** en la rama `fase17-caja-cartera-anticipos` (ya existe). No tocar `main`.
3. **Una tarea a la vez.** Al terminar cada tarea:
   - `npx tsc --noEmit` limpio y `npm test` completo pasando (pegar el resumen "Test Files / Tests").
   - `npx eslint <archivos tocados>` sin errores.
   - Commit con mensaje `fase17-task N: <descripción>` y trailer
     `Co-Authored-By: <modelo que ejecuta> <noreply@...>`; `git push`.
   - **DETENERSE y pedir aprobación al usuario** con un reporte de 3–5 líneas (qué se hizo, hash,
     tests). No empezar la siguiente tarea sin un "sí" explícito.
4. **No reintentos automáticos** (RULES §1): máximo 1 corrección por error; si vuelve a fallar,
   detenerse y reportar.
5. **Nunca aplicar migraciones a ninguna base de datos.** La única base configurada en `.env`
   (`100.87.12.1`) es **la misma de producción**. Se aplica al final, con aprobación explícita del
   usuario y respaldo previo (ver §6).
6. TDD: escribir primero los tests indicados, verlos fallar, implementar, verlos pasar.
7. Archivos con finales de línea CRLF: preferir edición por reemplazo exacto, no `sed`.
8. Español en toda la UI y mensajes. Seguir los patrones de la Fase 16 (archivos citados abajo).

### Patrones del proyecto a reutilizar (leerlos)
- Server actions con guard → Zod → BD → `revalidatePath`: `src/app/actions/gasto-actions.ts`,
  `src/app/actions/gasto-recurrente-actions.ts`; validaciones de sede/categoría compartidas en
  `src/lib/gastos/validaciones-db.ts` (`resolverSede`: RECEPCION siempre usa su sede activa).
- Guards: `requireRole([...])` / `requireSession()` de `src/lib/auth/guards.ts`; sesión
  `session.user.{ id, role, tenantSchema, sedeActivaId, sedeActivaNombre }`; roles `ADMIN | TECNICO | RECEPCION`.
- BD por tenant: `getTenantDb(session.user.tenantSchema)` (`src/lib/db/tenant-client.ts`).
- Errores Prisma: `friendlyPrismaErrorMessage(err, "fallback")` (`src/lib/db/prisma-error-message.ts`).
- Dinero: `roundMoney` (`src/lib/money/round.ts`); los `Decimal` se convierten a `number` antes de
  llegar a componentes cliente. Formato COP: `Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })`.
- Fechas: día calendario de Bogotá con `formatoDiaBogota` / `inicioDiaBogota` (`src/lib/fecha-bogota.ts`).
- UI: página de lista `src/app/(dashboard)/gastos/page.tsx` (+ `gastos-table.tsx`, `gasto-dialog.tsx`,
  `loading.tsx`), `KpiCard` (`src/components/ui/kpi-card.tsx`), `DataTable` (`src/components/data-table.tsx`),
  confirmación `ConfirmacionEnLinea` (`src/components/confirmacion-en-linea.tsx`), toasts `sonner`
  (en `startTransition` envolver en try/catch con `toast.error`).
- Menú: `src/app/(dashboard)/dashboard-sidebar.tsx` (prop `puedeVerGastos` calculada en `layout.tsx`).
- WhatsApp: solo enlace `wa.me` con `urlWhatsapp(telefono, texto)` (`src/lib/whatsapp/url.ts`);
  `window.open` síncrono en el clic.
- Migraciones: generar SQL sin BD con
  `npx prisma migrate diff --from-schema-datamodel <schema-anterior> --to-schema-datamodel prisma/tenant/schema.prisma --script`.

---

## 1. Objetivo y decisiones (revisar/aprobar antes de ejecutar)

Que el taller (a) **abra y cierre caja** por sede cada día y cuadre el efectivo, (b) vea su
**cartera** (facturas con saldo) por cliente y antigüedad y pueda cobrar por WhatsApp, y
(c) reciba **anticipos** (abonos) antes de facturar, que se descuentan solos al facturar.

Decisiones tomadas (cambiables antes de empezar):

| # | Decisión |
|---|---|
| D1 | Caja **por sede**, una sesión abierta a la vez por sede. Abre/cierra ADMIN o RECEPCION. |
| D2 | La caja **no guarda movimientos propios**: el resumen se calcula de los pagos, anticipos, devoluciones y gastos en efectivo registrados entre la apertura y el cierre. |
| D3 | Registrar pagos/anticipos **no exige** caja abierta (para no frenar la operación); si no hay caja abierta, la página `/caja` lo advierte. |
| D4 | Efectivo esperado = base inicial + pagos en EFECTIVO + anticipos en EFECTIVO − devoluciones de anticipo en EFECTIVO − gastos marcados "pagado en efectivo de la caja". Cierre: efectivo contado, diferencia (sobrante/faltante) y notas. |
| D5 | `Gasto` gana `pagadoEnEfectivo` (checkbox en el diálogo de gasto, por defecto no). |
| D6 | **Anticipo** = dinero recibido sobre una orden **sin factura**. Estados: PENDIENTE, APLICADO, DEVUELTO. Registra ADMIN/RECEPCION; devuelve solo ADMIN. |
| D7 | Al **crear la factura** de una orden, sus anticipos PENDIENTES se aplican automáticamente como `Pago` con método nuevo `ANTICIPO` (descuentan el saldo; si llega a 0 la factura queda PAGADA). Los pagos `ANTICIPO` **no** cuentan en la caja (ese dinero entró el día del anticipo). |
| D8 | Si la suma de anticipos supera el total de la factura, **no se factura**: "Los anticipos superan el total de la factura. Devuelve el excedente antes de facturar." |
| D9 | Una orden ANULADA con anticipos PENDIENTES muestra el aviso "Hay anticipos por devolver" en su detalle. |
| D10 | **Cartera** = facturas PENDIENTE con saldo > 0, de la sede activa (ADMIN puede elegir sede). Antigüedad por días desde la emisión: 0–30, 31–60, 61–90, > 90. Vista agrupada por cliente con botón "Cobrar por WhatsApp". ADMIN y RECEPCION. |
| D11 | Fuera de alcance: cuentas por pagar, conciliación bancaria, múltiples cajas por sede, impresión de recibos. |

---

## 2. Modelo de datos (Task 1)

```prisma
enum EstadoAnticipo {
  PENDIENTE
  APLICADO
  DEVUELTO
}

// En enum MetodoPago existente, agregar al final:
//   ANTICIPO

/// Dinero recibido sobre una orden antes de facturar.
model Anticipo {
  id              String         @id @default(cuid())
  ordenId         String         @map("orden_id")
  orden           OrdenTrabajo   @relation(fields: [ordenId], references: [id], onDelete: Restrict)
  sedeId          String         @map("sede_id")
  sede            Sede           @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  monto           Decimal        @db.Decimal(10, 2)
  metodoPago      MetodoPago     @map("metodo_pago")
  referencia      String?
  estado          EstadoAnticipo @default(PENDIENTE)
  registradoPorId String         @map("registrado_por_id")
  registradoPor   Usuario        @relation("AnticiposRegistrados", fields: [registradoPorId], references: [id], onDelete: Restrict)
  pagoId          String?        @unique @map("pago_id")
  pago            Pago?          @relation(fields: [pagoId], references: [id], onDelete: SetNull)
  devueltoAt      DateTime?      @map("devuelto_at")
  devueltoPorId   String?        @map("devuelto_por_id")
  devueltoPor     Usuario?       @relation("AnticiposDevueltos", fields: [devueltoPorId], references: [id], onDelete: SetNull)
  metodoDevolucion MetodoPago?   @map("metodo_devolucion")
  createdAt       DateTime       @default(now()) @map("created_at")

  @@index([ordenId])
  @@index([sedeId, createdAt])
  @@map("anticipos")
}

/// Sesión de caja de una sede: de la apertura al cierre.
model CajaSesion {
  id              String    @id @default(cuid())
  sedeId          String    @map("sede_id")
  sede            Sede      @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  baseInicial     Decimal   @map("base_inicial") @db.Decimal(12, 2)
  abiertaAt       DateTime  @default(now()) @map("abierta_at")
  abiertaPorId    String    @map("abierta_por_id")
  abiertaPor      Usuario   @relation("CajasAbiertas", fields: [abiertaPorId], references: [id], onDelete: Restrict)
  cerradaAt       DateTime? @map("cerrada_at")
  cerradaPorId    String?   @map("cerrada_por_id")
  cerradaPor      Usuario?  @relation("CajasCerradas", fields: [cerradaPorId], references: [id], onDelete: SetNull)
  efectivoEsperado Decimal? @map("efectivo_esperado") @db.Decimal(12, 2)
  efectivoContado Decimal?  @map("efectivo_contado") @db.Decimal(12, 2)
  notas           String?

  @@index([sedeId, abiertaAt])
  @@map("cajas_sesion")
}
```

Relaciones inversas a agregar: `OrdenTrabajo.anticipos Anticipo[]`; `Sede.anticipos Anticipo[]`,
`Sede.cajas CajaSesion[]`; `Pago.anticipo Anticipo?`; `Usuario`: `anticiposRegistrados Anticipo[] @relation("AnticiposRegistrados")`,
`anticiposDevueltos Anticipo[] @relation("AnticiposDevueltos")`, `cajasAbiertas CajaSesion[] @relation("CajasAbiertas")`,
`cajasCerradas CajaSesion[] @relation("CajasCerradas")`. En `Gasto`: `pagadoEnEfectivo Boolean @default(false) @map("pagado_en_efectivo")`.

"Una caja abierta por sede": índice único parcial que Prisma no modela; agregarlo **a mano al final
de la migración** y reforzarlo en la action:

```sql
CREATE UNIQUE INDEX "cajas_sesion_una_abierta_por_sede" ON "cajas_sesion"("sede_id") WHERE "cerrada_at" IS NULL;
```

---

## 3. Tareas

### Task 1: Esquema, migración y validación

**Archivos:** `prisma/tenant/schema.prisma`; `prisma/tenant/migrations/20261012120000_caja_cartera_anticipos/migration.sql`;
`src/lib/validation/caja.ts` (+ `caja.test.ts`).

Pasos:
1. Agregar al schema lo de §2. Generar la migración:
   `git show main:prisma/tenant/schema.prisma > "$TEMP/antes.prisma"` y
   `npx prisma migrate diff --from-schema-datamodel "$TEMP/antes.prisma" --to-schema-datamodel prisma/tenant/schema.prisma --script > prisma/tenant/migrations/20261012120000_caja_cartera_anticipos/migration.sql`
   (crear la carpeta antes). Verificar que incluya `ALTER TYPE "MetodoPago" ADD VALUE 'ANTICIPO';`
   y agregar al final el índice parcial de §2. `npx prisma validate` y `npx prisma generate`
   (si `generate` falla con EPERM en Windows, hay un `next dev` corriendo que bloquea el DLL: detenerlo).
2. `tsc` marcará los `Record<MetodoPago, string>` existentes (p. ej. `src/app/(dashboard)/facturas/[id]/page.tsx`):
   agregar `ANTICIPO: "Anticipo"`. Los selectores de método de pago donde el usuario elige **no** deben ofrecer `ANTICIPO`.
3. `src/lib/validation/caja.ts` — tests primero:
   - `abrirCajaInputSchema = z.object({ baseInicial: z.coerce.number().min(0, "La base no puede ser negativa").max(MONTO_MAXIMO, "El monto es demasiado alto") })`
   - `cerrarCajaInputSchema = z.object({ efectivoContado: <igual que baseInicial>, notas: z.string().trim().max(300).optional().transform(v => v || undefined) })`
   - `anticipoInputSchema = z.object({ monto: z.coerce.number().positive("El monto debe ser mayor que cero").max(MONTO_MAXIMO, ...), metodoPago: z.enum(["EFECTIVO","TARJETA","TRANSFERENCIA","OTRO"], { error: "Selecciona un método de pago" }), referencia: z.string().trim().max(60).optional().transform(v => v || undefined) })`
   - `devolverAnticipoInputSchema = z.object({ metodoDevolucion: <mismo enum> })`
   - `MONTO_MAXIMO` se importa de `src/lib/validation/gasto.ts`.
   Tests: casos válidos, base negativa, monto 0, método `ANTICIPO` rechazado, notas recortadas.
4. Verificar (§0.3), commit `fase17-task 1: esquema y validación de caja, cartera y anticipos`, **pedir aprobación**.

### Task 2: Lógica pura (cartera y resumen de caja)

**Archivos:** `src/lib/cartera/antiguedad.ts` (+ test), `src/lib/caja/resumen.ts` (+ test). Sin Prisma.

```ts
// src/lib/cartera/antiguedad.ts
export type RangoAntiguedad = "0-30" | "31-60" | "61-90" | "90+";
export interface FacturaCartera { facturaId: string; numero: number; clienteId: string; clienteNombre: string; clienteTelefono: string | null; emitidaAt: Date; total: number; saldo: number; }
export interface ClienteCartera { clienteId: string; clienteNombre: string; clienteTelefono: string | null; saldoTotal: number; porRango: Record<RangoAntiguedad, number>; facturas: (FacturaCartera & { dias: number; rango: RangoAntiguedad })[]; diasMasAntigua: number; }
export function diasDesde(emitidaAt: Date, ahora: Date): number; // días calendario Bogotá (usar formatoDiaBogota en ambos y restar), nunca negativo
export function rangoDe(dias: number): RangoAntiguedad;          // 0–30, 31–60, 61–90, >90
export function agruparCartera(facturas: FacturaCartera[], ahora: Date): { clientes: ClienteCartera[]; totales: Record<RangoAntiguedad, number> & { total: number } };
// clientes ordenados por saldoTotal desc; facturas de cada cliente por dias desc; montos con roundMoney.
```

Tests mínimos: bordes 30/31, 60/61, 90/91; factura emitida a las 23:00 de Bogotá cuenta como ese día;
dos clientes con varias facturas → totales por rango y orden correctos.

```ts
// src/lib/caja/resumen.ts
export type Metodo = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "OTRO";
export interface MovimientosCaja {
  pagos: { monto: number; metodo: Metodo }[];          // pagos de facturas (sin ANTICIPO)
  anticipos: { monto: number; metodo: Metodo }[];      // anticipos recibidos en la ventana
  devoluciones: { monto: number; metodo: Metodo }[];   // anticipos devueltos en la ventana
  gastosEfectivo: number[];                             // montos de gastos pagadoEnEfectivo
}
export interface ResumenCaja {
  ingresosPorMetodo: Record<Metodo, number>;  // pagos + anticipos
  egresosEfectivo: number;                    // devoluciones en EFECTIVO + gastos en efectivo
  devolucionesOtrosMetodos: number;           // devoluciones no-efectivo (informativo)
  efectivoEsperado: number;                   // base + ingresos EFECTIVO − egresosEfectivo
  totalIngresos: number;
}
export function calcularResumenCaja(baseInicial: number, movimientos: MovimientosCaja): ResumenCaja;
export function diferenciaCierre(esperado: number, contado: number): { diferencia: number; tipo: "CUADRA" | "SOBRANTE" | "FALTANTE" };
```

Tests: ejemplo base 200.000 + pagos (EFECTIVO 500.000, TARJETA 300.000) + anticipo EFECTIVO 100.000 −
devolución EFECTIVO 50.000 − gasto efectivo 30.000 → esperado 720.000, totalIngresos 900.000;
diferencia 0 → CUADRA, +10.000 → SOBRANTE, −5.000 → FALTANTE.

Verificar, commit `fase17-task 2: lógica de antigüedad de cartera y resumen de caja`, **pedir aprobación**.

### Task 3: Anticipos (registrar, devolver, aplicar al facturar)

**Archivos:** `src/app/actions/anticipo-actions.ts` (+ test); `src/app/actions/factura-actions.ts` (+ test);
UI en el detalle de la orden `src/app/(dashboard)/ordenes/[id]/` (componente nuevo `anticipos-section.tsx` + test).

- `listAnticiposDeOrden(ordenId)` — ADMIN/RECEPCION/TECNICO (lectura); montos como number.
- `registrarAnticipoAction(ordenId, prev, formData)` — ADMIN/RECEPCION. La orden debe existir en la
  sede activa (mismo criterio de alcance que usan las acciones de orden), no estar ANULADA ni tener
  factura ("La orden ya está facturada"). Crea `Anticipo` con `sedeId` de la orden. Revalida la orden.
- `devolverAnticipoAction(anticipoId, prev, formData)` — ADMIN. Solo PENDIENTE ("Este anticipo ya fue
  aplicado o devuelto"). Marca DEVUELTO con `devueltoAt`, `devueltoPorId`, `metodoDevolucion`.
- **Aplicación al facturar**: dentro de la transacción existente de `crearFacturaAction`, después de
  crear la factura: leer anticipos PENDIENTE de la orden; si su suma > total → lanzar y devolver el
  mensaje de D8 (la transacción se revierte); si no, por cada anticipo crear `Pago { metodoPago: "ANTICIPO", monto, referencia: "Anticipo", registradoPorId: anticipo.registradoPorId }`,
  marcarlo APLICADO con `pagoId`, decrementar `saldoPendiente` y, si queda en 0, `estado: "PAGADA"`.
  Tests: factura sin anticipos (igual que hoy), con anticipos parciales (saldo correcto), que cubren
  todo (PAGADA), y que exceden (error y nada creado).
- UI `anticipos-section.tsx` en el detalle de la orden (visible si la orden no está facturada o tiene
  anticipos): lista (fecha, monto, método, estado, registrado por), formulario "Registrar anticipo"
  (monto, método sin ANTICIPO, referencia) para ADMIN/RECEPCION mientras no haya factura ni esté
  ANULADA; botón "Devolver" (ADMIN, solo PENDIENTE) con diálogo de método de devolución y
  `ConfirmacionEnLinea`; aviso D9 si la orden está ANULADA con anticipos PENDIENTES. Mostrar
  "Anticipos: $X" junto al total de la orden.
- En el detalle de la factura, los pagos `ANTICIPO` se muestran con la etiqueta "Anticipo".

Verificar, commit `fase17-task 3: anticipos sobre órdenes aplicados al facturar`, **pedir aprobación**.

### Task 4: Caja diaria

**Archivos:** `src/app/actions/caja-actions.ts` (+ test); `src/app/(dashboard)/caja/page.tsx`,
`loading.tsx`, `abrir-caja-form.tsx`, `cerrar-caja-form.tsx` (+ tests); `gasto-dialog.tsx` y
`gasto-actions.ts` (checkbox `pagadoEnEfectivo`); sidebar/layout.

- `getCajaActual({ sedeId? })` — ADMIN/RECEPCION (`resolverSede`). Devuelve la sesión abierta de la
  sede (o null) y, si hay, su `ResumenCaja` calculado con `calcularResumenCaja` sobre la ventana
  `[abiertaAt, ahora)`: pagos de facturas cuya `orden.sedeId` = sede y `metodoPago != ANTICIPO`;
  anticipos de la sede con `createdAt` en la ventana; devoluciones con `devueltoAt` en la ventana;
  gastos de la sede con `pagadoEnEfectivo` y `createdAt` en la ventana. Incluye la lista de
  movimientos (hora, tipo, descripción, método, monto) para la tabla.
- `abrirCajaAction(prev, formData)` — ADMIN/RECEPCION; falla con "Ya hay una caja abierta en esta
  sede" si existe (y también si el índice parcial lanza P2002).
- `cerrarCajaAction(cajaId, prev, formData)` — ADMIN/RECEPCION; solo si está abierta y es de la sede
  permitida; recalcula el esperado en el servidor (no confiar en el cliente), guarda `cerradaAt`,
  `cerradaPorId`, `efectivoEsperado`, `efectivoContado`, `notas`.
- `listCajasCerradas({ sedeId?, periodo? })` — historial del mes (fecha, abrió/cerró, base,
  esperado, contado, diferencia con `diferenciaCierre`).
- Página `/caja` (ADMIN/RECEPCION): si no hay caja abierta → aviso "La caja está cerrada" + formulario
  de apertura (base inicial). Si está abierta → KPIs (base, ingresos por método, egresos en efectivo,
  efectivo esperado), tabla de movimientos y formulario de cierre (efectivo contado, notas) que
  muestra la diferencia en vivo (CUADRA/SOBRANTE/FALTANTE) y pide `ConfirmacionEnLinea` antes de
  cerrar. Debajo, historial del mes. ADMIN puede cambiar de sede (selector como `/gastos`).
- Gasto: checkbox "Pagado en efectivo de la caja" en `gasto-dialog.tsx`; `gasto-actions.ts` lo
  guarda (crear y actualizar). Tests.
- Menú: "Caja" en Operación para ADMIN/RECEPCION (reusar `puedeVerGastos`, renombrándolo a
  `puedeVerFinanzas` si se prefiere, actualizando sus usos).

Tests clave: abrir dos veces → error; cerrar recalcula el esperado ignorando lo enviado; RECEPCION
forzada a su sede; TECNICO rechazado; pagos ANTICIPO excluidos del resumen.

Verificar, commit `fase17-task 4: caja diaria con apertura, arqueo y cierre`, **pedir aprobación**.

### Task 5: Cartera por antigüedad

**Archivos:** `src/app/actions/cartera-actions.ts` (+ test); `src/app/(dashboard)/cartera/page.tsx`,
`loading.tsx`, `cartera-table.tsx`, `cobrar-whatsapp-button.tsx` (+ tests); sidebar.

- `getCartera({ sedeId? })` — ADMIN/RECEPCION (`resolverSede`). Facturas `estado: PENDIENTE`,
  `saldoPendiente > 0`, `orden.sedeId` = sede, con cliente (nombre, teléfono). Devuelve
  `agruparCartera(...)` y, por cliente, `urlWhatsapp` con el texto (armado en servidor):
  "Hola <nombre>, te recordamos que tienes un saldo pendiente de $<saldo> con <taller> (facturas
  <n°s>). Puedes pagar en el taller o por transferencia. ¡Gracias!". Nombre del taller como en
  `src/app/actions/vencimiento-actions.ts` (`nombreTaller`).
- Página `/cartera`: KPIs (Total en cartera, 0–30, 31–60, 61–90, > 90 — el de > 90 en rojo);
  tabla por cliente (cliente, # facturas, saldo, factura más antigua en días, columnas por rango)
  con fila expandible o enlace a cada factura (`/facturas/<id>`); botón "Cobrar por WhatsApp"
  (deshabilitado sin teléfono, `window.open` síncrono). ADMIN puede cambiar de sede.
- Menú: "Cartera" en Operación para ADMIN/RECEPCION. El KPI "Cartera" del dashboard enlaza a `/cartera`.

Verificar, commit `fase17-task 5: cartera por cliente y antigüedad con cobro por WhatsApp`, **pedir aprobación**.

---

## 4. Seguridad

Todo por `getTenantDb` con el tenant de la sesión; guard antes de cualquier lectura/escritura;
RECEPCION siempre en su sede activa; TECNICO sin acceso a caja ni cartera; montos y textos validados
con Zod; el resumen de caja y el esperado del cierre se calculan siempre en el servidor.

## 5. Verificación final de la fase

`npx tsc --noEmit`, `npm test` completo y `npx eslint` en lo tocado. Revisión del diff completo de la
rama contra este documento. Reporte al usuario.

## 6. Cierre (solo con aprobación del usuario)

1. Respaldo: `pg_dump` en el servidor (`~/backups/torqueflow_<fecha>_pre_fase17.sql`), ver
   `docs/DEPLOY.md`.
2. Aplicar la migración a cada schema de tenant (`taller_dev`, `taller_dev_reference`) con
   `TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=<schema>" npx prisma migrate deploy --schema=prisma/tenant/schema.prisma`
   y verificar `prisma migrate diff --from-url ... --to-schema-datamodel ...` vacío.
3. Dejar `npm run dev` corriendo para la prueba manual del usuario.
4. Con el visto bueno: `git checkout main && git pull && git merge --no-ff fase17-caja-cartera-anticipos` y push.
