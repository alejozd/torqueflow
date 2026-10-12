# Fase 19 — Equipo técnico: liquidación de mecánicos por actividades (spec + plan de tareas)

> Rama: `fase19-equipo-tecnico` · Roadmap ítems **8 y 18** (el ítem 21, horas por técnico, queda
> **pospuesto**: en este taller se liquida por actividades, no por horas — ver D7).
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
- **Periodos y calendario de Bogotá**: `src/lib/gastos/periodo.ts` (`periodoActualBogota`,
  `rangoDelPeriodo`, `ETIQUETA_MES`) y `src/lib/fecha-bogota.ts` (`formatoDiaBogota`). La Task 2
  generaliza esa idea a tres frecuencias; **no** basta con reutilizar el módulo de gastos.
- **Configuración singleton del taller**: `model ConfiguracionTaller` (id `"singleton"`), actions en
  `src/app/actions/configuracion-taller-actions.ts` (`getDiasAvisoVencimiento` / `guardarDiasAvisoAction`,
  con `requireRole(["ADMIN"])` y `configuracionTaller.upsert`) y su formulario
  `src/app/(dashboard)/configuracion-smtp/recordatorios-form.tsx` — el precedente exacto de "un ajuste
  del taller editable por ADMIN".
- **Pendientes del periodo generados bajo demanda**: `src/lib/gastos/recurrentes-pendientes.ts` +
  `src/app/(dashboard)/gastos/recurrentes-pendientes.tsx`, y el selector de periodo por `searchParams`
  de `src/app/(dashboard)/gastos/page.tsx`.
- **Reporte de productividad existente**: `src/lib/reportes/productividad.ts` (puro) y
  `getReporteProductividad` en `src/app/actions/reporte-actions.ts` (órdenes `ENTREGADA` con
  `entregadaAt` en el rango, scoped por sede; el reporte es ADMIN).
- **Gastos como única vía de dinero que sale**: `crearGastoAction` (categoría, `pagadoEnEfectivo`,
  `fecha`), `src/lib/gastos/validaciones-db.ts` (`resolverSede`/`validarSede`/`validarCategoria`) y
  `src/lib/caja/resumen.ts` (los gastos `pagadoEnEfectivo` son egresos del arqueo).
- **Siembra por migración** de categorías del sistema:
  `prisma/tenant/migrations/20261011120000_gastos/migration.sql` (`INSERT INTO "categorias_gasto" ...`,
  ids legibles `cat_*`, la última sembrada usa `orden = 10`).
- **Auditoría**: `registrarEventoAuditoria(tx, evento)` (`src/lib/auditoria/registrarEvento.ts`,
  siempre dentro del `tx` de la action) + catálogo en `src/lib/auditoria/catalogo.ts` (el
  `Record<TipoEventoAuditoria, string>` obliga a completarlo: tsc lo verifica).
- **Fila con edición en línea y confirmación**: el editor del kit de la Fase 18
  (`src/app/(dashboard)/servicios/kit-repuestos-editor.tsx`) y `ConfirmacionEnLinea`.
- Guards `requireRole`; BD `getTenantDb(session.user.tenantSchema)`; sede `src/lib/sede/scope.ts`;
  dinero `roundMoney`; `Decimal` → `number` antes de componentes cliente; toasts `sonner`.

---

## 1. Objetivo y decisiones (revisar/aprobar antes de ejecutar)

Que el taller pueda **liquidar lo que le paga a cada mecánico** por lo que hizo en el periodo: hoy
`/reportes` ya dice cuántas órdenes entregó y cuánta mano de obra produjo cada técnico, pero no existe
forma de registrar el pago, ni de elegir cada cuánto se liquida.

| # | Decisión |
|---|---|
| D1 | Una **liquidación** es un documento por **(periodo, técnico, sede)**: al generarla congela los números del cálculo. No se borra: se **anula** (mismo criterio que `Anticipo`). |
| D2 | **Base de cálculo**: líneas de `ManoDeObra` de las órdenes en estado **ENTREGADA** cuya `entregadaAt` cae en la ventana del periodo y en la sede — exactamente la regla del reporte de productividad, para que reporte y liquidación nunca digan cosas distintas. |
| D3 | **Atribución del trabajo**: cada línea de mano de obra se atribuye a **su propio `mecanicoId`**; si es `null`, al mecánico de la orden. *(Cambia los números del reporte actual en el caso de una línea con mecánico distinto al de la orden: es una decisión explícita, no un efecto colateral.)* |
| D4 | **Esquema por técnico**: `PORCENTAJE` (% de la mano de obra que produjo), `FIJO` (monto por periodo) o `MIXTO` (base fija + %). Un técnico **sin esquema** no se liquida: la fila lo avisa y la generación lo omite. |
| D5 | **La frecuencia la define el ADMIN del taller**: `ConfiguracionTaller.frecuenciaLiquidacion` ∈ `SEMANAL` / `QUINCENAL` / `MENSUAL` (por defecto `MENSUAL`), editable en `/liquidaciones`. La clave del periodo es un string canónico por frecuencia (`2026-10`, `2026-10-Q2`, `2026-W42`) y **cada liquidación guarda su `frecuencia` como snapshot**, así que cambiarla no reinterpreta lo ya liquidado. Si algún día hace falta frecuencia *por técnico*, se mueve al esquema (D4). |
| D6 | **Guarda de solapamiento**: al generar, si ya existe una liquidación del mismo técnico y sede cuya ventana **se solape** con la del periodo (caso típico: se cambió la frecuencia a mitad de mes), se **omite** y la página lo avisa. Es lo que impide pagar dos veces el mismo trabajo. |
| D7 | **Se liquida por actividades, no por horas** (así funciona este taller): el snapshot guarda `ordenes` y `trabajos` (líneas de mano de obra atribuidas) además de `montoManoObra`, y el rendimiento por técnico muestra esas cifras. El **ítem 21 del roadmap (horas por técnico) queda pospuesto**; no se añade `horas` a `ManoDeObra` en esta fase. |
| D8 | **El pago de una liquidación se registra como un `Gasto`** de la sede, con una categoría del sistema sembrada por la migración (`cat_liquidacion_mecanicos`), y `pagadoEnEfectivo` cuando el método es `EFECTIVO`. Así el pago entra al arqueo de caja y a la rentabilidad neta **sin plomería nueva**. Métodos: `MetodoPago` salvo `ANTICIPO`. |
| D9 | **Estados**: `PENDIENTE` → `PAGADA` (crea el gasto) o `ANULADA`. Anular una `PAGADA` **borra su gasto en la misma transacción** (es un pago equivocado; el `AuditLog` guarda el rastro). Regenerar el periodo **reutiliza la fila** existente en vez de crear otra. Caso límite: si alguien borra el gasto desde `/gastos`, la liquidación queda `PAGADA` con `gastoId` en `null` (la FK es `onDelete: SetNull`) y la página la muestra igual, sin enlace al gasto. |
| D10 | Mientras esté `PENDIENTE`, si el cálculo vivo difiere del congelado la página lo avisa y ofrece **Recalcular**; una `PAGADA` nunca se recalcula (el documento es el respaldo del pago). |
| D11 | `ajuste` (a favor o en contra) con **motivo obligatorio** cuando no es 0; `total = montoCalculado + ajuste`. |
| D12 | **Roles**: frecuencia, esquema de pago, generar, ajustar, pagar y anular = **ADMIN**; rendimiento por técnico = ADMIN (como el reporte actual). |
| D13 | **Menú**: "Liquidaciones" en el grupo **Administración** (que ya solo ve ADMIN), como "Servicios" en Inventario (Fase 18). |
| D14 | **Auditoría**: eventos nuevos `LIQUIDACION_GENERAR`, `LIQUIDACION_PAGAR`, `LIQUIDACION_ANULAR`, `LIQUIDACION_ESQUEMA_ACTUALIZAR` y `LIQUIDACION_FRECUENCIA_ACTUALIZAR`. |
| D15 | Fuera de alcance: horas/timesheet (pospuesto, D7), adelantos o préstamos a técnicos, PDF/impresión de la liquidación, liquidar a RECEPCION o ADMIN, y liquidación por técnico con frecuencia propia. |

---

## 2. Modelo de datos (Task 1)

```prisma
enum FrecuenciaLiquidacion {
  SEMANAL
  QUINCENAL
  MENSUAL
}

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

/// Forma de pago de un técnico. Uno por usuario; `porcentaje` aplica sobre la
/// mano de obra que produjo y `montoFijo` es la base por periodo (D4).
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

/// Documento de pago de un técnico en un periodo y una sede. Congela la
/// frecuencia con la que se leyó el periodo, el esquema y los montos con los que
/// se calculó (cualquiera de los tres puede cambiar después) y el gasto que
/// materializó el pago, si ya se pagó.
model LiquidacionMecanico {
  id              String                 @id @default(cuid())
  periodo         String
  frecuencia      FrecuenciaLiquidacion
  sedeId          String                 @map("sede_id")
  sede            Sede                   @relation(fields: [sedeId], references: [id], onDelete: Restrict)
  usuarioId       String                 @map("usuario_id")
  usuario         Usuario                @relation("LiquidacionesMecanico", fields: [usuarioId], references: [id], onDelete: Restrict)
  estado          EstadoLiquidacion      @default(PENDIENTE)
  /// Snapshot de lo producido y del esquema al generar.
  ordenes         Int
  trabajos        Int
  montoManoObra   Decimal                @map("monto_mano_obra") @db.Decimal(10, 2)
  tipo            TipoEsquemaLiquidacion
  porcentaje      Decimal?               @db.Decimal(5, 2)
  montoFijo       Decimal?               @map("monto_fijo") @db.Decimal(10, 2)
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
- `ConfiguracionTaller`: `frecuenciaLiquidacion FrecuenciaLiquidacion @default(MENSUAL) @map("frecuencia_liquidacion")` (la fila singleton que ya existe).
- Relaciones inversas: `Usuario.esquemaLiquidacion`, `Usuario.liquidaciones` (tres relaciones con nombre),
  `Sede.liquidaciones` y `Gasto.liquidacion LiquidacionMecanico?`.
- `TipoEventoAuditoria`: los cinco valores nuevos (D14).
- `ManoDeObra` **no** cambia en esta fase (D7).

---

## 3. Tareas

### Task 1: Esquema, migración con siembra y validación

**Archivos:** `prisma/tenant/schema.prisma`; `prisma/tenant/migrations/20261014120000_equipo_tecnico/migration.sql`;
`src/lib/validation/liquidacion.ts` (+ test); `src/lib/auditoria/catalogo.ts`.

1. Agregar §2 al schema y generar la migración con
   `git show main:prisma/tenant/schema.prisma > "$TEMP/antes.prisma"` +
   `npx prisma migrate diff --from-schema-datamodel "$TEMP/antes.prisma" --to-schema-datamodel prisma/tenant/schema.prisma --script --output <carpeta>/migration.sql`.
   `npx prisma validate` y `npx prisma generate`. Revisar el SQL: `ALTER TABLE "configuracion_taller" ADD COLUMN
   "frecuencia_liquidacion"`, las dos tablas nuevas, el único `(periodo, usuario_id, sede_id)` y las FK con su `ON DELETE`.
   **Añadir a mano la siembra** al final, siguiendo el precedente de la Fase 16:
   ```sql
   INSERT INTO "categorias_gasto" ("id", "nombre", "orden") VALUES ('cat_liquidacion_mecanicos', 'Liquidación de mecánicos', 11);
   ```
2. `src/lib/validation/liquidacion.ts` (tests primero):
   - `frecuenciaLiquidacionSchema` (`z.enum(["SEMANAL", "QUINCENAL", "MENSUAL"])`).
   - `periodoLiquidacionSchema`: string no vacío + `refine` de formato por frecuencia
     (`MENSUAL → /^\d{4}-(0[1-9]|1[0-2])$/`, `QUINCENAL → /^\d{4}-(0[1-9]|1[0-2])-Q[12]$/`,
     `SEMANAL → /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/`); el `refine` recibe la frecuencia por una factory
     `periodoDeFrecuenciaSchema(frecuencia)`.
   - `esquemaLiquidacionInputSchema`: `tipo` + reglas cruzadas con `superRefine` (PORCENTAJE exige
     `porcentaje` 0–100 y sin `montoFijo`; FIJO exige `montoFijo` > 0 sin `porcentaje`; MIXTO exige ambos).
   - `pagarLiquidacionInputSchema`: `metodoPago` (`EFECTIVO|TARJETA|TRANSFERENCIA|OTRO`), `referencia`
     opcional (≤60), `fecha` (reutilizar `fechaSchema` de `src/lib/validation/reporte.ts`).
   - `ajusteLiquidacionInputSchema`: `ajuste` (coerce, −99 999 999,99 … 99 999 999,99) y `motivo`
     obligatorio (1–200) cuando `ajuste !== 0`.
3. `src/lib/auditoria/catalogo.ts`: los cinco tipos nuevos con sus etiquetas en español.
4. Tests: válidos por tipo de esquema, cada regla cruzada, los tres formatos de periodo (válidos e
   inválidos, incluido un periodo con la frecuencia equivocada), ajuste sin motivo, método `ANTICIPO`
   rechazado, `frecuenciaLiquidacionSchema` rechazando un valor inventado.
5. Verificar (§0.3), commit `fase19-task 1: esquema, migración y validación del equipo técnico`, **pedir aprobación**.

### Task 2: Lógica pura (periodos por frecuencia, atribución y cálculo)

**Archivos:** `src/lib/liquidaciones/periodo.ts` (+ test); `src/lib/liquidaciones/atribucion.ts` (+ test);
`src/lib/liquidaciones/calculo.ts` (+ test); `src/lib/reportes/productividad.ts` (+ test).

- `src/lib/liquidaciones/periodo.ts` (calendario de Bogotá, como `src/lib/gastos/periodo.ts`):
  `periodoActual(frecuencia, ahora)`, `rangoDelPeriodo(frecuencia, periodo): { gte, lt }`,
  `periodoAnterior`, `periodoSiguiente`, `etiquetaPeriodo` ("octubre de 2026", "2ª quincena de octubre
  de 2026", "semana del 5 al 11 de octubre de 2026") y `ventanasSolapan(a, b)`.
  Convenciones: **quincena** = días 1–15 y 16–fin de mes; **semana** = lunes a domingo (ISO), con el
  periodo `YYYY-Www`. Quincena y semana se calculan sobre la fecha calendario de Bogotá, no sobre UTC.
- `atribuirManoDeObra(orden)` → `{ mecanicoId, valor }[]` con el `mecanicoId` de la línea o, si es
  `null`, el de la orden (D3).
- `agruparProduccion(ordenes)` → filas por mecánico con `{ ordenes, trabajos, montoManoObra }` y la
  clave `__sin_asignar__` para el trabajo sin mecánico (misma convención que `productividad.ts`).
- `calcularMontoLiquidacion(esquema, montoManoObra)`: PORCENTAJE → `roundMoney(monto * pct / 100)`;
  FIJO → `montoFijo`; MIXTO → `montoFijo + roundMoney(monto * pct / 100)`.
- `totalLiquidacion(montoCalculado, ajuste)` = `roundMoney(montoCalculado + ajuste)`.
- `hayCambiosSinReflejar(congelado, vivo)`: compara `ordenes`, `trabajos` y `montoManoObra` (D10).
- `computeProductividad` pasa a devolver además `trabajos` (líneas atribuidas) y a usar
  `atribuirManoDeObra` (D3 + D7). **Sus tests actuales se actualizan, no se borran.**
- Tests: periodos de las tres frecuencias en los bordes (día 1, 15, 16, fin de mes, lunes, domingo,
  cambio de mes y de año, semana 53), solapamiento sí/no, línea con mecánico propio vs heredado, orden
  sin mecánico, kit de la Fase 18 (varias líneas → varios trabajos), redondeo de porcentajes
  (33,33 % de 45 000), ajuste negativo, y que la fecha de Bogotá (no UTC) decida el periodo.

Verificar, commit `fase19-task 2: lógica de periodos, atribución y cálculo de liquidación`, **pedir aprobación**.

### Task 3: Esquema de pago por técnico y frecuencia del taller

**Archivos:** `src/app/actions/liquidacion-actions.ts` (esquema y frecuencia; + test);
`src/app/(dashboard)/liquidaciones/esquema-liquidacion-section.tsx` (+ test);
`src/app/(dashboard)/liquidaciones/frecuencia-liquidacion-form.tsx` (+ test).

- `listTecnicosConEsquema()` — ADMIN: técnicos de la sede activa (`role: "TECNICO"` +
  `sedes: { some: { sedeId } }`), con su esquema si lo tienen (nunca la fila completa de `Usuario`:
  `select` de `{id, nombre}`).
- `guardarEsquemaLiquidacionAction(usuarioId, prev, formData)` — ADMIN; valida con
  `esquemaLiquidacionInputSchema`, comprueba que el usuario sea TECNICO de la sede activa, hace upsert
  por `usuarioId` y registra `LIQUIDACION_ESQUEMA_ACTUALIZAR`.
- `listFrecuenciaLiquidacion()` / `guardarFrecuenciaLiquidacionAction(prev, formData)` — ADMIN; hace
  **upsert** sobre la fila singleton (`id: "singleton"`, como `guardarDiasAvisoAction`) y registra
  `LIQUIDACION_FRECUENCIA_ACTUALIZAR`.
  **Si ya hay liquidaciones en el periodo en curso, la respuesta incluye una advertencia** ("las
  liquidaciones ya generadas no se recalculan; revisa que no dobles el pago del periodo en curso") para
  mostrarla en la UI.
- `esquema-liquidacion-section.tsx`: tarjeta con una fila por técnico (nombre, tipo, porcentaje, base)
  y edición en línea (patrón de la Fase 18: estado local + `useTransition` + toast).
- `frecuencia-liquidacion-form.tsx`: selector SEMANAL/QUINCENAL/MENSUAL + guardar + la advertencia.
- Tests: roles, upsert, técnico de otra sede rechazado, reglas cruzadas del esquema, frecuencia
  inválida, advertencia cuando hay liquidaciones en el periodo, auditoría registrada.

Verificar, commit `fase19-task 3: esquema de pago por técnico y frecuencia del taller`, **pedir aprobación**.

### Task 4: Rendimiento por técnico por actividades en `/reportes`

**Archivos:** `src/app/actions/reporte-actions.ts`; `src/app/(dashboard)/reportes/page.tsx`; `reportes/page.test.tsx`.

- `getReporteProductividad`: seleccionar también el `mecanicoId` de cada línea de mano de obra y
  alimentar `atribuirManoDeObra`/`computeProductividad` (Task 2). Se mantiene la regla de órdenes
  `ENTREGADA` con `entregadaAt` en el rango y el scope por sede; el reporte sigue siendo ADMIN.
- Página: columnas **Trabajos** (líneas de mano de obra atribuidas) y **Promedio por trabajo**
  (`mano de obra / trabajos`, "—" si no hay trabajos), ordenables como las actuales; el encabezado suma
  también los trabajos del periodo.
- Tests: filas con y sin trabajos, promedio nulo, atribución por línea (una orden con dos mecánicos
  aparece en dos filas), y que los filtros de fecha/sede sigan aplicándose.

Verificar, commit `fase19-task 4: rendimiento por técnico por actividades`, **pedir aprobación**.

### Task 5: Página `/liquidaciones` (generar, recalcular, ajustar, pagar, anular)

**Archivos:** `src/app/actions/liquidacion-actions.ts` (liquidaciones; + test);
`src/app/(dashboard)/liquidaciones/page.tsx`, `loading.tsx`, `liquidacion-fila.tsx` (+ test),
`pagar-liquidacion-dialog.tsx` (+ test); `src/app/(dashboard)/dashboard-sidebar.tsx`;
`src/lib/liquidaciones/categorias.ts`.

- `CATEGORIA_LIQUIDACION_ID = "cat_liquidacion_mecanicos"` en `src/lib/liquidaciones/categorias.ts`
  (misma idea que `CONFIGURACION_SMTP_ID`).
- `listLiquidacionesDelPeriodo(periodo)` — ADMIN, sede activa. Devuelve, por técnico de la sede: el
  **vivo** del periodo (órdenes, trabajos, mano de obra), su **esquema**, la **liquidación** existente de
  ese `(periodo, técnico, sede)` con `hayCambios` (D10) y `solapada` (D6), y los técnicos sin esquema
  marcados como tales.
- `generarLiquidacionesAction(periodo)` — ADMIN. Por cada técnico con esquema: si no hay fila, la crea
  (`PENDIENTE`); si hay y está `PENDIENTE` con números distintos, la recalcula; si está `PAGADA`, la
  omite; si está `ANULADA`, la reactiva con el cálculo nuevo; si su ventana **se solapa** con otra
  liquidación del mismo técnico y sede, la omite (D6). Todo en una transacción con un
  `registrarEventoAuditoria` (`LIQUIDACION_GENERAR`) por fila tocada. Devuelve
  `{ generadas, actualizadas, omitidas, sinEsquema, solapadas }`.
- `actualizarAjusteLiquidacionAction(id, prev, formData)` — ADMIN, solo `PENDIENTE`; recalcula `total` y
  guarda `motivoAjuste`.
- `pagarLiquidacionAction(id, prev, formData)` — ADMIN, solo `PENDIENTE`. En una transacción: crea el
  `Gasto` de la sede con `categoriaId: CATEGORIA_LIQUIDACION_ID`, `descripcion: "Liquidación <técnico> <etiqueta del periodo>"`,
  `monto: total` (del documento, nunca del cliente), `fecha`, `pagadoEnEfectivo: metodo === "EFECTIVO"`,
  `referencia`; marca la liquidación `PAGADA` con `pagadaAt`/`pagadaPorId`/`gastoId`; registra
  `LIQUIDACION_PAGAR`. Si la categoría del sistema no existe (migración sin aplicar) devuelve un error
  claro en vez de fallar con la FK. Revalidar `/liquidaciones`, `/gastos`, `/caja`, `/reportes`.
- `anularLiquidacionAction(id, motivo)` — ADMIN; `PENDIENTE` → `ANULADA`; `PAGADA` → borra su `Gasto` en
  la misma transacción (D9); registra `LIQUIDACION_ANULAR`.
- Página `/liquidaciones` (`requireRole(["ADMIN"])`): encabezado con la frecuencia vigente (Task 3),
  selector/navegación de periodo (anterior / siguiente / actual, según la frecuencia), botón "Generar
  liquidaciones del periodo" y resumen del periodo; tarjeta "Producción y liquidación del periodo" con
  una fila por técnico (órdenes, trabajos, mano de obra, esquema vigente, monto calculado, ajuste,
  total, estado, avisos "Hay cambios sin reflejar → Recalcular" y "Ya liquidado en un periodo que se
  solapa", y acciones Pagar / Anular según estado). Menú: "Liquidaciones" en **Administración**.

Tests: roles por action, generación idempotente (segunda corrida no duplica), recálculo solo en
`PENDIENTE`, `PAGADA` intocable, solapamiento omitido, pagar crea el gasto con `pagadoEnEfectivo` según
método y con el monto del documento, categoría ausente → error claro, anular `PENDIENTE` y anular
`PAGADA` (borra el gasto), ajuste con motivo obligatorio, técnico sin esquema omitido, sede ajena,
auditoría registrada, y UI (tabla, avisos, diálogo de pago).

Verificar, commit `fase19-task 5: página de liquidaciones con pago como gasto`, **pedir aprobación**.

---

## 4. Seguridad

Todo por `getTenantDb` con el tenant de la sesión; guard antes de cualquier lectura/escritura.
Frecuencia, esquema, generación, ajuste, pago y anulación: **solo ADMIN** (es dinero y es dato laboral).
Los montos se calculan **siempre en el servidor** a partir de las líneas de mano de obra (nunca del
cliente): el `Gasto` del pago usa el `total` congelado del documento. Ninguna consulta devuelve filas
completas de `Usuario` (siempre `select` de `{id, nombre}`). El trabajo y los importes de un técnico no
se exponen a quien no sea ADMIN.

## 5. Verificación final de la fase

`npx tsc --noEmit` (`--incremental false` si hay sandbox), `npm test` completo, `npx eslint` en lo
tocado y `npm run build`. Revisar el diff completo de la rama contra este documento (revisión final con
otro modelo) y hacer el fix round de los hallazgos. Reporte.

## 6. Cierre (solo con aprobación del usuario)

1. Respaldo en el servidor: `ssh -i ~/.ssh/torqueflow_deploy alejo@192.168.1.50` y `pg_dump` a
   `~/backups/torqueflow_<fecha>_pre_fase19.sql` (URL de `DATABASE_URL` del `.env` del servidor sin `?schema=`).
2. Aplicar la migración a cada schema de tenant (`taller_dev`, `taller_dev_reference`):
   `TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=<schema>" npx prisma migrate deploy --schema=prisma/tenant/schema.prisma`
   y verificar `npx prisma migrate diff --from-url "<misma URL>" --to-schema-datamodel prisma/tenant/schema.prisma --script` → "empty migration".
3. Regenerar el cliente (ver §0.9) y dejar `npm run dev` corriendo para la prueba manual del usuario.
4. Con el visto bueno: `git checkout main && git pull && git merge --no-ff fase19-equipo-tecnico` y push.
   El deploy lo hace el usuario (pull + build + `sudo pm2 restart torqueflow`).
