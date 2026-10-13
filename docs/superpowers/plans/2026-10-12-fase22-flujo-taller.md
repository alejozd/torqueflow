# Fase 22 — Flujo de taller: prioridad, alertas de estancadas y tablero accionable (spec + plan de tareas)

> Rama: `fase22-flujo-taller` · Roadmap ítems **15** (alertas de órdenes estancadas),
> **16** (prioridad en la orden) y **17** (tablero kanban), los tres de prioridad media.
> No depende de ninguna fase anterior (la 21, ya mergeada, condiciona una cosa: entregar exige firmar el acta).
> Documento **autocontenido**: puede ejecutarlo cualquier agente sin el historial de la conversación.
> Leer completo antes de empezar. **Estado: plan escrito, NO ejecutado.** Empezar por la Task 1.

---

## 0. Instrucciones para el agente ejecutor (OBLIGATORIAS)

1. Leer antes de tocar código: `AGENTS.md` (este Next.js 16 tiene cambios incompatibles: consultar
   `node_modules/next/dist/docs/` antes de usar APIs de Next), `RULES.md` y `PROJECT_BRIEF.md`.
2. Trabajar **solo** en la rama `fase22-flujo-taller`. No tocar `main`.
3. **Una tarea a la vez.** Al terminar cada tarea:
   - `npx tsc --noEmit --incremental false` limpio y `npm test` completo pasando (pegar el resumen
     "Test Files / Tests").
   - `npx eslint <archivos tocados>` sin errores.
   - Commit `fase22-task N: <descripción>` con trailer `Co-Authored-By: <modelo que ejecuta> <noreply@…>`; `git push`.
   - Reportar en 3–5 líneas y **detenerse a pedir aprobación**, salvo que el usuario autorice continuar sin
     aprobación por tarea: en ese caso se reporta al final de todas.
4. **No reintentos automáticos** (RULES §1): máximo 1 corrección por error; si vuelve a fallar, detenerse y reportar.
5. **Nunca aplicar migraciones sin autorización explícita ni sin respaldo previo.** Esta fase **sí lleva
   migración** (enum de prioridad + umbral en la configuración): se aplica al final, con respaldo `pg_dump`
   y aprobación (ver §6). La única base del `.env` (`100.87.12.1`) es **la misma de producción**.
6. TDD: escribir primero los tests, verlos fallar, implementar, verlos pasar.
7. Archivos con finales de línea CRLF: preferir edición por reemplazo exacto, no `sed`.
8. Español en toda la UI y en los mensajes de validación (los planes de fase van en español; los comentarios
   de `src/` van en inglés, como el resto del repo).
9. Sandbox confinado (p. ej. el agente DSH en modo `workspace-write`): `npx tsc --noEmit` falla con `TS5033`
   al escribir `tsconfig.tsbuildinfo` → usar `--incremental false`. `npm test`, `npm run build`,
   `npm install` y `npx prisma …` **no** arrancan en modo confinado (lanzan subprocesos con pipes:
   `spawn EPERM`), así que requieren acceso completo o ejecutarlos el usuario; **no son fallos del proyecto**.

### Patrones del proyecto a reutilizar (leerlos)

- **El tablero YA EXISTE en modo lectura** (esto cambia el encuadre, no lo reinventes):
  `src/app/(dashboard)/ordenes/page.tsx` — `?vista=tabla|tablero` (`:290`), toggle (`:432-455`), columnas con
  `agruparPorEstado` (`:106-111`) y tarjetas-link (`:467-522`), helper `construirHrefOrdenes` (`:113-126`).
  El mismo filtro de estado recorta el tablero (`:334-339`).
- **El listado**: píldoras de estado por URL (`:400-430`), orden por URL `?sort=fecha|total|estado|cliente`
  + `?order=asc|desc` (`:20-22`, `:291-292`), `compararOrdenes` en memoria (`:161-178`), `DataTable`
  (`:458-466`) que pagina en cliente (`src/components/data-table.tsx`, `pageSize=20` en `:42`) y **no ordena**
  (el orden lo pone la página). KPIs calculados sobre el array completo (`:313-332`). La página **no tiene
  test unitario** (solo `ordenes/loading.test.tsx`) y está cargada: 527 líneas, 4 KPIs, 2 vistas y un diálogo.
- **Acción de mutación canónica**: `asignarMecanicoAction` (`src/app/actions/orden-actions.ts:399-460`) y
  `updateEstadoOrdenAction` (`:324-397`): `requireRole`, Zod `safeParse`, `findFirst` + `scopeOrden`
  (nunca `findUnique`), `assertOrdenMutable`, `$transaction` con `registrarEventoAuditoria(tx, …)`,
  `friendlyPrismaErrorMessage` en el catch, `revalidatePath`, y email **después** de la transacción.
  Ojo: `updateEstadoOrdenAction` **rechaza el destino `ENTREGADA`** (`:353-355`) porque entregar es firmar el
  acta (`src/app/actions/recepcion-actions.ts`, Fase 21).
- **Configuración del taller**: `ConfiguracionTaller` (`prisma/tenant/schema.prisma:848-855`, singleton
  `id = "singleton"`, `diasAvisoVencimiento` default 30), lectura con fallback
  (`src/lib/vencimientos/configuracion.ts:11-16`), escritura `guardarDiasAvisoAction`
  (`src/app/actions/configuracion-taller-actions.ts:33-59`, `requireRole(["ADMIN"])`, Zod con rango y
  `MENSAJE_RANGO`), y la UI en `src/app/(dashboard)/configuracion-smtp/page.tsx:17-21` (el formulario que ya
  edita los días es el vecino de esa carpeta: `recordatorios-form.tsx`).
- **Alertas (el patrón a copiar)**: `AlertasInventarioCard` (`src/app/(dashboard)/alertas-inventario-card.tsx`)
  con su **regla pura en** `src/lib/dashboard/alertas-inventario.ts:17-27` (DB-free, la action solo trae filas)
  y sus acciones en `src/app/actions/alertas-inventario-actions.ts`. Se monta en el Inicio
  (`src/app/(dashboard)/page.tsx:473`). El otro precedente es `/vencimientos` (página dedicada con KPIs).
  **No existe ningún canal de aviso al personal del taller** (todo avisa al cliente por email o es wa.me manual).
- **Inicio**: `src/app/(dashboard)/page.tsx` (KPIs `:211-291`, "Flujo del taller" `:293-398`, que ya lista las
  4 órdenes con `updatedAt` más reciente) y `src/app/actions/dashboard-actions.ts` (`scopeOrden`, counts
  `:98-132`). El sidebar calcula sus badges en `src/app/(dashboard)/layout.tsx:47-144` — **una consulta extra
  por cada request**; por eso esta fase **no** añade badge (D13).
- **Auditoría**: `src/lib/auditoria/catalogo.ts` (array `TIPOS_EVENTO_AUDITORIA` `:8-22` **y** mapa
  `TIPO_EVENTO_AUDITORIA_LABELS` `:24-38`; añadir un tipo toca también el enum del schema `:17-31` y la
  migración) y `registrarEventoAuditoria(tx, evento)` (`src/lib/auditoria/registrarEvento.ts:10-21`) **dentro**
  de la transacción del llamador.
- **UI disponible**: `src/components/ui/` tiene `card`, `badge`, `dropdown-menu`, `tooltip`, `dialog`, `sheet`,
  `select`, `select-field`, `kpi-card`, `alert`, `input`, `textarea`, `separator`, `skeleton`, `table`,
  `pagination`, `avatar`, `label`, `combobox`, `sidebar`, `button`. **No hay** `tabs`, `checkbox`, `popover`
  ni `command`, y **no hay ninguna librería de drag & drop** en `package.json`.
- **Tests**: `src/app/actions/orden-actions.test.ts` (mockea guards/tenant-client/cache/email y usa un
  `$transaction` falso que invoca el callback contra un `tx` mockeado `:21-49`),
  `src/app/(dashboard)/ordenes/[id]/cambiar-estado-form.test.tsx` (mockea el módulo de la acción),
  `src/components/data-table.test.tsx` (el link de fila se llama "Ver detalle").

---

## 1. Objetivo y decisiones

**Objetivo:** que el taller pueda **decidir y ver** el trabajo: marcar qué orden va primero, mover las órdenes
entre columnas desde el tablero sin entrar a cada ficha, y que lo que se quedó parado o terminado sin entregar
salte a la vista en el Inicio y se pueda filtrar en el listado.

**Fuera de alcance de esta fase** (documentarlo, no improvisarlo): correo interno o campana al personal del
taller (el usuario eligió tarjeta en el Inicio + marca y filtro en el listado — D7); aviso al cliente por
wa.me desde la alerta (existe el patrón en `/vencimientos`, se puede añadir después); fecha prometida al
cliente (no existe el campo y nadie la pidió); límites de trabajo en curso (WIP) por columna; historial de
estados (no hay tabla de historial y esta fase no la crea); badge de alertas en el sidebar (D13); y
**reestructurar el markup de las filas de la tabla** (D12: hay e2e que resuelven la placa dentro de la fila).

| # | Decisión |
|---|---|
| **D1** | **Prioridad = enum de 4 niveles**: `PrioridadOrden { BAJA, NORMAL, ALTA, URGENTE }`, campo nuevo en `OrdenTrabajo` con `@default(NORMAL)` (migración). Toda la UI la pinta con `Record<PrioridadOrden, {label, badge}>`, como ya se hace con estados y severidades. |
| **D2** | **La prioridad ordena de verdad**: se añade `prioridad` a las claves de orden de la URL (`?sort=prioridad`) y **dentro de cada columna del tablero** las tarjetas se ordenan por prioridad y luego por antigüedad (si no reordena, no sirve). El orden por defecto de la tabla no cambia. |
| **D3** | **Cambiar la prioridad**: `ADMIN` y `RECEPCION` (calcado de `asignarMecanicoAction`), solo si la orden es **mutable** (`assertOrdenMutable`), y **auditado** con un tipo nuevo `PRIORIDAD_CAMBIAR`. |
| **D4** | **"Estancada" = sin actividad ≥ umbral**, no "sin cambios en la cabecera": `updatedAt` solo se mueve cuando alguien toca la fila de la orden (estado, mecánico, recepción), así que **la actividad se calcula como el mayor** entre la cabecera (`createdAt`/`updatedAt`) y sus hijos: ítems, mano de obra, DVI (con sus fotos) y daños. Todos esos modelos tienen `createdAt` (y `Dvi` además `updatedAt`). *Se evaluó y descartó la alternativa de añadir `estadoCambiadoAt` + backfill + mantenerlo en las tres transiciones: mide "días en el mismo estado", que no es lo que se eligió (actividad), y añade un campo que hay que sincronizar en cada camino de cambio de estado.* |
| **D5** | **Umbral único y configurable**: `ConfiguracionTaller.diasOrdenEstancada` (Int, default **3**, rango 1–90 como el de vencimientos), editable por `ADMIN` en la misma pantalla de configuración. |
| **D6** | **Dos alertas**: `ESTANCADA` = orden en `EN_PROCESO` sin actividad ≥ umbral (trabajo empezado y frenado); `TERMINADA_SIN_ENTREGAR` = orden en `TERMINADA` sin actividad ≥ umbral (auto listo que nadie recogió). `BORRADOR` **no** alerta (un borrador que nadie confirmó no es trabajo frenado), y `ENTREGADA`/`ANULADA` nunca. |
| **D7** | **Dónde se ven**: tarjeta "Alertas del taller" en el Inicio (misma zona que la de inventario) y, en `/ordenes`, una **píldora de filtro** (`?alerta=estancada|sin-entregar`) y un **KPI** con el total. Sin correo y sin campana; una orden sale de la alerta sola cuando se mueve o se le carga trabajo. |
| **D8** | **El tablero es accionable sin dependencias nuevas**: arrastrar y soltar nativo (HTML5) **más** un menú "Mover a…" en cada tarjeta (`dropdown-menu`, ya existe) que funciona con teclado y en táctil. |
| **D9** | **Solo transiciones válidas**: el menú ofrece `ESTADO_ORDEN_TRANSITIONS[estado]` y el arrastre solo acepta esos destinos. **A `ENTREGADA` no se suelta ni se elige desde el menú**: el menú en `TERMINADA` lleva a la sección del acta de la orden (entregar es firmar, Fase 21). |
| **D10** | **Columnas**: `BORRADOR`, `EN_PROCESO`, `TERMINADA` y `ENTREGADA`; `ANULADA` solo aparece cuando el filtro de estado es ese (hoy `agruparPorEstado` siempre pinta las cinco). |
| **D11** | **El movimiento reusa `updateEstadoOrdenAction`** (nada de caminos de escritura nuevos): el menú y el `drop` envían esa acción, que ya valida la transición, exige orden mutable, confirma la anulación y revalida. |
| **D12** | **No se toca el markup de las filas de la tabla**: hay e2e (`e2e/tenant-flow.spec.ts:126`, `:195`, `:361`, `:385`) que resuelven la fila por la placa; la prioridad entra como **columna y badge** y las alertas como píldora y KPI. Playwright no corre en este entorno, así que la regla es no reestructurar lo que esos locators tocan. |
| **D13** | **Sin badge en el sidebar**: el layout ya lanza seis consultas por request y una alerta de estancadas necesitaría otra más en todas las páginas; el Inicio y el listado bastan. |
| **D14** | **La prioridad no se cambia desde la fila de la tabla**: cada fila ya está cubierta por un link estirado (`DataTable` lo hace "Ver detalle") y los e2e resuelven la fila por ahí, así que el formulario vive en la ficha de la orden y en el tablero (donde la tarjeta es el propio control). En la tabla la prioridad es columna ordenable con su marca, que es lo que se consulta de un vistazo. |

---

## 2. Modelo, validación y lógica (Task 1)

**Migración** `prisma/tenant/migrations/<timestamp>_flujo_taller/migration.sql`, generada con
`prisma migrate diff` desde el schema de `main` (como en las fases 20 y 21):

```prisma
enum PrioridadOrden { BAJA NORMAL ALTA URGENTE }        // + ALTER TYPE en TipoEventoAuditoria: PRIORIDAD_CAMBIAR

model OrdenTrabajo {
  // …lo existente…
  prioridad PrioridadOrden @default(NORMAL) @map("prioridad")
}

model ConfiguracionTaller {
  // …lo existente…
  diasOrdenEstancada Int @default(3) @map("dias_orden_estancada")
}
```

**Validación** (`src/lib/validation/orden.ts`, junto a `estadoOrdenSchema:47`): `prioridadOrdenSchema`
(`z.enum`) y `diasEstancadaSchema` (`z.coerce.number().int().min(1).max(90)`) con su mensaje en español,
reusando el patrón de `DIAS_AVISO_MIN/MAX` y del `MENSAJE_RANGO` (`configuracion-taller-actions.ts:20-26`).

**Lógica pura** `src/lib/orden/flujo.ts` (sin Prisma, como `src/lib/dashboard/alertas-inventario.ts`):

```ts
export type MotivoAlerta = "ESTANCADA" | "TERMINADA_SIN_ENTREGAR";
export interface ActividadDeOrden {
  estado: EstadoOrden; createdAt: Date; updatedAt: Date;
  items: { createdAt: Date }[]; manoDeObra: { createdAt: Date }[];
  dvi: { updatedAt: Date; fotos: { createdAt: Date }[] } | null; danios: { createdAt: Date }[];
}
export function ultimaActividad(orden: ActividadDeOrden): Date
export function diasSinActividad(orden: ActividadDeOrden, ahora: Date): number   // días completos
export function alertaDeOrden(orden: ActividadDeOrden, opciones: { ahora: Date; diasUmbral: number }): MotivoAlerta | null
export const ETIQUETA_PRIORIDAD: Record<PrioridadOrden, string>
export const ORDEN_PRIORIDAD: Record<PrioridadOrden, number>       // para ordenar (URGENTE primero)
export function compararPorPrioridad(a, b): number                 // prioridad y luego antigüedad
```

Reglas de `alertaDeOrden`: `EN_PROCESO` sin actividad ≥ umbral → `ESTANCADA`; `TERMINADA` sin actividad ≥
umbral → `TERMINADA_SIN_ENTREGAR`; cualquier otro estado → `null`. `diasSinActividad` usa días completos y
nunca es negativo.

---

## 3. Tareas

### Task 1: esquema, migración, validación y lógica pura

**Archivos:** `prisma/tenant/schema.prisma`, `prisma/tenant/migrations/<ts>_flujo_taller/migration.sql`,
`src/lib/validation/orden.ts`, `src/lib/auditoria/catalogo.ts`, `src/lib/orden/flujo.ts` (+ `.test.ts`).

1. Enum `PrioridadOrden`, campo `OrdenTrabajo.prioridad`, `ConfiguracionTaller.diasOrdenEstancada` y el valor
   `PRIORIDAD_CAMBIAR` en `TipoEventoAuditoria`. Regenerar el cliente (`npx prisma generate`, ambos schemas).
2. Migración con `prisma migrate diff` (una sentencia por valor de enum, como la fase 21). **No aplicarla**
   todavía (§6).
3. `src/lib/auditoria/catalogo.ts`: añadir el tipo **en los dos sitios** (array y `Record` de etiquetas), o
   `tsc` falla.
4. `flujo.ts` + tests: actividad con hijos (el ítem de ayer evita que la orden salga estancada), umbral
   respetado (justo en el límite y un día antes), `TERMINADA` sin entregar, borradores y terminales sin
   alerta, orden por prioridad con desempate por antigüedad, y etiquetas completas para los 4 niveles.
5. Verificar (§0.3) y commit `fase22-task 1: prioridad, umbral de estancadas y logica de flujo`.

### Task 2: acciones (prioridad, umbral y consulta de alertas)

**Archivos:** `src/app/actions/orden-actions.ts` (`cambiarPrioridadAction`),
`src/app/actions/configuracion-taller-actions.ts` (`guardarDiasEstancadaAction` + lectura),
`src/app/actions/alertas-taller-actions.ts` (+ `.test.ts`) —o ampliar `dashboard-actions.ts`— y
`src/lib/orden/configuracion-estancada.ts` (lectura con fallback, como `leerDiasAviso`).

1. `cambiarPrioridadAction(ordenId, prev, formData)`: `requireRole(["ADMIN", "RECEPCION"])`, Zod, `findFirst`
   + `scopeOrden`, `assertOrdenMutable`, `$transaction` con `PRIORIDAD_CAMBIAR` (detalle: anterior y nueva),
   `revalidatePath("/ordenes")` y de la ficha.
2. `guardarDiasEstancadaAction` + lector con fallback (default 3) y `revalidatePath("/")` + `/ordenes` +
   `/configuracion-smtp`.
3. `getAlertasTaller()`: una lectura con `scopeOrden(sede)`, `estado in (EN_PROCESO, TERMINADA)` y un
   `include`/`select` mínimo (lo que la regla pura necesita: `createdAt`, `updatedAt`, `items.createdAt`,
   `manoDeObra.createdAt`, `dvi.updatedAt`, `dvi.fotos.createdAt`, `danios.createdAt`), y devuelve las órdenes
   con alerta ya resueltas por la lógica pura (días, motivo, prioridad, placa, cliente, mecánico).
   **No** filtra por umbral en SQL: la regla vive en `flujo.ts`.
4. Tests: prioridad cambia y audita (y rechaza orden facturada/entregada), el umbral valida el rango y guarda
   el singleton, y `getAlertasTaller` clasifica bien (con una fila estancada por un trabajo reciente y otra
   sin actividad), respetando la sede de la sesión.
5. Verificar y commit `fase22-task 2: acciones de prioridad, umbral de estancadas y alertas del taller`.

### Task 3: prioridad y alertas en el listado de órdenes

**Archivos:** `src/app/(dashboard)/ordenes/page.tsx`, `.../cambiar-prioridad-form.tsx` (+ `.test.tsx`),
`src/app/(dashboard)/ordenes/[id]/page.tsx` (mostrar y cambiar la prioridad en la ficha).

1. Columna y badge de prioridad en la tabla (sin tocar el link de la fila: D12), `sort=prioridad` en
   `SORT_KEYS`/`compararOrdenes`, y el formulario de cambio (select + submit) reutilizando `SelectField` y el
   patrón `useActionState`.
2. Píldora de filtro `?alerta=estancada|sin-entregar` junto a las de estado (extender
   `construirHrefOrdenes` para que no se pisen entre sí) y un KPI "Estancadas" con el total. Las alertas se
   cruzan **por id** contra `getAlertasTaller()` (una sola lectura con `select` mínimo): **no** se engorda
   `ORDEN_DETAIL_INCLUDE`, que ya carga `dvi`+`fotos` sin que el listado lo use.
3. Marca visual en la fila/ tarjeta de una orden con alerta (badge con los días sin actividad), sin cambiar
   la estructura de la fila.
4. En la ficha de la orden: la prioridad junto al estado, con el mismo formulario.
5. Tests de los componentes nuevos (render, cambio de prioridad, filtro por alerta) y de la página si se
   puede aislar; los e2e existentes **no** deben requerir cambios (D12).
6. Verificar y commit `fase22-task 3: prioridad y filtro de alertas en el listado y la ficha`.

### Task 4: tablero accionable (mover de columna)

**Archivos:** `src/app/(dashboard)/ordenes/tablero-ordenes.tsx` (+ `.test.tsx`) y el recorte de
`ordenes/page.tsx` para usar el componente.

1. Extraer las columnas/tarjetas actuales a un componente cliente (hoy están inline en el Server Component)
   que reciba las columnas ya agrupadas y ordene **por prioridad** dentro de cada columna (D2).
2. Cada tarjeta: menú "Mover a…" con `ESTADO_ORDEN_TRANSITIONS[estado]` (excluyendo `ENTREGADA`, que lleva al
   acta — D9) y arrastre HTML5 nativo (`draggable`, `onDragStart`, `onDragOver`, `onDrop`), ambos llamando
   `updateEstadoOrdenAction` con `useTransition` + `toast`; confirmación en las transiciones destructivas
   (reusar `ConfirmacionEnLinea`).
3. Columnas según D10 (sin `ANULADA` salvo filtro) y contador por columna, más un indicador de alerta en la
   tarjeta.
4. Tests: el menú ofrece solo transiciones válidas y no ofrece "Entregada"; el `drop` llama la acción con el
   estado destino; una tarjeta estancada se marca; el orden por prioridad dentro de la columna.
5. Verificar y commit `fase22-task 4: tablero accionable con arrastre y menu de estado`.

### Task 5: tarjeta de alertas en el Inicio y ajuste del umbral

**Archivos:** `src/app/(dashboard)/alertas-taller-card.tsx` (+ `.test.tsx`),
`src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/configuracion-smtp/recordatorios-form.tsx` (+ su test) y
`.../configuracion-smtp/page.tsx`.

1. Tarjeta "Alertas del taller": cuenta por motivo, lista con placa, cliente, mecánico, prioridad, días sin
   actividad y enlace a la orden; estado vacío explícito ("Ninguna orden estancada"). Componente **de
   servidor** (no hace falta posponer: la orden sale de la alerta al moverse — D7). Se monta junto a la de
   inventario.
2. Segundo campo en el formulario de recordatorios/configuración: "Días para considerar una orden estancada"
   con el mismo rango y mensaje que el existente, y su acción.
3. Tests: la tarjeta lista y cuenta bien, con estado vacío; el formulario valida el rango y llama la acción.
4. Verificar y commit `fase22-task 5: tarjeta de alertas en el inicio y ajuste del umbral`.

---

## 4. Seguridad

Todo pasa por `getTenantDb(session.user.tenantSchema)` con guard antes de cualquier lectura/escritura
(`requireSession` en lecturas, `requireRole` en las mutaciones). Cada orden se busca con `findFirst` +
`scopeOrden(session.user.sedeActivaId)` (nunca `findUnique` por id solo). Cambiar la prioridad exige
`ADMIN`/`RECEPCION` y una orden mutable; mover de columna exige los roles que ya acepta
`updateEstadoOrdenAction` y respeta `ESTADO_ORDEN_TRANSITIONS`, el guard de mutabilidad y el rechazo de
`ENTREGADA`. Las consultas de alertas devuelven solo las filas de la sede activa y con `select` mínimo (nada
de `Usuario` completo: solo `nombre`). No se añade ninguna dependencia nueva.

## 5. Verificación final de la fase

`npx tsc --noEmit --incremental false`, `npm test` completo, `npx eslint` en lo tocado y `npm run build`.
Revisar el diff completo de la rama contra este documento (revisión final con otro modelo) y hacer el fix
round de los hallazgos. Reporte.

## 6. Cierre (solo con aprobación del usuario)

1. Respaldo en el servidor (`ssh` + `pg_dump` a `~/backups/torqueflow_<fecha>_pre_fase22.sql`, con la URL de
   `DATABASE_URL` del `.env` sin `?schema=`).
2. Aplicar la migración a cada schema de tenant (`taller_dev`, `taller_dev_reference`):
   `TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=<schema>" npx prisma migrate deploy --schema=prisma/tenant/schema.prisma`
   y verificar `npx prisma migrate diff --from-url "<misma URL>" --to-schema-datamodel prisma/tenant/schema.prisma --script` → "empty migration".
   Comprobar además con `psql` que existen `ordenes_trabajo.prioridad` y `configuracion_taller.dias_orden_estancada`
   en `taller_dev` (es el schema que usa la app en producción).
3. Dejar `npm run dev` corriendo para la prueba manual del usuario (en un clon/worktree aparte del checkout de
   producción, como en las fases 20 y 21) y probar el flujo completo: orden con prioridad urgente → tablero →
   mover de columna con el menú y con arrastre → intentar soltar en Entregada (debe llevar al acta) → orden
   vieja marcada como estancada en el listado y en el Inicio → cambiar el umbral en la configuración.
4. Con el visto bueno: `git checkout main && git pull && git merge --no-ff fase22-flujo-taller`, actualizar
   `PROJECT_BRIEF.md` (línea de la fase + "Fases 23–25") y `git push`.
