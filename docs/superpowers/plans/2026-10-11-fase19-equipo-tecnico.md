# Fase 19 — Equipo técnico: liquidación de mecánicos, horas y rendimiento (spec + plan de tareas)

> Rama: `fase19-equipo-tecnico` · Roadmap ítems 8, 18 y 21
> (`docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`).
> Documento **autocontenido**: puede ejecutarlo cualquier agente (Claude, DeepSeek, etc.)
> sin el historial de la conversación. Leer completo antes de empezar.
> **Estado: plan escrito, NO ejecutado.** Empezar por la Task 1.

---

## 0. Instrucciones para el agente ejecutor (OBLIGATORIAS)

1. Leer antes de tocar código: `AGENTS.md` (este Next.js 16 tiene cambios incompatibles: consultar
   `node_modules/next/dist/docs/` antes de usar APIs de Next), `RULES.md` y `PROJECT_BRIEF.md`.
2. Trabajar **solo** en la rama `fase19-equipo-tecnico`. No tocar `main`.
3. **Una tarea a la vez.** Al terminar cada tarea:
   - `npx tsc --noEmit` limpio y `npm test` completo pasando (pegar el resumen "Test Files / Tests").
   - `npx eslint <archivos tocados>` sin errores.
   - Commit `fase19-task N: <descripción>` con trailer `Co-Authored-By: <modelo que ejecuta> <noreply@...>`; `git push`.
   - **DETENERSE y pedir aprobación al usuario** con un reporte de 3–5 líneas (qué se hizo, hash,
     tests). No empezar la siguiente tarea sin un "sí" explícito.
4. **No reintentos automáticos** (RULES §1): máximo 1 corrección por error; si vuelve a fallar,
   detenerse y reportar.
5. **Nunca aplicar migraciones a ninguna base de datos.** La única base configurada en `.env`
   (`100.87.12.1`) es **la misma de producción**. Se aplica al final, con aprobación explícita del
   usuario y respaldo previo (ver §6).
6. TDD: escribir primero los tests, verlos fallar, implementar, verlos pasar.
7. Archivos con finales de línea CRLF: preferir edición por reemplazo exacto, no `sed`.
8. Español en toda la UI y mensajes.
9. Windows: si `npx prisma generate` falla con `EPERM` (DLL del motor bloqueado), hay un `next dev`
   corriendo; detenerlo (los procesos `node.exe` de `next dev` del proyecto) y regenerar.
10. Sandbox confinado (p. ej. el agente DSH en modo `workspace-write`): `npx tsc --noEmit` falla con
    `TS5033` al escribir `tsconfig.tsbuildinfo` → usar `npx tsc --noEmit --incremental false`.
    `npm test`, `npm run build`, `npx prisma migrate diff` y `npx prisma generate` **no** arrancan en
    modo confinado (lanzan subprocesos con pipes: `spawn EPERM`), así que requieren acceso completo o
    ejecutarlos el usuario; **no son fallos del proyecto**.

### Patrones del proyecto a reutilizar (leerlos)
- Server actions guard → Zod → BD → `revalidatePath` con errores de datos (no excepciones):
  `src/app/actions/gasto-actions.ts` y `src/app/actions/categoria-gasto-actions.ts`.
- **Periodos mensuales `YYYY-MM`**: `src/lib/gastos/periodo.ts` (`periodoActualBogota`,
  `rangoDelPeriodo`, `periodoAnterior`, `ETIQUETA_MES`) y `src/app/(dashboard)/gastos/page.tsx`
  (selector de periodo por `searchParams`).
- **Pendientes del mes generados bajo demanda** (el patrón que copia esta fase):
  `src/lib/gastos/recurrentes-pendientes.ts` + `src/app/(dashboard)/gastos/recurrentes-pendientes.tsx`.
- **Reporte de productividad existente**: `src/lib/reportes/productividad.ts` (puro) y
  `getReporteProductividad` en `src/app/actions/reporte-actions.ts` (órdenes `ENTREGADA` con
  `entregadaAt` en el rango, scoped por sede; el reporte es ADMIN).
- **Gastos como única vía de dinero que sale**: `crearGastoAction` (categoría, `pagadoEnEfectivo`,
  `fecha`), `src/lib/gastos/validaciones-db.ts` (`resolverSede`/`validarSede`/`validarCategoria`) y
  `src/lib/caja/resumen.ts` (los gastos `pagadoEnEfectivo` son egresos del arqueo).
- **Siembra por migración** de categorías del sistema: `prisma/tenant/migrations/20261011120000_gastos/migration.sql`
  (`INSERT INTO "categorias_gasto" ...`, ids legibles `cat_*`).
- **Auditoría**: `registrarEventoAuditoria(tx, evento)` en `src/lib/auditoria/registrarEvento.ts`
  (siempre dentro del `tx` de la action) + catálogo de etiquetas en `src/lib/auditoria/catalogo.ts`
  (el `Record<TipoEventoAuditoria, string>` obliga a completarlo: tsc lo verifica).
- **Edición en línea de una fila** (cantidad editable + confirmación): el editor del kit de
  `src/app/(dashboard)/servicios/kit-repuestos-editor.tsx` (Fase 18).
- Guards `requireRole`; BD `getTenantDb(session.user.tenantSchema)`; sede `src/lib/sede/scope.ts`;
  dinero `roundMoney`; `Decimal` → `number` antes de componentes cliente; toasts `sonner`.

---

## 1. Objetivo y decisiones (revisar/aprobar antes de ejecutar)

Que el taller pueda **liquidar lo que le paga a cada mecánico** en un periodo, con las horas como
tercer dato del rendimiento: hoy se sabe cuántas órdenes entregó y cuánta mano de obra produjo cada
técnico (`/reportes`), pero no cuántas horas le costó ni existe forma de registrar el pago.

| # | Decisión |
|---|---|
| D1 | Una **liquidación** es un documento por **(periodo, técnico, sede)**: al generarla congela los números del cálculo. No se borra: se **anula** (como `Anticipo`). |
| D2 | **Base de cálculo**: líneas de `ManoDeObra` de las órdenes en estado **ENTREGADA** cuya `entregadaAt` cae en el periodo y en la sede. Es exactamente la regla del reporte de productividad existente, para que el reporte y la liquidación nunca digan cosas distintas. |
| D3 | **Atribución del trabajo**: cada línea de mano de obra se atribuye a **su propio `mecanicoId`**; si es `null`, al mecánico de la orden. *(Cambia los números del reporte actual en el caso de una línea con mecánico distinto al de la orden: es una decisión explícita, no un efecto colateral.)* |
| D4 | **Esquema por técnico**: `PORCENTAJE` (% de la mano de obra producida), `FIJO` (monto por periodo) o `MIXTO` (base fija + %). Un técnico **sin esquema** no se liquida: la fila lo avisa y la generación lo omite. |
| D5 | **Periodo mensual `YYYY-MM`**, reutilizando `src/lib/gastos/periodo.ts`. Quincenas quedan fuera de alcance: la clave única es `(periodo, técnico, sede)`, así que añadirlas más adelante sería un cambio de esquema (una columna de quincena en la clave), no solo de UI. |
| D6 | **Horas**: campo opcional `ManoDeObra.horas` (`Decimal(5,2)`), registrado por quien puede agregar mano de obra (ADMIN/RECEPCION/TECNICO) y editable en línea en el detalle de la orden. `null` = sin registrar, distinto de `0`. |
| D7 | **Rendimiento por técnico** (`/reportes`): a las columnas actuales (órdenes entregadas, mano de obra) se añaden **horas** y **$/hora** (eficiencia; "—" si no hay horas registradas). |
| D8 | **El pago de una liquidación se registra como un `Gasto`** de la sede, con una categoría del sistema sembrada por la migración (`cat_liquidacion_mecanicos`), y `pagadoEnEfectivo` cuando el método es `EFECTIVO`. Así el pago aparece en el arqueo de caja y en la rentabilidad neta **sin plomería nueva**. Métodos: `MetodoPago` salvo `ANTICIPO`. |
| D9 | **Estados**: `PENDIENTE` → `PAGADA` (crea el gasto) o `ANULADA`. Anular una `PAGADA` **borra su gasto en la misma transacción** (es un pago equivocado; el `AuditLog` guarda el rastro). Regenerar el periodo **reutiliza la fila** existente en vez de crear otra. Caso límite: si alguien borra el gasto desde `/gastos`, la liquidación queda `PAGADA` con `gastoId` en `null` (la FK es `onDelete: SetNull`) — la página la muestra igual, sin enlace al gasto. |
| D10 | Mientras esté `PENDIENTE`, si el cálculo vivo difiere del congelado la página lo avisa y ofrece **Recalcular**; una `PAGADA` nunca se recalcula (el documento es el respaldo del pago). |
| D11 | `ajuste` (a favor o en contra) con **motivo obligatorio** cuando no es 0; `total = montoCalculado + ajuste`. |
| D12 | **Roles**: esquema de pago, generar, ajustar, pagar y anular = **ADMIN**; registrar/editar horas = ADMIN/RECEPCION/TECNICO; rendimiento = ADMIN (como el reporte actual). |
| D13 | **Menú**: "Liquidaciones" en el grupo **Administración** (que ya solo ve ADMIN), como "Servicios" en Inventario (Fase 18). |
| D14 | **Auditoría**: eventos nuevos `LIQUIDACION_GENERAR`, `LIQUIDACION_PAGAR`, `LIQUIDACION_ANULAR` y `LIQUIDACION_ESQUEMA_ACTUALIZAR`. |
| D15 | Fuera de alcance: quincenas, adelantos/préstamos a técnicos, timesheet por día, horas por reloj de tiempo, PDF de la liquidación, liquidación de RECEPCION/ADMIN. |

---

## 2. Modelo de datos (Task 1)

```prisma
enum TipoEsquemaLiquidacion {
  PORCENTAJE
  FIJO
  MIXTO
}

enum EstadoLiquidacion {
  PENDIENTE
  PAGADA
  ANULADA
}

/// Forma de pago de un técnico. Uno por usuario; el `porcentaje` aplica sobre la
/// mano de obra producida y `montoFijo` es la base por periodo (D4).
model EsquemaLiquidacion {
  id         String                 @id @default(cuid())
  usuarioId  String                 @unique @map("usuario_id")
  usuario    Usuario                @relation("EsquemaLiquidacion", fields: [usuarioId], references: [id], onDelete: Cascade)
  tipo       TipoEsquemaLiquidacion
  porcentaje Decimal?               @db.Decimal(5, 2)
  montoFijo  Decimal?               @map("monto_fijo") @db.Decimal(10, 2)
  createdAt  DateTime               @default(now()) @map("created_at")
  updatedAt  DateTime               @updatedAt @map("updated_at")

  @@map("esquemas_liquidacion")
}

/// Documento de pago de un técnico en un periodo y una sede. Congela el esquema
/// y los montos con los que se calculó (el esquema puede cambiar después) y el
/// gasto que materializó el pago, si ya se pagó.
model LiquidacionMecanico {
  id              String                 @id @default(cuid())
  periodo         String
  sedeId          String                 @map("sede_id")
  sede            Sede                   @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  usuarioId       String                 @map("usuario_id")
  usuario         Usuario                @relation("LiquidacionesMecanico", fields: [usuarioId], references: [id], onDelete: Restrict)
  estado          EstadoLiquidacion      @default(PENDIENTE)
  /// Snapshot del esquema y del cálculo al generar.
  tipo            TipoEsquemaLiquidacion
  porcentaje      Decimal?               @db.Decimal(5, 2)
  montoFijo       Decimal?               @map("monto_fijo") @db.Decimal(10, 2)
  montoManoObra   Decimal                @map("monto_mano_obra") @db.Decimal(10, 2)
  horas           Decimal                @db.Decimal(7, 2)
  montoCalculado  Decimal                @map("monto_calculado") @db.Decimal(10, 2)
  ajuste          Decimal                @default(0) @db.Decimal(10, 2)
  motivoAjuste    String?                @map("motivo_ajuste")
  total           Decimal                @db.Decimal(10, 2)
  generadaPorId   String                 @map("generada_por_id")
  generadaPor     Usuario                @relation("LiquidacionesGeneradas", fields: [generadaPorId], references: [id], onDelete: Restrict)
  generadaAt      DateTime               @default(now()) @map("generada_at")
  pagadaAt        DateTime?              @map("pagada_at")
  pagadaPorId     String?                @map("pagada_por_id")
  pagadaPor       Usuario?               @relation("LiquidacionesPagadas", fields: [pagadaPorId], references: [id], onDelete: SetNull)
  gastoId         String?                @unique @map("gasto_id")
  gasto           Gasto?                 @relation(fields: [gastoId], references: [id], onDelete: SetNull)
  anuladaAt       DateTime?              @map("anulada_at")
  anuladaPorId    String?                @map("anulada_por_id")
  anuladaPor      Usuario?               @relation("LiquidacionesAnuladas", fields: [anuladaPorId], references: [id], onDelete: SetNull)
  motivoAnulacion String?                @map("motivo_anulacion")
  createdAt       DateTime               @default(now()) @map("created_at")
  updatedAt       DateTime               @updatedAt @map("updated_at")

  @@unique([periodo, usuarioId, sedeId])
  @@index([sedeId, periodo])
  @@index([usuarioId])
  @@map("liquidaciones_mecanico")
}
```

Además:
- `ManoDeObra`: `horas Decimal(5,2)?` (`@map("horas")`).
- Relaciones inversas en `Usuario` (`esquemaLiquidacion EsquemaLiquidacion?`, `liquidaciones LiquidacionMecanico[]` con sus tres nombres de relación), `Sede.liquidaciones` y `Gasto.liquidacion LiquidacionMecanico?`.
- `TipoEventoAuditoria`: cuatro valores nuevos (D14).

---

## 3. Tareas

### Task 1: Esquema, migración con siembra y validación

**Archivos:** `prisma/tenant/schema.prisma`; `prisma/tenant/migrations/20261014120000_equipo_tecnico/migration.sql`;
`src/lib/validation/liquidacion.ts` (+ test); `src/lib/validation/orden.ts`; `src/lib/auditoria/catalogo.ts`.

1. Agregar §2 al schema y generar la migración con
   `git show main:prisma/tenant/schema.prisma > "$TEMP/antes.prisma"` +
   `npx prisma migrate diff --from-schema-datamodel "$TEMP/antes.prisma" --to-schema-datamodel prisma/tenant/schema.prisma --script --output <carpeta>/migration.sql`.
   `npx prisma validate` y `npx prisma generate`. Revisar el SQL: `ALTER TABLE "mano_de_obra" ADD COLUMN "horas"`,
   las dos tablas nuevas, el único `(periodo, usuario_id, sede_id)` y las FK con `ON DELETE` correcto.
   **Añadir a mano la siembra** al final del SQL, siguiendo el precedente de la Fase 16:
   ```sql
   INSERT INTO "categorias_gasto" ("id", "nombre", "orden") VALUES ('cat_liquidacion_mecanicos', 'Liquidación de mecánicos', 11);
   ```
2. `src/lib/validation/liquidacion.ts` (tests primero):
   - `esquemaLiquidacionInputSchema`: `tipo` enum; reglas cruzadas con `superRefine` (PORCENTAJE exige
     `porcentaje` 0–100 y sin `montoFijo`; FIJO exige `montoFijo` > 0 sin `porcentaje`; MIXTO exige ambos).
   - `pagarLiquidacionInputSchema`: `metodoPago` (`EFECTIVO|TARJETA|TRANSFERENCIA|OTRO`), `referencia`
     opcional (≤60), `fecha` (`fechaSchema` de `validation/reporte.ts`).
   - `ajusteLiquidacionInputSchema`: `ajuste` (coerce, −99 999 999,99 … 99 999 999,99) y `motivo`
     obligatorio (1–200) cuando `ajuste !== 0`.
   - `periodoSchema` reutilizado de `validation/gasto.ts` (no duplicar el regex).
3. `src/lib/validation/orden.ts`: `manoDeObraInputSchema.horas` opcional (`z.coerce.number().min(0.25,
   "La cantidad mínima es 0,25 h").max(999.99, "Demasiadas horas")`) y `horasManoDeObraInputSchema`
   (`{ horas }`) para la edición en línea.
4. Tests: válidos por tipo, cada regla cruzada, horas en los límites (0,25 / 999,99 / 0 / 1000 / "abc"),
   ajuste sin motivo, método `ANTICIPO` rechazado.
5. Verificar (§0.3), commit `fase19-task 1: esquema, migración y validación del equipo técnico`, **pedir aprobación**.

### Task 2: Lógica pura (atribución, horas y cálculo de la liquidación)

**Archivos:** `src/lib/liquidaciones/atribucion.ts` (+ test); `src/lib/liquidaciones/calculo.ts` (+ test);
`src/lib/reportes/productividad.ts` (+ test).

- `atribuirManoDeObra(orden)` → `{ mecanicoId, valor, horas }[]`: una entrada por línea, con el
  `mecanicoId` de la línea o, si es `null`, el de la orden (D3); `horas` cuenta `null` como 0 pero
  distingue "sin horas" de "0 horas" en el resumen.
- `agruparProduccion(ordenes)` → filas por mecánico (`valor`, `horas`, `ordenes`) con la clave
  `__sin_asignar__` para el trabajo sin mecánico (misma convención que `productividad.ts`).
- `calcularMontoLiquidacion(esquema, montoManoObra)`: PORCENTAJE → `roundMoney(monto * pct / 100)`;
  FIJO → `montoFijo`; MIXTO → `montoFijo + roundMoney(monto * pct / 100)`.
- `totalLiquidacion(montoCalculado, ajuste)` = `roundMoney(montoCalculado + ajuste)`.
- `hayCambiosSinReflejar(congelado, vivo)`: compara `montoManoObra`, `horas` y `montoCalculado` (D10).
- `montoPorHora(monto, horas)` → `number | null` (null si `horas <= 0`), para el reporte y la tabla.
- Alinear `computeProductividad` para que use `atribuirManoDeObra` y devuelva además `horas` y
  `montoPorHora` (D3 + D7). **Sus tests actuales se actualizan, no se borran.**
- Tests: línea con mecánico propio vs heredado, orden sin mecánico, kit de la Fase 18 (varias líneas),
  redondeo de porcentajes (p. ej. 33,33 % de 45 000), 0 horas, `horas` null, ajuste negativo.

Verificar, commit `fase19-task 2: lógica de atribución, horas y cálculo de liquidación`, **pedir aprobación**.

### Task 3: Registro de horas en la orden

**Archivos:** `src/app/actions/mano-de-obra-actions.ts` (+ test); `ordenes/[id]/agregar-mano-obra-form.tsx` (+ test);
`ordenes/[id]/horas-mano-de-obra-form.tsx` (+ test); `ordenes/[id]/page.tsx`.

- `addManoDeObraAction`: aceptar y persistir `horas` (ya validado en Task 1); sin horas sigue siendo válido.
- `actualizarHorasManoDeObraAction(id, ordenId, horas)`: roles ADMIN/RECEPCION/TECNICO, orden con
  `scopeOrden(sedeActivaId)` (si no → "Orden no encontrada"), `assertOrdenMutable(orden)` (devolver su
  mensaje), validar con `horasManoDeObraInputSchema`, `updateMany({ where: { id, ordenId } })` y avisar si
  no tocó ninguna fila. `horas: null` es válido y significa "borrar lo registrado".
  Revalidar `/ordenes/<id>`. Devuelve `{ error: string | null }`.
- UI: campo "Horas" opcional en el formulario de mano de obra; columna "Horas" en `MANO_OBRA_COLUMNS`
  (con "—" cuando es null) y edición en línea por fila con un formulario pequeño
  (`horas-mano-de-obra-form.tsx`, patrón del editor del kit de la Fase 18: estado local + `useTransition`
  + toast). Total de horas de la orden en el encabezado de la tarjeta de mano de obra.
- Tests: roles, orden ajena/inexistente, orden no mutable (ENTREGADA/facturada), 0 / 0,25 / 999,99 / 1000 /
  "abc", `null` borra las horas, la fila de otra orden no se toca, mensaje cuando no hay filas.

Verificar, commit `fase19-task 3: registro de horas por línea de mano de obra`, **pedir aprobación**.

### Task 4: Rendimiento por técnico con horas y eficiencia

**Archivos:** `src/app/actions/reporte-actions.ts`; `src/app/(dashboard)/reportes/page.tsx`; `reportes/page.test.tsx`.

- `getReporteProductividad`: seleccionar también `mecanicoId` de cada línea de mano de obra y `horas`,
  y alimentar `atribuirManoDeObra`/`computeProductividad` (Task 2). Se mantiene la regla de órdenes
  `ENTREGADA` con `entregadaAt` en el rango y el scope por sede; el reporte sigue siendo ADMIN.
- Página: columnas **Horas** y **$/hora** (ordenables como las actuales), "—" cuando no hay horas, y el
  total de horas del periodo junto al de mano de obra.
- Tests: filas con y sin horas, `montoPorHora` nulo, atribución por línea (una orden con dos mecánicos
  aparece en dos filas), y que los filtros de fecha/sede sigan aplicándose.

Verificar, commit `fase19-task 4: rendimiento por técnico con horas y eficiencia`, **pedir aprobación**.

### Task 5: Esquema de pago y página `/liquidaciones`

**Archivos:** `src/app/actions/liquidacion-actions.ts` (+ test); `src/app/(dashboard)/liquidaciones/page.tsx`,
`loading.tsx`, `esquema-liquidacion-section.tsx` (+ test), `liquidacion-fila.tsx` (+ test),
`pagar-liquidacion-dialog.tsx` (+ test); `src/app/(dashboard)/dashboard-sidebar.tsx`.

Actions (todas con guard primero; montos siempre calculados en el servidor):
- `listLiquidacionesDelPeriodo(periodo)` — ADMIN, sede activa. Devuelve, por técnico de la sede
  (`usuario.role === "TECNICO"` + `sedes.some({ sedeId })`), el **vivo** (producción del periodo:
  órdenes, mano de obra, horas, `montoPorHora`), su **esquema** y la **liquidación** existente de ese
  `(periodo, técnico, sede)` con `hayCambios` (D10). Los técnicos sin esquema se marcan como tales.
- `generarLiquidacionesAction(periodo)` — ADMIN. Por cada técnico con esquema: si no hay fila, la crea
  (`PENDIENTE`); si hay y está `PENDIENTE` con números distintos, la recalcula; si está `PAGADA`, la
  omite; si está `ANULADA`, la reactiva con el cálculo nuevo (D9). Todo en una transacción con un
  `registrarEventoAuditoria` (`LIQUIDACION_GENERAR`) por fila tocada. Devuelve
  `{ generadas, actualizadas, omitidas, sinEsquema }`.
- `actualizarAjusteLiquidacionAction(id, prev, formData)` — ADMIN, solo `PENDIENTE`; recalcula `total`
  y guarda `motivoAjuste`.
- `pagarLiquidacionAction(id, prev, formData)` — ADMIN, solo `PENDIENTE`. En una transacción: crea el
  `Gasto` de la sede con `categoriaId: CATEGORIA_LIQUIDACION_ID`, `descripcion: "Liquidación <técnico> <periodo>"`,
  `monto: total` (del documento, no del cliente), `fecha`, `pagadoEnEfectivo: metodo === "EFECTIVO"`,
  `referencia`; marca la liquidación `PAGADA` con `pagadaAt`/`pagadaPorId`/`gastoId`; y registra
  `LIQUIDACION_PAGAR`. Si la categoría del sistema no existe (migración sin aplicar), devolver un error
  claro en vez de fallar con la FK. Revalidar `/liquidaciones`, `/gastos`, `/caja`, `/reportes`.
- `anularLiquidacionAction(id, motivo)` — ADMIN; `PENDIENTE` → `ANULADA`; `PAGADA` → borra su `Gasto`
  en la misma transacción (D9) y registra `LIQUIDACION_ANULAR`.
- `listEsquemasLiquidacion()` / `guardarEsquemaLiquidacionAction(usuarioId, prev, formData)` — ADMIN;
  valida que el usuario sea TECNICO de la sede activa y aplica `esquemaLiquidacionInputSchema`
  (upsert por `usuarioId`); registra `LIQUIDACION_ESQUEMA_ACTUALIZAR`.
- `CATEGORIA_LIQUIDACION_ID = "cat_liquidacion_mecanicos"` en `src/lib/liquidaciones/categorias.ts`
  (misma idea que `CONFIGURACION_SMTP_ID`).

Página `/liquidaciones` (`requireRole(["ADMIN"])`): selector de periodo (`searchParams`, default
`periodoActualBogota`) + botón "Generar liquidaciones del periodo"; tarjeta "Producción y liquidación
del periodo" con una fila por técnico (nombre, órdenes, mano de obra, horas, $/hora, esquema vigente,
monto calculado, ajuste, total, estado, aviso "Hay cambios sin reflejar → Recalcular", y acciones
Pagar / Anular según estado); tarjeta "Esquema de pago por técnico" para editar tipo/porcentaje/base.
Menú: "Liquidaciones" en **Administración** (solo ADMIN ya).

Tests: roles por action, generación idempotente (segunda corrida no duplica), recálculo solo en
`PENDIENTE`, `PAGADA` intocable, pagar crea el gasto con `pagadoEnEfectivo` según método y con el
monto del documento, anular `PENDIENTE` y anular `PAGADA` (borra el gasto), ajuste con motivo
obligatorio, técnico sin esquema omitido, sede ajena/ajena al técnico, auditoría registrada, y UI
(tabla, aviso de cambios, diálogo de pago, esquema).

Verificar, commit `fase19-task 5: esquema de pago, página de liquidaciones y pago como gasto`, **pedir aprobación**.

---

## 4. Seguridad

Todo por `getTenantDb` con el tenant de la sesión; guard antes de cualquier lectura/escritura.
Esquema, generación, ajuste, pago y anulación: **solo ADMIN** (es dinero y es dato laboral). Las horas
las registra quien ya puede agregar mano de obra, siempre con `scopeOrden(sedeActivaId)` y orden mutable.
Los montos se calculan **siempre en el servidor** a partir de las líneas de mano de obra (nunca del
cliente): el `Gasto` del pago usa el `total` congelado del documento. Ninguna consulta devuelve filas
completas de `Usuario` (siempre `select` de `{id, nombre}`). No se exponen costos de otros técnicos a
quien no sea ADMIN.

## 5. Verificación final de la fase

`npx tsc --noEmit` (`--incremental false` si hay sandbox), `npm test` completo, `npx eslint` en lo
tocado y `npm run build`. Revisar el diff completo de la rama contra este documento (revisión final
con otro modelo) y hacer el fix round de los hallazgos. Reporte.

## 6. Cierre (solo con aprobación del usuario)

1. Respaldo en el servidor: `ssh -i ~/.ssh/torqueflow_deploy alejo@192.168.1.50` y `pg_dump` a
   `~/backups/torqueflow_<fecha>_pre_fase19.sql` (URL de `DATABASE_URL` del `.env` del servidor sin `?schema=`).
2. Aplicar la migración a cada schema de tenant (`taller_dev`, `taller_dev_reference`):
   `TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=<schema>" npx prisma migrate deploy --schema=prisma/tenant/schema.prisma`
   y verificar `npx prisma migrate diff --from-url "<misma URL>" --to-schema-datamodel prisma/tenant/schema.prisma --script` → "empty migration".
3. Regenerar el cliente (ver §0.9) y dejar `npm run dev` corriendo para la prueba manual del usuario.
4. Con el visto bueno: `git checkout main && git pull && git merge --no-ff fase19-equipo-tecnico` y push.
   El deploy lo hace el usuario (pull + build + `sudo pm2 restart torqueflow`).
