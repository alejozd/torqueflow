# Diseño: checklist del DVI configurable por tenant

## Contexto

El checklist de la Inspección Vehicular Digital (DVI) de una orden hoy es una lista fija
de 8 puntos, codificada en `src/lib/dvi/checklist-items.ts` (`DVI_CHECKLIST_ITEMS`).
Todo lo que depende de esa lista la importa directamente: `dvi-actions.ts` (para saber
qué campos leer del formulario al guardar) y `dvi-checklist-form.tsx` (para renderizar
las filas).

El dato guardado (`Dvi.checklist`) ya es `Json` libre — un `Record<string, DviChecklistStatus>`
sin esquema fijo en la base de datos — así que hacer la lista configurable no requiere
migrar datos existentes, solo dejar de asumir que las claves son siempre esas 8.

Se eligió un patrón más simple que un catálogo con edición completa: solo crear
ítems nuevos y activar/desactivar los existentes (sin editar label/key, sin reordenar
manualmente, sin borrado duro). Mismo nivel de simplicidad que `MarcaVehiculo`/
`ModeloVehiculo` (`vehiculo-marca-modelo-actions.ts`), con una diferencia deliberada:
esos catálogos arrancan vacíos por tenant, pero el checklist del DVI sí se siembra con
los 8 puntos actuales como default, porque es un estándar de inspección casi universal
(a diferencia de marca/modelo, que no tiene un default sensato).

Solo ADMIN puede crear o desactivar ítems (mismo criterio que crear una Marca).
ADMIN, RECEPCION y TECNICO siguen pudiendo llenar el estado de cualquier ítem activo,
sin cambios respecto a hoy.

## Cambios

### 1. Modelo `DviChecklistItem` (`prisma/tenant/schema.prisma`)

Tenant-scoped (mismo nivel que `MarcaVehiculo`: sin `sedeId`, el checklist es del
taller completo, no de una sede).

```prisma
model DviChecklistItem {
  id        String   @id @default(cuid())
  key       String   @unique
  label     String
  activo    Boolean  @default(true)
  orden     Int
  createdAt DateTime @default(now()) @map("created_at")

  @@map("dvi_checklist_items")
}
```

`key` se genera una sola vez al crear el ítem (slug de `label`, ver punto 3) y nunca
cambia — no hay edición de label/key en esta fase, así que no existe el problema de
"la clave guardada en `checklist` ya no coincide con ningún item". `orden` es un entero
simple; un ítem nuevo siempre se agrega al final (`max(orden) + 1`).

Nueva migración de Prisma para este modelo.

### 2. Seed para tenants nuevos (`scripts/provision-tenant.ts:55-62`)

Justo después de crear `Sede principal` y `Bodega principal`, insertar los 8
`DEFAULT_DVI_CHECKLIST_ITEMS` (ver punto 4) como filas `DviChecklistItem` con
`orden` 0-7 y `activo: true`.

### 3. Backfill para tenants existentes (`scripts/backfill-dvi-checklist-items.ts`, nuevo)

Mismo patrón que `scripts/backfill-tenant-user-index.ts`: itera `publicDb.tenant.findMany()`,
y por cada tenant inserta los 8 ítems default en su schema **solo si ese tenant todavía no
tiene ninguna fila en `DviChecklistItem`** (chequeo simple por conteo, no por `key`
individual — evita duplicar si el script se corre dos veces, sin necesitar el detalle de
conflictos de `backfillTenantUserIndex`). Necesario para que las órdenes ya existentes
(cuyo `checklist` JSON ya usa las claves `luces`, `frenos`, etc.) sigan resolviendo una
etiqueta después de este cambio.

Con su propio test, mismo estilo que `backfill-tenant-user-index.test.ts`.

### 4. `src/lib/dvi/checklist-items.ts`

Se mantiene como fuente de los defaults de seed, renombrando la exportación para
reflejar su nuevo rol:

- `DVI_CHECKLIST_ITEMS` → `DEFAULT_DVI_CHECKLIST_ITEMS` (mismo contenido, los 8 puntos
  actuales — usado solo por `provision-tenant.ts` y el backfill).
- `DVI_CHECKLIST_STATUSES` y `DviChecklistStatus` no cambian (el enum de estado
  OK/ATENCION/CRITICO/NO_APLICA sigue fijo, eso no se vuelve configurable).
- `DviChecklistKey` (union literal) se elimina — ya no tiene sentido cuando las claves
  las define ADMIN en tiempo de ejecución.
- `DviChecklist` pasa de `Partial<Record<DviChecklistKey, DviChecklistStatus>>` a
  `Partial<Record<string, DviChecklistStatus>>`. Este es el único retroceso real de
  tipado: se pierde el autocompletado/chequeo en compilación de las claves del
  checklist. Es inevitable al volverlo configurable en runtime.

### 5. `src/lib/validation/dvi.ts`

Nuevo `dviChecklistItemInputSchema = z.object({ label: z.string().min(1, "El nombre es obligatorio") })`,
mismo estilo que `marcaVehiculoInputSchema` en `validation/vehiculo-marca-modelo.ts`.

### 6. `src/app/actions/dvi-checklist-item-actions.ts` (nuevo)

Mismo estilo que `vehiculo-marca-modelo-actions.ts`:

- `listDviChecklistItems(): Promise<DviChecklistItem[]>` — `requireSession()`, devuelve
  **todos** los ítems (activos e inactivos) ordenados por `orden`. Todos, porque
  `DviChecklistForm` necesita conocer los inactivos para poder mostrar en modo lectura
  un valor ya guardado contra una clave desactivada (ver punto 8).
- `crearDviChecklistItemAction(prevState, formData): Promise<DviChecklistItemFormState>` —
  `requireRole(["ADMIN"])`. Valida `label` con `dviChecklistItemInputSchema`. Genera
  `key` con un slug de `label` (reutilizando `normalizeForSearch` de `@/lib/search` +
  reemplazo de no-alfanuméricos por guiones, mismo criterio que el `slugify` local de
  `crear-tenant-form.tsx:26`), y si esa `key` ya existe le agrega un sufijo numérico
  (`-2`, `-3`, ...) hasta encontrar una libre. `orden = (max existente) + 1`. Crea con
  `activo: true`.
- `toggleDviChecklistItemActivoAction(itemId): Promise<{ error: string | null }>` —
  `requireRole(["ADMIN"])`. Invierte `activo` del ítem. No valida ni toca `orden`/`key`/`label`.

### 7. `updateDviChecklistAction` (`src/app/actions/dvi-actions.ts:18-59`)

- Reemplaza el `for (const item of DVI_CHECKLIST_ITEMS)` por una consulta a
  `tenantDb.dviChecklistItem.findMany({ where: { activo: true } })` (mismo `tenantDb`
  ya resuelto en la función).
- Cambio de comportamiento necesario: hoy el `checklist` guardado se **reemplaza por
  completo** en cada guardado (línea 23, `const checklist: DviChecklist = {}` arranca
  vacío). Pasa a hacer **merge**: leer el `checklist` actual del `Dvi` existente (si lo
  hay) y solo sobrescribir las claves de los ítems activos presentes en el formulario,
  dejando intactas las claves de ítems ya desactivados. Sin esto, la próxima vez que
  alguien guarde el checklist de una orden borraría silenciosamente cualquier hallazgo
  ya registrado contra un ítem que un ADMIN desactivó después.

### 8. `DviChecklistForm` (`src/app/(dashboard)/ordenes/[id]/dvi-checklist-form.tsx`)

- Deja de importar `DVI_CHECKLIST_ITEMS`; recibe `items: DviChecklistItem[]` (todos,
  activos e inactivos — de `listDviChecklistItems()`) y `esAdmin: boolean` como props
  nuevas.
- Fila por cada ítem con `activo: true`: igual que hoy (punto + label + `SelectField`
  de estado).
- Fila de solo lectura (sin `SelectField`, un badge "Archivado" + el label + el último
  estado guardado) por cada clave presente en `checklist` cuyo `DviChecklistItem` tiene
  `activo: false` — así un hallazgo ya registrado nunca desaparece de la vista aunque
  el ítem se haya desactivado después.
- Si `esAdmin`: botón "+ Agregar ítem" que abre un diálogo nuevo `NuevoDviChecklistItemDialog`
  (mismo patrón que `NuevaMarcaDialog` — un solo campo "Nombre", llama a
  `crearDviChecklistItemAction`, se agrega a la lista local al crear sin esperar
  `revalidatePath`); y un switch pequeño en cada fila activa que llama a
  `toggleDviChecklistItemActivoAction` para desactivarla.
- Si no es ADMIN: no ve ni el botón "+" ni el switch, solo los `SelectField` de los
  ítems activos y las filas archivadas de solo lectura.

### 9. `ordenes/[id]/page.tsx`

- Junto al `Promise.all` existente (líneas 155-159 aprox.), agrega
  `listDviChecklistItems()`.
- Pasa `items` y `esAdmin={session.user.role === "ADMIN"}` (mismo criterio ya usado en
  este archivo para `puedeReasignar`, línea 255) a `<DviChecklistForm />`.

## Fuera de alcance

- Editar el `label` (o la `key`) de un ítem existente.
- Reordenar ítems manualmente (drag-and-drop o similar) — el orden de creación alcanza
  para esta fase.
- Borrado duro de un ítem (solo desactivar).
- Que un rol distinto de ADMIN pueda crear o desactivar ítems.
- Una pantalla de administración dedicada — todo vive inline en la propia sección DVI
  de la orden.

## Tests a actualizar (Strict TDD Mode)

- `checklist-items.test.ts`: se actualiza para probar `DEFAULT_DVI_CHECKLIST_ITEMS` en
  vez de `DVI_CHECKLIST_ITEMS` (mismos casos, solo el nombre cambia).
- `dvi-checklist-item-actions.test.ts` (nuevo): creación exitosa con `orden` correcto;
  rechazo de `label` vacío; generación de `key` con sufijo numérico ante colisión;
  `requireRole(["ADMIN"])` rechaza TECNICO/RECEPCION; toggle de `activo` funciona en
  ambos sentidos.
- `backfill-dvi-checklist-items.test.ts` (nuevo): inserta los 8 defaults en un tenant
  sin ítems; no duplica si se corre dos veces sobre el mismo tenant.
- `dvi-actions.test.ts` (si existe, o el archivo de test correspondiente a
  `updateDviChecklistAction`): el caso de guardar el checklist debe verificar que un
  valor ya guardado contra una clave ahora inactiva sobrevive un guardado posterior
  (el nuevo comportamiento de merge).
- Ningún test de `dvi-checklist-form.tsx` existe hoy — no hay que actualizar ninguno,
  pero conviene agregar cobertura básica de: fila "Archivado" se muestra para una
  clave inactiva con valor guardado; el botón "+ Agregar ítem" y el switch de
  desactivar solo aparecen cuando `esAdmin` es `true`.
