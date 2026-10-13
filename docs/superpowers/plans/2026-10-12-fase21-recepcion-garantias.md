# Fase 21 — Recepción y garantías: diagrama de daños, acta de entrega y registro de garantías (spec + plan de tareas)

> Rama: `fase21-recepcion-garantias` · Roadmap ítems **12** (diagrama de daños), **13** (acta con firma) y
> **14** (garantías), las tres de prioridad media. No depende de ninguna fase anterior.
> Documento **autocontenido**: puede ejecutarlo cualquier agente (Claude, DeepSeek, etc.) sin el
> historial de la conversación. Leer completo antes de empezar.
> **Estado: plan escrito, NO ejecutado.** Empezar por la Task 1.

---

## 0. Instrucciones para el agente ejecutor (OBLIGATORIAS)

1. Leer antes de tocar código: `AGENTS.md` (este Next.js 16 tiene cambios incompatibles: consultar
   `node_modules/next/dist/docs/` antes de usar APIs de Next), `RULES.md` y `PROJECT_BRIEF.md`.
2. Trabajar **solo** en la rama `fase21-recepcion-garantias`. No tocar `main`.
3. **Una tarea a la vez.** Al terminar cada tarea:
   - `npx tsc --noEmit` limpio y `npm test` completo pasando (pegar el resumen "Test Files / Tests").
   - `npx eslint <archivos tocados>` sin errores.
   - Commit `fase21-task N: <descripción>` con trailer `Co-Authored-By: <modelo que ejecuta> <noreply@...>`; `git push`.
   - Reportar en 3–5 líneas (qué se hizo, hash, tests) y **detenerse a pedir aprobación**, salvo que el
     usuario autorice continuar sin aprobación por tarea (como en las fases 19 y 20): en ese caso se
     reporta al final de todas.
4. **No reintentos automáticos** (RULES §1): máximo 1 corrección por error; si vuelve a fallar,
   detenerse y reportar.
5. **Nunca aplicar migraciones sin autorización explícita ni sin respaldo previo.** Esta fase **sí lleva
   migración** (modelos nuevos): se aplica al final, con respaldo `pg_dump` y aprobación (ver §6). La
   única base del `.env` (`100.87.12.1`) es **la misma de producción**.
6. TDD: escribir primero los tests, verlos fallar, implementar, verlos pasar.
7. Archivos con finales de línea CRLF: preferir edición por reemplazo exacto, no `sed`.
8. Español en toda la UI y en los mensajes de validación (los planes de fase van en español; los
   comentarios de `src/` van en inglés, como el resto del repo).
9. Sandbox confinado (p. ej. el agente DSH en modo `workspace-write`): `npx tsc --noEmit` falla con
   `TS5033` al escribir `tsconfig.tsbuildinfo` → usar `npx tsc --noEmit --incremental false`.
   `npm test`, `npm run build`, `npm install` y `npx prisma …` **no** arrancan en modo confinado
   (lanzan subprocesos con pipes: `spawn EPERM`), así que requieren acceso completo o ejecutarlos el
   usuario; **no son fallos del proyecto**.

### Patrones del proyecto a reutilizar (leerlos)

- **Subida de archivo (el precedente exacto)**: `src/lib/storage/local-file-storage.ts` —
  `ALLOWED_UPLOAD_MIME_TYPES` (`:5`, jpeg/png/webp), `MAX_UPLOAD_SIZE_BYTES` (`:6`, 5 MB), validación de
  *magic bytes* (`:16-47`), raíz `UPLOADS_DIR ?? <cwd>/uploads` (`:49-51`), `saveDviFoto` (`:62-85`, que
  **hardcodea** el segmento `dvi/<dviId>` y devuelve `{ relativePath, url }`); la ruta que sirve los
  archivos, `src/app/api/uploads/[...path]/route.ts` (`requireSession` `:18`, exige que el primer
  segmento sea el tenant de la sesión `:21`, check anti-traversal `:33-36`, allowlist por extensión
  `:38-42`); la acción `addDviFotoAction` (`src/app/actions/dvi-actions.ts:68-121`, guarda **la URL** en
  BD `:113`) y su formulario `src/app/(dashboard)/ordenes/[id]/dvi-foto-form.tsx` (`Input type="file"`
  `:55-61`, `<img src>` con eslint-disable de `next/image` `:90-95`).
- **La orden y su guard de mutabilidad**: `prisma/tenant/schema.prisma:296-328` (`estado` `:299`,
  `sedeId` `:304`, `kilometrajeIngreso` `:310`, `sintomas` `:311`, `entregadaAt` `:318`),
  `EstadoOrden` (`:50-56`), transiciones en `src/lib/orden/estado-transitions.ts:3-9` y
  `esOrdenMutable` en `src/lib/orden/mutable-guard.ts:3-11` (**ENTREGADA y ANULADA son inmutables**, y
  también cualquier orden con factura): la firma de la entrega tiene que escribirse **en la misma
  transacción** que el cambio a `ENTREGADA` (D6).
- **La página de la orden**: `src/app/(dashboard)/ordenes/[id]/page.tsx` (anclas `SECCIONES_ORDEN`
  `:38-44`; tarjetas Información `:279`, Ítems `:327`, Mano de obra `:362`, DVI `:387`, Anticipos `:414`;
  sidebar Estado `:464`; roles `:207-208`) y los componentes de esa carpeta, en especial
  `cambiar-estado-form.tsx` (el flujo que pasa a ENTREGADA) y `dvi-foto-form.tsx`.
- **Vista imprimible (el único precedente)**: `src/app/cotizaciones/[id]/imprimir/page.tsx`
  (`max-w-3xl text-black` `:34`, `print:hidden` `:35`) y `src/app/(dashboard)/cotizaciones/[id]/imprimir-button.tsx:7`
  (`window.print()`). **No hay librería de PDF en el repo**: la impresión es la del navegador.
- **Formularios y confirmaciones**: `useActionState` + `FormGroup`/`Input`/`SelectField`/`Textarea`
  (`src/components/ui/textarea.tsx` **existe**) con `<Alert variant="destructive">` para el error y
  `<p role="status">` para el éxito; `ConfirmacionEnLinea`
  (`src/components/confirmacion-en-linea.tsx:11-51`) y sus envoltorios `EliminarConConfirmacion` /
  `QuitarConConfirmacion`.
- **Validación**: `src/lib/validation/*` (Zod v4), en particular `orden.ts` (kilometraje `:5`),
  `cita.ts:23-32` (fecha con `-05:00` de Bogotá) y `historial.ts:3-5`.
- **Auditoría**: `registrarEventoAuditoria(tx, evento)` (`src/lib/auditoria/registrarEvento.ts:10-21`)
  **dentro** de la transacción del llamador, y las **dos** estructuras de
  `src/lib/auditoria/catalogo.ts` (`TIPOS_EVENTO_AUDITORIA` `:8-19` y
  `TIPO_EVENTO_AUDITORIA_LABELS: Record<…>` `:21-32`, que hace fallar `tsc` hasta añadir la etiqueta).
- **Migración de tenant**: `prisma/tenant/migrations/20261014120000_equipo_tecnico/migration.sql`
  (generada con `prisma migrate diff` y retocada a mano; los valores de enum van **una sentencia por
  valor**, `ALTER TYPE "TipoEventoAuditoria" ADD VALUE …` `:18-23`).
- **Tests**: `src/app/actions/dvi-actions.test.ts` (mockea guards/tenant-client/storage/cache y construye
  `new File(["x"], "foto.jpg", { type: "image/jpeg" })` `:141`); el storage se prueba contra el sistema
  de archivos real con `mkdtemp` + `process.env.UPLOADS_DIR`
  (`src/lib/storage/local-file-storage.test.ts:10-18`); jsdom **no** trae canvas ni `toBlob`
  (`vitest.setup.ts:1-8` no añade polyfills), así que el dibujo debe aislarse en lógica pura.

---

## 1. Objetivo y decisiones

**Objetivo:** que la recepción de un vehículo deje constancia de cómo entró (kilometraje, combustible y
daños marcados sobre una silueta), que la entrega se cierre con un **acta firmada** por quien recibe —en
pantalla o subiendo el papel firmado—, que esa acta se pueda imprimir, y que el taller lleve un
**registro de garantías** por trabajo y por repuesto que pueda consultar cuando el cliente vuelve.

**Fuera de alcance de esta fase** (documentarlo, no improvisarlo): avisos automáticos de garantía en
órdenes nuevas y reclamos al proveedor (el usuario eligió solo registro y consulta — D3); acta de
recepción separada (se eligió **una sola acta en la entrega**, que incluye el estado con que entró el
vehículo — D4); enlace público para firmar a distancia (es la Fase 23); facturación de la garantía como
orden sin cobro (se decide cuando existan los avisos); arreglar la fuga de archivos huérfanos del DVI
(es backlog de la Fase 2; aquí sí se borra el archivo de lo que esta fase crea — D9).

| # | Decisión |
|---|---|
| **D1** | **Una sola migración** con los tres modelos nuevos (`ActaEntrega`, `DanioOrden`, `Garantia`), los enums de apoyo (`ZonaVehiculo`, `TipoDanio`, `NivelCombustible`, `TipoGarantia`), el campo `OrdenTrabajo.nivelCombustible` y los eventos de auditoría nuevos. Va al final de la fase, con respaldo y aprobación (§6). |
| **D2** | **El diagrama de daños son filas, no un dibujo**: `DanioOrden` (una por zona marcada) con `zona` (enum), `tipo` (enum: golpe, rayón, rotura, faltante, óxido) y `nota` opcional. Se marca sobre una **silueta** (carro o moto según `Vehiculo.tipo`) dibujada como SVG propio en el componente, con una zona por figura; sin trazo libre (así el dato es comparable y consultable). |
| **D3** | **Garantías: registro y consulta, sin avisos.** `Garantia` cuelga de la orden y de la línea cubierta (trabajo → `ManoDeObra`, repuesto → `ItemOrden`), con descripción, cobertura por fecha y/o kilometraje y nota. En el vehículo se listan **todas** sus garantías (consulta), sin filtrar por sede: el vehículo es del taller, no de la sede (misma excepción documentada que clientes y vehículos). |
| **D4** | **Un acta por orden, la de la entrega** (`ordenId @unique`): datos de quien recibe, observaciones de la entrega y **la firma**. El estado con que entró el vehículo (kilometraje, combustible y diagrama) se captura en la recepción y **se imprime dentro del acta**. |
| **D5** | **La firma se captura de dos formas** (elección del usuario): firmando **en pantalla** sobre un `<canvas>` (se guarda como PNG) o **subiendo una foto/escaneo** del acta firmada en papel. El formulario ofrece las dos y basta con una; la acción valida que llegue exactamente una de las dos. |
| **D6** | **Entregar y firmar es una sola operación.** `entregarOrdenAction` cambia el estado a `ENTREGADA` y escribe el acta (con su firma) en la **misma transacción**: `ENTREGADA` es inmutable (`mutable-guard.ts:3-11`), así que no se puede firmar "después" con el guard normal. Si el acta ya existía sin firmar (borrador de entrega), la completa; si el cliente firma más tarde, `firmarActaAction` se permite **una vez** mientras la orden esté `ENTREGADA` y el acta no esté firmada. |
| **D7** | **Roles**: ver y editar la recepción, el acta y las garantías: `ADMIN`, `RECEPCION` y `TECNICO` (como el DVI: `dvi-actions.ts:83`); **borrar** un daño, el acta o una garantía: `ADMIN` y `RECEPCION` (como borrar fotos del DVI: `:124`). Entregar la orden: los tres roles, igual que hoy (`orden-actions.ts:314`). |
| **D8** | **Auditoría de lo que compromete**: `ACTA_FIRMAR` (documento firmado) y `GARANTIA_REGISTRAR` / `GARANTIA_ELIMINAR` (compromiso con el cliente), dentro de la transacción. La recepción y el diagrama no se auditan: son datos de la orden que se editan mientras la orden es mutable (documentado). |
| **D9** | **Storage generalizado y sin huérfanos para lo nuevo**: se extrae un `saveOrdenArchivo(tenantSchema, ordenId, tipo, file)` que reutiliza la validación de *magic bytes* y el allowlist ya existentes (`tipo`: `acta` \| `firma`), y un `borrarUpload(tenantSchema, url)` con el **mismo check anti-traversal** que la ruta de descarga, para que borrar el acta o la foto firmada no deje el archivo en disco. El archivo del DVI sigue igual (su fuga queda como está, fuera de alcance). |
| **D10** | **El dibujo de la firma se aísla en lógica pura** (`src/lib/firma/trazo.ts`: agregar puntos, saber si el trazo está vacío, normalizar coordenadas) y el componente cliente solo pinta: jsdom no trae canvas (`vitest.setup.ts:1-8`), así que lo testeable es la lógica de trazo y la conversión a `File`, no el pixel. |
| **D11** | **El acta se imprime con el navegador**: página `/ordenes/[id]/acta/imprimir` con `print:hidden` para los controles, siguiendo `cotizaciones/[id]/imprimir/page.tsx`. Sin librerías de PDF. |
| **D12** | **La garantía se registra mientras la orden es editable** (sección en la orden) y se muestra también en el acta impresa; no se puede añadir a una orden inmutable (facturada o entregada) salvo por su acta, para no reescribir un documento ya firmado. |

### D13–D24: lo que cambió tras la revisión independiente (fix round)

La revisión del diff completo encontró un **Crítico real** y una familia de carreras. Lo corregido:

| # | Hallazgo → decisión |
|---|---|
| **D13** | **Crítico: la invariante de D6 vivía solo en la UI.** `updateEstadoOrdenAction` seguía aceptando `TERMINADA → ENTREGADA` sin acta, así que un POST directo dejaba la orden ENTREGADA sin acta y **sin forma de crearla** (`guardarActaAction` la rechaza por inmutable). Ahora esa acción **rechaza ENTREGADA** ("se entrega firmando el acta") y `firmarActaAction` **crea** el acta si falta, para que el estado roto sea reparable. |
| **D14** | **Carrera al firmar**: dos envíos simultáneos firmaban dos veces y el archivo del perdedor quedaba huérfano. La escritura pasa a `updateMany({ where: { ordenId, firmadaAt: null } })` y, si `count === 0`, aborta con "El acta ya está firmada" (o la crea si no existía) limpiando el archivo recién guardado. |
| **D15** | **Carrera al entregar**: la transición pasa a `updateMany({ where: { id, estado: <estado leído> } })`; si `count === 0` la transacción aborta ("Otra persona ya cambió el estado") y no se pisa la entrega ya hecha. |
| **D16** | **Carrera al borrar el acta**: `borrarActaAction` validaba fuera de transacción; ahora borra con `deleteMany({ where: { ordenId, firmadaAt: null } })` y exige `esOrdenMutable`, para no dejar una orden entregada sin su acta. |
| **D17** | **Sin campo oculto para la acción**: el `accion` lo aporta el botón pulsado (`name="accion"`) —también sin JS— y el botón de la confirmación lleva el mismo `name`/`value` (`ConfirmacionEnLinea` gana `nombreBoton`/`valorBoton`). |
| **D18** | **La auditoría de entrega apunta al acta** (`upsert` con `select: { id: true }`), no a la orden. |
| **D19** | **El borrado de archivos no alcanza el DVI**: `borrarUpload` pasa a `borrarArchivoDeOrden`, que exige el segmento `ordenes/` además del tenant. |
| **D20** | **El límite del base64 es exacto** (`MAX * 4/3 + 4`) en vez de un 1.4 estimado. |
| **D21** | **`borrarActaAction` se cablea en la UI** (botón "Borrar acta", solo ADMIN/RECEPCION y sin firma) y devuelve `ResultadoAccion`. |
| **D22** | **Una orden anulada no edita el acta** (solo lectura) y el mensaje de inmutabilidad dice el motivo real (anulada / entregada / con factura). |
| **D23** | **El carro también marca sus laterales** (`LATERAL_IZQUIERDO/DERECHO` en la figura del carro): antes un golpe lateral solo cabía en "Otra zona". |
| **D24** | **Claves foráneas `Restrict`** como decía §2: la migración inicial las dejó en `Cascade` y se corrige con una segunda migración (`20261015130000_recepcion_garantias_fk_restrict`) para que borrar una orden no destruya un acta firmada. |
| **D25** | **El canvas no pierde puntos**: el trazo se actualiza con `setTrazos((previos) => …)` (los `pointermove` agrupados partían del mismo estado) y el data URL se deriva de ese mismo trazo; `pointerup` ya no reescribe. |

También se ajustó el enum `ZonaVehiculo` a las zonas que la figura puede marcar (sin `GUARDABARROS_*` muertos),
se quitó el alias tautológico `entregaInputSchema`, se renombraron tests engañosos y se añadieron tests de
permisos/sede, de las dos carreras, del límite del data URL y del acta en solo lectura.

---

## 2. Modelo de datos y validación (Task 1)

**Migración** `prisma/tenant/migrations/<timestamp>_recepcion_garantias/migration.sql`, generada con
`prisma migrate diff` y retocada a mano si hace falta:

```prisma
enum NivelCombustible { VACIO, CUARTO, MEDIO, TRES_CUARTOS, LLENO }
enum ZonaVehiculo { FRENTE, CAPO, PARABRISAS, LATERAL_DERECHO, LATERAL_IZQUIERDO, PUERTA_DERECHA,
                    PUERTA_IZQUIERDA, GUARDABARROS_DERECHO, GUARDABARROS_IZQUIERDO, TECHO, COMPUERTA,
                    RINES, ESPEJO_DERECHO, ESPEJO_IZQUIERDO, MANUBRIO, TANQUE, ASIENTO, OTRO }
enum TipoDanio { GOLPE, RAYON, ROTURA, FALTANTE, OXIDO }
enum TipoGarantia { TRABAJO, REPUESTO }

model DanioOrden {          // @@map("danios_orden")
  id, ordenId (Restrict), zona ZonaVehiculo, tipo TipoDanio, nota String?, creadoPorId Usuario, createdAt
  @@unique([ordenId, zona, tipo])   // la misma marca no se repite
}
model ActaEntrega {         // @@map("actas_entrega")
  id, ordenId @unique (Restrict), recibidoPor String, documentoRecibe String?,
  firmaUrl String?, firmaFotoUrl String?, observaciones String?, firmadaAt DateTime?,
  creadoPorId Usuario, createdAt, updatedAt
}
model Garantia {            // @@map("garantias")
  id, ordenId (Restrict), tipo TipoGarantia, manoDeObraId String?, itemOrdenId String?,
  descripcion String, cubreHasta DateTime? @db.Date, cubreHastaKm Int?, nota String?,
  creadoPorId Usuario, createdAt
  @@index([ordenId]), @@index([manoDeObraId]), @@index([itemOrdenId])
}
// OrdenTrabajo += nivelCombustible NivelCombustible?, acta ActaEntrega?, danios DanioOrden[], garantias Garantia[]
```

Enums de auditoría nuevos (`ALTER TYPE … ADD VALUE`, una sentencia por valor):
`ACTA_FIRMAR`, `GARANTIA_REGISTRAR`, `GARANTIA_ELIMINAR` + sus dos entradas en `catalogo.ts`.

Validación (`src/lib/validation/recepcion.ts`, todo en español):
`nivelCombustibleSchema`, `danioInputSchema` (`zona`, `tipo`, `nota` ≤ 200 opcional),
`actaEntregaInputSchema` (`recibidoPor` 1…120, `documentoRecibe` ≤ 40 opcional, `observaciones` ≤ 500
opcional, y refinamiento: exactamente una de `firmaUrl` / `firmaFotoUrl`),
`garantiaInputSchema` (`tipo`, `descripcion` 1…200, `cubreHasta` opcional, `cubreHastaKm` ≥ 0 opcional,
`nota` ≤ 300 opcional, y al menos una cobertura o ninguna — se documenta que sin cobertura la garantía
es informativa) y `entregaInputSchema` (los campos del acta + el `estado` destino implícito).

---

## 3. Tareas

### Task 1: esquema, migración y validación

**Archivos:** `prisma/tenant/schema.prisma`, `prisma/tenant/migrations/<ts>_recepcion_garantias/migration.sql`,
`src/lib/validation/recepcion.ts` (+ `recepcion.test.ts`), `src/lib/auditoria/catalogo.ts`.

1. Añadir los modelos, enums y el campo a `OrdenTrabajo` con `@@map` en snake_case e `@@index` en las FK
   (Postgres no indexa las FK solo).
2. Generar la migración con `migrate diff` contra el schema de `main` y **revisarla a mano** (orden de
   las sentencias, `ALTER TYPE` uno por valor). No aplicarla todavía.
3. Regenerar el cliente de Prisma (los modelos nuevos no existen hasta regenerar; `tsc` fallará).
4. `catalogo.ts`: los tres tipos nuevos en `TIPOS_EVENTO_AUDITORIA` y sus etiquetas en el `Record`.
5. `recepcion.ts` con los esquemas de §2 y sus tests (mensajes en español, límites, el refinamiento de
   "exactamente una firma", coberturas opcionales).
6. Verificar (§0.3), commit `fase21-task 1: esquema, migracion y validacion de recepcion y garantias`, **pedir aprobación**.

### Task 2: storage generalizado (acta y firma sin huérfanos)

**Archivos:** `src/lib/storage/local-file-storage.ts` (+ `local-file-storage.test.ts`).

1. Extraer el guardado a un helper privado y exponer `saveOrdenArchivo(tenantSchema, ordenId, tipo, file)`
   con `tipo: "acta" | "firma"`, que escribe en `<tenant>/ordenes/<ordenId>/<tipo>/<uuid>.<ext>` y
   devuelve `{ relativePath, url }`; `saveDviFoto` pasa a delegar en el helper **sin cambiar su ruta ni su
   comportamiento** (los tests del DVI deben seguir pasando tal cual).
2. `borrarUpload(tenantSchema, url)`: resuelve la ruta bajo la raíz **con el mismo check anti-traversal**
   que `src/app/api/uploads/[...path]/route.ts:33-36`, ignora un `ENOENT` (borrar dos veces no es un
   error) y devuelve si borró algo.
3. Tests contra el sistema de archivos real (`mkdtemp` + `UPLOADS_DIR`, como el test existente): guarda
   y borra, rechaza un MIME no permitido y un archivo sin *magic bytes* válidos, no deja salir de la raíz
   con `../` en la URL y no falla si el archivo ya no está.
4. Verificar (§0.3), commit `fase21-task 2: storage de archivos de la orden y borrado sin huerfanos`, **pedir aprobación**.

### Task 3: acciones de recepción, acta, entrega y garantías

**Archivos:** `src/app/actions/recepcion-actions.ts` (+ `recepcion-actions.test.ts`).

1. `guardarRecepcionAction(ordenId, prev, formData)`: nivel de combustible y kilometraje de ingreso
   (reutilizando `kilometrajeIngreso`), rol de los tres, guard `esOrdenMutable` + `scopeOrden`.
2. `agregarDanioAction(ordenId, prev, formData)` / `quitarDanioAction(danioId)`: marcas del diagrama; el
   `@@unique([ordenId, zona, tipo])` da mensaje propio ("Esa zona ya está marcada con ese daño").
3. `guardarActaAction(ordenId, prev, formData)`: crea o actualiza el acta (datos de quien recibe,
   observaciones) mientras la orden no esté firmada; con firma (canvas o foto) guarda el archivo con
   `saveOrdenArchivo`, marca `firmadaAt` y **audita `ACTA_FIRMAR`**; borrar el acta (solo
   `ADMIN`/`RECEPCION` y solo si no está firmada) borra también su archivo con `borrarUpload`.
4. `entregarOrdenAction(ordenId, prev, formData)`: **una transacción** que valida la transición
   (`estado-transitions.ts`), exige el acta con su firma, guarda el archivo, crea/actualiza el acta
   firmada, pasa la orden a `ENTREGADA` (con `entregadaAt`, como `orden-actions.ts:335`) y audita. Si el
   acta ya estaba firmada, basta con cambiar el estado.
5. `firmarActaAction(ordenId, prev, formData)`: permite firmar **una vez** un acta pendiente de una orden
   `ENTREGADA` (D6), auditando igual.
6. `agregarGarantiaAction(ordenId, prev, formData)` / `quitarGarantiaAction(garantiaId)`: registro y
   borrado con auditoría, validando que la línea cubierta (`manoDeObraId`/`itemOrdenId`) **pertenece a esa
   orden**, y que la orden es editable (D12).
7. `listGarantiasDeVehiculo(vehiculoId)`: consulta para la ficha del vehículo, **sin filtro de sede**
   (D3), con `select` mínimo (nunca la fila completa de `Usuario`).
8. Tests (BD y storage mockeados, `FormData` + `File` reales como en `dvi-actions.test.ts:141`): roles y
   sede ajena; orden inmutable rechazada; guardar recepción y daños; el refinamiento de una sola firma;
   acta firmada por canvas y por foto; entrega que exige firma y escribe todo en una transacción; firmar
   dos veces rechazado; garantía de una línea de otra orden rechazada; borrado que llama a `borrarUpload`.
9. Verificar (§0.3), commit `fase21-task 3: acciones de recepcion, acta de entrega y garantias`, **pedir aprobación**.

### Task 4: UI en la orden (recepción, daños, acta y garantías)

**Archivos:** `src/app/(dashboard)/ordenes/[id]/recepcion-form.tsx`, `diagrama-danios.tsx`,
`acta-entrega-form.tsx`, `firma-canvas.tsx`, `garantias-section.tsx`, `src/lib/firma/trazo.ts`
(+ `trazo.test.ts`), `page.tsx` (dos tarjetas nuevas y la entrega con firma), `cambiar-estado-form.tsx`.

1. `trazo.ts` (puro): `agregarPunto`, `hayTrazo`, `normalizarPuntos`, `trazoAPng`-equivalente en cliente
   no (el canvas lo pinta el componente) — la lógica que sí se testea es la de puntos y la de "¿está
   vacío?".
2. `firma-canvas.tsx`: `<canvas>` con `pointerdown/move/up`, botón "Limpiar", y al enviar convierte el
   canvas a `File` PNG (con `toBlob`), que va en el `FormData`; en jsdom se mockea `toBlob` en el test.
3. `diagrama-danios.tsx`: silueta SVG propia (carro y moto según `Vehiculo.tipo`) con zonas como
   `<path>`/`<rect>` clicables, la lista de marcas con su nota y el botón de quitar.
4. `recepcion-form.tsx` (combustible + kilometraje), `acta-entrega-form.tsx` (quien recibe, documento,
   observaciones, firma en pantalla o foto, y el botón de entregar con `ConfirmacionEnLinea` porque es
   irreversible) y `garantias-section.tsx` (añadir por línea de trabajo o repuesto, con cobertura).
5. `page.tsx`: tarjeta "Recepción y daños" (después de Información) y tarjeta "Acta de entrega y
   garantías" (antes de Anticipos), con `soloLectura` cuando la orden no es mutable; el enlace a la
   versión imprimible.
6. Tests de los componentes (`page.test.tsx` si existe, o los nuevos `.test.tsx`): render con y sin
   marcas, el formulario de firma que exige una de las dos, el aviso de orden inmutable y el flujo de
   entrega.
7. Verificar (§0.3), commit `fase21-task 4: recepcion, diagrama de danios, acta y garantias en la orden`, **pedir aprobación**.

### Task 5: acta imprimible y consulta de garantías en el vehículo

**Archivos:** `src/app/(dashboard)/ordenes/[id]/acta/imprimir/page.tsx`,
`.../acta/imprimir/boton-imprimir.tsx` (+ tests), `src/app/(dashboard)/vehiculos/[id]/garantias-card.tsx`
(+ test), `src/app/(dashboard)/vehiculos/[id]/page.tsx`.

1. Página imprimible del acta: datos del taller, cliente y vehículo, kilometraje y combustible de ingreso,
   el diagrama de daños con sus notas (la misma silueta, en modo lectura), trabajos y repuestos, las
   garantías registradas, los datos de la entrega, la firma y las fechas; `print:hidden` en el botón y
   los enlaces. Sin sesión no se ve (guard como el resto).
2. Tarjeta "Garantías" en la ficha del vehículo: lista con origen (orden), línea cubierta, cobertura
   (fecha y/o km), nota y estado (vigente o vencida según la fecha y el kilometraje actual).
3. Tests: la página imprime lo que debe (con datos de ejemplo, incluidos los daños y la firma) y la
   tarjeta lista vigentes y vencidas.
4. Verificar (§0.3), commit `fase21-task 5: acta imprimible y garantias del vehiculo`, **pedir aprobación**.

---

## 4. Seguridad

Todo pasa por `getTenantDb(session.user.tenantSchema)` con guard antes de cualquier lectura/escritura, y
cada orden se busca con `findFirst` + `scopeOrden(session.user.sedeActivaId)` (nunca `findUnique` por id
solo). Roles según D7. Los archivos: MIME y *magic bytes* validados en el servidor, 5 MB de tope, ruta
bajo el tenant de la sesión y borrado con el mismo check anti-traversal que la descarga; el nombre del
archivo subido nunca se usa como ruta. La firma y el documento de quien recibe son datos personales: se
guardan solo en la orden y el acta (no se exponen a quien no ve la orden) y ninguna consulta devuelve
filas completas de `Usuario` (siempre `select` mínimo). El acta firmada es inmutable salvo el borrado
explícito de `ADMIN`/`RECEPCION` mientras no esté firmada.

## 5. Verificación final de la fase

`npx tsc --noEmit` (`--incremental false` si hay sandbox), `npm test` completo, `npx eslint` en lo tocado
y `npm run build`. Revisar el diff completo de la rama contra este documento (revisión final con otro
modelo) y hacer el fix round de los hallazgos. Reporte.

## 6. Cierre (solo con aprobación del usuario)

1. Respaldo en el servidor (`ssh` + `pg_dump` a `~/backups/torqueflow_<fecha>_pre_fase21.sql`, con la URL
   de `DATABASE_URL` del `.env` sin `?schema=`).
2. Aplicar la migración a cada schema de tenant (`taller_dev`, `taller_dev_reference`):
   `TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=<schema>" npx prisma migrate deploy --schema=prisma/tenant/schema.prisma`
   y verificar `npx prisma migrate diff --from-url "<misma URL>" --to-schema-datamodel prisma/tenant/schema.prisma --script` → "empty migration".
3. Dejar `npm run dev` corriendo para la prueba manual del usuario (en un clon/worktree aparte del
   checkout de producción, como en la fase 20) y probar el flujo completo: recepción con daños → entrega
   firmada en pantalla → acta impresa → garantía registrada y vista en el vehículo.
4. Con el visto bueno: `git checkout main && git pull && git merge --no-ff fase21-recepcion-garantias`,
   actualizar `PROJECT_BRIEF.md` (estado, roadmap y la nota del ledger) y push. El deploy lo hace el
   usuario (pull + `npx prisma generate` + build + reinicio; esta fase **no** cambia dependencias).
