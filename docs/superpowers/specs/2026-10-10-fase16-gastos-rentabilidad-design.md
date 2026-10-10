# Fase 16 — Gastos operativos y rentabilidad real (design)

> Fecha: 2026-10-10 · Rama: `fase16-gastos-rentabilidad` · Roadmap: ítems 1 y 2
> (`docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`).

## Objetivo

Que el taller registre sus **gastos operativos** (con categorías editables y plantillas
recurrentes mensuales) y que el reporte de **Rentabilidad** muestre la **utilidad neta**
(margen bruto − gastos), el **margen neto %** y el **punto de equilibrio**.

Fuera de alcance: cuentas por pagar / gastos pendientes de pago (Fase 24), caja diaria
(Fase 17), separación de IVA en gastos, adjuntar soportes (foto de factura), exportación.

## Decisiones (tomadas con el usuario)

- Cada gasto pertenece a **una sede** (por defecto la sede activa).
- Categorías **editables por el taller** (crear, renombrar, activar/desactivar; no se borran).
- Recurrentes como **plantilla mensual** que se **confirma** cada mes (no se generan solas).
- **ADMIN y RECEPCION** registran gastos y ven `/gastos`; **solo ADMIN** edita/elimina gastos,
  confirma/omite recurrentes y administra plantillas y categorías. La rentabilidad sigue
  siendo solo ADMIN.

## 1. Modelo de datos (schema tenant)

### `CategoriaGasto`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `nombre` | `String @unique` | trim, 1–60 caracteres |
| `activo` | `Boolean @default(true)` | inactiva = no se ofrece al registrar; gastos viejos la conservan |
| `orden` | `Int` | orden de presentación |
| `createdAt` | `DateTime @default(now())` | |

La **migración** inserta (con `id` fijos legibles, p. ej. `cat_arriendo`) las 11 categorías
por defecto, en este orden: Arriendo, Servicios públicos, Nómina, Seguridad social,
Herramientas y equipos, Insumos, Mantenimiento del local, Impuestos, Publicidad, Transporte,
Otros. Como el aprovisionamiento de tenants corre `prisma migrate deploy`, esto cubre talleres
existentes y nuevos sin script de backfill.

### `Gasto`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `sedeId` | FK → `Sede` (`Restrict`) | |
| `categoriaId` | FK → `CategoriaGasto` (`Restrict`) | |
| `descripcion` | `String` | trim, 1–200 |
| `monto` | `Decimal(12,2)` | > 0, pesos COP, IVA incluido |
| `fecha` | `DateTime @db.Date` | fecha contable |
| `referencia` | `String?` | nº de factura/recibo del proveedor, ≤ 60 |
| `gastoRecurrenteId` | FK? → `GastoRecurrente` (`SetNull`) | si nació de una plantilla |
| `periodo` | `String?` | `"YYYY-MM"`, solo para gastos de plantilla |
| `registradoPorId` | FK → `Usuario` (`Restrict`) | |
| `createdAt` / `updatedAt` | | |

`@@unique([gastoRecurrenteId, periodo])` — una plantilla genera como máximo un gasto por mes.
`@@index([sedeId, fecha])`, `@@index([categoriaId])`.

### `GastoRecurrente` (plantilla)
| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `sedeId` | FK → `Sede` (`Restrict`) | |
| `categoriaId` | FK → `CategoriaGasto` (`Restrict`) | |
| `descripcion` | `String` | |
| `montoEstimado` | `Decimal(12,2)` | > 0 |
| `diaDelMes` | `Int` | 1–28 (existe en todos los meses) |
| `desde` | `String` | `"YYYY-MM"`, primer mes que aplica |
| `activo` | `Boolean @default(true)` | |
| `createdAt` / `updatedAt` | | |

### `GastoRecurrenteOmitido`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `gastoRecurrenteId` | FK → `GastoRecurrente` (`Cascade`) | |
| `periodo` | `String` | `"YYYY-MM"` |
| `omitidoPorId` | FK → `Usuario` (`Restrict`) | |
| `createdAt` | | |

`@@unique([gastoRecurrenteId, periodo])`.

## 2. Lógica de dominio — `src/lib/gastos/` (pura, sin Prisma)

- `periodo.ts`: `periodoDe(fecha: Date): string` (mes calendario en **America/Bogota** para
  fechas-instante; para columnas `@db.Date` usar `toISOString().slice(0,7)`),
  `periodosEntre(desde: string, hasta: string): string[]`, `rangoDelPeriodo(periodo)` →
  `{ gte, lt }` como medianoches UTC de `@db.Date`, `fechaEnPeriodo(periodo, dia)`.
- `recurrentes-pendientes.ts`: dada la lista de plantillas activas (con sus periodos ya
  confirmados y omitidos) y el periodo actual, devuelve los pendientes
  `{ recurrenteId, periodo, fechaSugerida, montoEstimado, ... }`: todos los periodos desde
  `desde` hasta el actual (inclusive) que no tienen gasto ni omisión. Orden: periodo asc.
- `rentabilidad-neta.ts`: a partir de `RentabilidadTotales` (existente, `src/lib/reportes/rentabilidad.ts`)
  + `gastosTotal` + base facturada sin IVA + número de facturas calcula:
  - `utilidadNeta = margen − gastosTotal`
  - `margenNetoPorcentaje = base === 0 ? 0 : utilidadNeta / base × 100`
  - `puntoEquilibrioVentas = margenPorcentaje > 0 ? gastosTotal / (margenPorcentaje/100) : null`
  - `ticketPromedioBase = facturas > 0 ? base / facturas : 0`
  - `puntoEquilibrioFacturas = (PE != null && ticket > 0) ? ceil(PE / ticket) : null`
  - `diferenciaEquilibrio = PE != null ? base − PE : null` (positivo = sobra, negativo = falta)
  - Todo redondeado con `roundMoney`.

`computeRentabilidad` no cambia; `RentabilidadTotales` gana el campo `baseFacturada`
(hoy se calcula pero no se expone) — cambio aditivo.

## 3. Server actions — `src/app/actions/gasto-actions.ts` y `categoria-gasto-actions.ts`

Todas con `getTenantDb(session.user.tenantSchema)`, guard antes de cualquier acceso a BD,
validación Zod, errores de Prisma vía `friendlyPrismaErrorMessage`, `revalidatePath("/gastos")`
(y `/reportes` cuando aplique).

- `listGastos({ periodo, sedeId?, categoriaId? })` — ADMIN/RECEPCION. Sede por defecto: la activa.
  Devuelve filas + KPIs del mes (total, total del mes anterior, categoría mayor).
- `crearGastoAction` — ADMIN/RECEPCION. `sedeId` = sede activa (RECEPCION no elige otra sede;
  ADMIN puede elegir cualquier sede del taller). Categoría debe estar activa.
- `actualizarGastoAction`, `eliminarGastoAction` — ADMIN.
- `listRecurrentesPendientes({ sedeId? })` — ADMIN/RECEPCION (RECEPCION los ve, no los confirma).
- `confirmarRecurrenteAction(recurrenteId, periodo, monto, fecha)` — ADMIN. Crea `Gasto` con
  `gastoRecurrenteId` + `periodo`; un P2002 (ya confirmado) devuelve "Este gasto ya fue confirmado".
- `omitirRecurrenteAction(recurrenteId, periodo)` — ADMIN.
- CRUD de plantillas (`crear/actualizar/toggleActivoGastoRecurrenteAction`) — ADMIN.
- Categorías: `listCategoriasGasto({ soloActivas? })`, `crearCategoriaGastoAction`,
  `renombrarCategoriaGastoAction`, `toggleCategoriaGastoActivaAction` — ADMIN (listar activas:
  ADMIN/RECEPCION). Nombre duplicado → "Ya existe una categoría con ese nombre".

## 4. UI

### `/gastos` (ADMIN y RECEPCION; TECNICO → redirección como el resto de páginas con `requireRole`)
- Encabezado con selector de **mes** (por defecto el actual en Bogotá) y **sede** (solo ADMIN
  puede cambiarla; por defecto la activa).
- KPIs: Total del mes, vs. mes anterior (diferencia %), Categoría mayor.
- **Recurrentes pendientes** (si hay): fila por (plantilla, periodo) con descripción, categoría,
  periodo, monto estimado. ADMIN: **Confirmar** (diálogo con monto editable y fecha sugerida
  editable) y **Omitir este mes** (`ConfirmacionEnLinea`). RECEPCION: solo lectura con el texto
  "El administrador debe confirmarlo".
- **Tabla de gastos del mes** (`src/components/data-table*`): fecha, descripción, categoría,
  referencia, monto, registrado por, acciones (ADMIN: editar, eliminar con `ConfirmacionEnLinea`).
  Filtro por categoría. Botón **Nuevo gasto** (diálogo).
- Sección/pestaña **Configuración** (solo ADMIN): **Plantillas recurrentes** (lista + crear/editar
  + activar/desactivar) y **Categorías** (lista ordenada + crear/renombrar + activar/desactivar).

### Menú
Ítem "Gastos" en el grupo **Operación**, visible solo para ADMIN y RECEPCION (nueva prop del
sidebar, p. ej. `puedeVerGastos`, calculada en el layout).

### `/reportes` → tarjeta Rentabilidad (solo ADMIN, mismos filtros rango + sede)
- KPIs nuevos: **Gastos del periodo**, **Utilidad neta**, **Margen neto %**,
  **Punto de equilibrio** (ventas sin IVA necesarias; subtítulo con nº de facturas y
  "Faltan $X" / "Sobran $X"; "No alcanzable con el margen actual" si margen ≤ 0).
- Tabla **Gastos por categoría** del periodo (monto y % del total).
- **Aviso** si hay recurrentes sin confirmar cuyo `fechaEnPeriodo` cae dentro del rango:
  "Hay N gastos recurrentes sin confirmar en este periodo; la utilidad puede estar
  sobreestimada" + enlace a `/gastos`.
- Gastos del periodo = suma de `Gasto.monto` con `fecha` en el rango (`@db.Date`, comparación
  por fecha calendario) y `sedeId` del filtro.

## 5. Seguridad y multi-tenant

- Todo por `getTenantDb`; guards de `src/lib/auth/guards.ts` antes de leer/escribir.
- Las actions verifican que `sedeId`, `categoriaId` y `gastoRecurrenteId` existan en el tenant.
- RECEPCION nunca puede registrar en otra sede que no sea la activa ni editar/eliminar.
- Montos > 0 y ≤ 9.999.999.999,99; fechas válidas; textos con trim.

## 6. Testing

- Unit: `periodo.ts` (bordes de mes/año, zona Bogotá), `recurrentes-pendientes.ts` (desde futuro,
  meses confirmados/omitidos, plantilla inactiva, varios meses atrasados),
  `rentabilidad-neta.ts` (margen 0/negativo, sin facturas, redondeo).
- Actions: permisos por rol (RECEPCION no edita/elimina/confirma; TECNICO rechazado), sede
  forzada a la activa para RECEPCION, categoría inactiva rechazada, confirmar duplicado (P2002),
  omitir, nombre de categoría duplicado.
- Componentes: diálogo nuevo gasto (validación), fila de pendiente (confirmar/omitir por rol),
  KPIs del reporte con punto de equilibrio no alcanzable.
- Migración: SQL coherente con el schema y con las 11 categorías sembradas.
- Verificación final: `tsc --noEmit`, `npm test`, eslint; prueba manual con la app corriendo.
