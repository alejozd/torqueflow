# Fase 18 — Catálogo de servicios y kits (spec + plan de tareas)

> Rama: `fase18-catalogo-servicios` · Roadmap ítems 7 y 11
> (`docs/superpowers/plans/2026-10-10-roadmap-modulos-faltantes.md`).
> Documento **autocontenido**: puede ejecutarlo cualquier agente (Claude, DeepSeek, etc.)
> sin el historial de la conversación. Leer completo antes de empezar.
> **Estado: plan escrito, NO ejecutado.** Empezar por la Task 1.

---

## 0. Instrucciones para el agente ejecutor (OBLIGATORIAS)

1. Leer antes de tocar código: `AGENTS.md` (este Next.js 16 tiene cambios incompatibles: consultar
   `node_modules/next/dist/docs/` antes de usar APIs de Next), `RULES.md` y `PROJECT_BRIEF.md`.
2. Trabajar **solo** en la rama `fase18-catalogo-servicios` (ya existe). No tocar `main`.
3. **Una tarea a la vez.** Al terminar cada tarea:
   - `npx tsc --noEmit` limpio y `npm test` completo pasando (pegar el resumen "Test Files / Tests").
   - `npx eslint <archivos tocados>` sin errores.
   - Commit `fase18-task N: <descripción>` con trailer `Co-Authored-By: <modelo que ejecuta> <noreply@...>`; `git push`.
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
10. Si se ejecuta dentro de un sandbox confinado (p. ej. el agente DSH en modo `workspace-write`):
    `npx tsc --noEmit` falla con `TS5033` al escribir `tsconfig.tsbuildinfo` → usar
    `npx tsc --noEmit --incremental false` (mismo resultado, no ensucia el árbol). `npm test` y
    `npm run build` no arrancan en modo confinado (Vite y Next lanzan subprocesos con pipes:
    `spawn EPERM`), así que requieren acceso completo o ejecutarlos el usuario; **no son fallos del
    proyecto**. `npx prisma migrate diff` y `npx prisma generate` tienen la misma limitación (motor
    en subproceso).

### Patrones del proyecto a reutilizar (leerlos)
- Server actions guard → Zod → BD → `revalidatePath`: `src/app/actions/gasto-actions.ts`,
  `src/app/actions/categoria-gasto-actions.ts` (CRUD con activar/desactivar y nombre único sin
  distinguir mayúsculas: `findFirst({ where: { nombre: { equals, mode: "insensitive" } } })`).
- Agregar líneas a una orden: `src/app/actions/item-orden-actions.ts` (`addItemOrdenAction`) y
  `src/app/actions/mano-de-obra-actions.ts` (`addManoDeObraAction`): roles ADMIN/RECEPCION/TECNICO,
  alcance `scopeOrden(session.user.sedeActivaId)` (`src/lib/sede/scope.ts`) y `assertOrdenMutable(orden)`.
  Los repuestos **no** descuentan stock al agregarse: el stock se descuenta al facturar.
- Agregar líneas a una cotización: `agregarItemCotizacionAction` en `src/app/actions/cotizacion-actions.ts`
  (tipos `REPUESTO` / `MANO_OBRA`, `cantidad` Decimal).
- Guards `requireRole` / `requireSession` (`src/lib/auth/guards.ts`); BD `getTenantDb(session.user.tenantSchema)`;
  errores `friendlyPrismaErrorMessage` (`src/lib/db/prisma-error-message.ts`); dinero `roundMoney`;
  `Decimal` → `number` antes de componentes cliente.
- UI: configuración tipo lista editable `src/app/(dashboard)/gastos/configuracion/` (categorías y
  plantillas), diálogos con react-hook-form `src/app/(dashboard)/gastos/gasto-dialog.tsx`,
  `Combobox` (`src/components/ui/combobox.tsx`) para buscar repuestos, `ConfirmacionEnLinea`,
  toasts `sonner` (try/catch en transiciones), menú `src/app/(dashboard)/dashboard-sidebar.tsx`.
- Migraciones sin BD: `npx prisma migrate diff --from-schema-datamodel <anterior> --to-schema-datamodel prisma/tenant/schema.prisma --script`.

---

## 1. Objetivo y decisiones (revisar/aprobar antes de ejecutar)

Que el taller tenga un **catálogo de servicios** con precio base de mano de obra (p. ej. "Cambio de
aceite", "Alineación") y que un servicio pueda incluir **repuestos** (eso lo convierte en **kit**).
Al aplicarlo a una orden o cotización se crean de una vez la línea de mano de obra y las de
repuestos, que luego se pueden editar como cualquier línea.

| # | Decisión |
|---|---|
| D1 | Un **servicio** = nombre (único sin distinguir mayúsculas), descripción opcional, precio de mano de obra, activo/inactivo. Si tiene repuestos asociados es un **kit**. No se borra: se desactiva. |
| D2 | Repuestos del kit: `repuestoId` + cantidad (entero ≥ 1 para órdenes). El **precio** de cada repuesto se toma de `Repuesto.precioVenta` **al momento de aplicar** (no se guarda en el kit). |
| D3 | Aplicar a una **orden**: crea 1 `ManoDeObra` (descripción = nombre del servicio, valor = precio de mano de obra, mecánico = el asignado a la orden si hay) + 1 `ItemOrden` por repuesto (descripción = nombre del repuesto, cantidad, `precioUnitario` = precio de venta actual). Todo en una transacción. Mismos roles y validaciones que agregar líneas a mano (ADMIN/RECEPCION/TECNICO, alcance de sede, orden mutable). |
| D4 | Aplicar a una **cotización**: crea 1 `ItemCotizacion` MANO_OBRA + 1 REPUESTO por repuesto, con las mismas reglas de roles/estado que `agregarItemCotizacionAction`. |
| D5 | El texto libre y el agregar repuesto/mano de obra sueltos **siguen igual**. El servicio solo prellena. |
| D6 | Precio de mano de obra 0 está permitido (servicio que solo agrupa repuestos); si el precio es 0 no se crea la línea de mano de obra. |
| D7 | Si un repuesto del kit fue eliminado, la relación se borra en cascada (el kit pierde ese repuesto). |
| D8 | Administrar el catálogo: **solo ADMIN**, página `/servicios` en el grupo **Inventario** del menú (visible solo ADMIN). Aplicar servicios: los roles de D3/D4. |
| D9 | Fuera de alcance: tiempo estándar por servicio, precios por tipo de vehículo, servicios en citas, importar catálogo (Fase 20). |
| D10 | **El kit no cruza sedes.** `Servicio` es del tenant, pero sus repuestos se limitan a los de la sede activa: `agregarRepuestoAServicioAction` solo acepta repuestos alcanzables con `scopeRepuesto(sedeActivaId)`, y la vista de aplicación (`listServicios({ soloActivos: true })`) devuelve únicamente los repuestos de la sede activa del usuario. La página `/servicios` del ADMIN **lista** el kit completo del tenant, pero el **alta** de repuestos al kit usa la misma lista acotada a la sede activa (`listRepuestoOptions`): para armar el kit de otra sede hay que cambiar de sede activa. Al aplicar (Tasks 3 y 4) cada repuesto se revalida con `scopeRepuesto(sedeActivaId)` antes de crear su línea. La mano de obra del servicio sí es del tenant completo. |
| D11 | Aplicar un servicio que no aporta nada en la sede activa (precio de mano de obra 0 **y** sin repuestos) no crea nada y devuelve un error explícito ("El servicio no tiene nada que agregar"), no un `success` vacío con `agregados` en cero. |
| D12 | Un mismo servicio puede aplicarse varias veces al mismo documento: no hay deduplicación. Las líneas resultantes se editan o quitan como cualquier otra (es el mismo criterio que el texto libre de D5). |
| D13 | Decisiones del fix round (revisión final de la rama): (a) el tope `CANTIDAD_MAXIMA_KIT = 1000` se comprueba sobre el **acumulado** del kit, no solo sobre la línea que se envía, porque el alta suma cantidades vía `increment`; (b) el `mecanicoId` que hereda la línea de mano de obra se revalida contra `sedes: { some: { sedeId } }` —si el técnico ya no pertenece a la sede, la línea se crea sin mecánico en vez de arrastrar uno ajeno—; (c) las opciones de `listServicios` pasan por Zod (`listarServiciosInputSchema`), ya que de `soloActivos` depende el rol exigido. |

---

## 2. Modelo de datos (Task 1)

```prisma
/// Servicio del catálogo; con repuestos asociados funciona como kit.
model Servicio {
  id              String            @id @default(cuid())
  nombre          String            @unique
  descripcion     String?
  precioManoObra  Decimal           @map("precio_mano_obra") @db.Decimal(10, 2)
  activo          Boolean           @default(true)
  repuestos       ServicioRepuesto[]
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")

  @@map("servicios")
}

model ServicioRepuesto {
  id         String   @id @default(cuid())
  servicioId String   @map("servicio_id")
  servicio   Servicio @relation(fields: [servicioId], references: [id], onDelete: Cascade)
  repuestoId String   @map("repuesto_id")
  repuesto   Repuesto @relation(fields: [repuestoId], references: [id], onDelete: Cascade)
  cantidad   Int

  @@unique([servicioId, repuestoId])
  // Postgres no indexa la FK por sí solo: el onDelete: Cascade desde Repuesto
  // necesita este índice o cada borrado de repuesto recorre el kit entero.
  @@index([repuestoId])
  @@map("servicio_repuestos")
}
```

Relación inversa en `Repuesto`: `servicios ServicioRepuesto[]`.

---

## 3. Tareas

### Task 1: Esquema, migración y validación

**Archivos:** `prisma/tenant/schema.prisma`; `prisma/tenant/migrations/20261013120000_catalogo_servicios/migration.sql`;
`src/lib/validation/servicio.ts` (+ `servicio.test.ts`).

1. Agregar §2 al schema. Generar la migración con `git show main:prisma/tenant/schema.prisma > "$TEMP/antes.prisma"`
   y `npx prisma migrate diff --from-schema-datamodel "$TEMP/antes.prisma" --to-schema-datamodel prisma/tenant/schema.prisma --script > prisma/tenant/migrations/20261013120000_catalogo_servicios/migration.sql`
   (crear la carpeta). `npx prisma validate` y `npx prisma generate`. Revisar el SQL generado: debe
   contener las dos FK con `ON DELETE CASCADE` y el índice de `repuesto_id` (`@@index([repuestoId])`);
   si `prisma migrate diff` no lo emitiera, añadirlo a mano antes de dar la tarea por cerrada.
2. `src/lib/validation/servicio.ts` (tests primero):
   - `servicioInputSchema = z.object({ nombre: z.string().trim().min(1, "El nombre es obligatorio").max(80, "El nombre admite máximo 80 caracteres"), descripcion: z.string().trim().max(300).optional().transform(v => v || undefined), precioManoObra: z.coerce.number({ error: "El precio debe ser un número" }).min(0, "El precio no puede ser negativo").max(99_999_999.99, "El precio es demasiado alto") })`
   - `servicioRepuestoInputSchema = z.object({ repuestoId: z.string().trim().min(1, "Selecciona un repuesto"), cantidad: z.coerce.number().int("La cantidad debe ser un número entero").min(1, "La cantidad mínima es 1").max(1000, "La cantidad es demasiado alta") })`
   Tests: válido (recorta textos, convierte números), nombre vacío, precio negativo, cantidad 0 y 1.5.
3. Verificar (§0.3), commit `fase18-task 1: esquema y validación del catálogo de servicios`, **pedir aprobación**.

### Task 2: Catálogo — actions y página `/servicios`

**Archivos:** `src/app/actions/servicio-actions.ts` (+ test); `src/app/(dashboard)/servicios/page.tsx`,
`loading.tsx`, `servicios-section.tsx`, `servicio-dialog.tsx`, `kit-repuestos-editor.tsx` (+ tests); sidebar.

Actions (todas con guard primero; montos a `number`):
- `listServicios(opciones?: { soloActivos?: boolean })` → `ServicioVista[]` `{ id, nombre, descripcion, precioManoObra, activo, repuestos: { repuestoId, codigo, nombre, cantidad, precioVenta }[], totalEstimado }`
  (`totalEstimado` = precioManoObra + Σ cantidad × precioVenta, con `roundMoney`). `soloActivos: true` → ADMIN/RECEPCION/TECNICO; todos → ADMIN. Orden por nombre. Con `soloActivos: true` (vista de aplicación) los `repuestos` y el `totalEstimado` se calculan **solo con los repuestos de `scopeRepuesto(sedeActivaId)`** (D10); la vista del ADMIN devuelve el kit completo del tenant.
- `crearServicioAction(prev, formData)` / `actualizarServicioAction(id, prev, formData)` — ADMIN; nombre
  duplicado sin distinguir mayúsculas → "Ya existe un servicio con ese nombre" (también P2002).
- `toggleServicioActivoAction(id)` — ADMIN → `{ error: string | null }`.
- `agregarRepuestoAServicioAction(servicioId, prev, formData)` — ADMIN; valida que el repuesto exista
  **y que pertenezca a la sede activa** (`scopeRepuesto`, D10; si no → "Repuesto no encontrado"); si ya
  está en el kit, **suma** la cantidad (upsert por `servicioId_repuestoId`) y la UI informa la cantidad
  resultante en el toast (no un genérico "agregado").
- `actualizarCantidadRepuestoServicioAction(servicioId, repuestoId, cantidad)` y
  `quitarRepuestoDeServicioAction(servicioId, repuestoId)` — ADMIN.

Página `/servicios` (`requireRole(["ADMIN"])`): lista de servicios (nombre, insignia "Kit" si tiene
repuestos, precio de mano de obra, total estimado, insignia "Inactivo"), botón "Nuevo servicio"
(diálogo con nombre, descripción, precio de mano de obra), "Editar", "Desactivar/Activar". Cada
servicio se expande para editar su kit: tabla de repuestos (código, nombre, cantidad editable,
precio de venta actual, subtotal, quitar con `ConfirmacionEnLinea`) y un `Combobox` para buscar y
agregar un repuesto con cantidad. Menú: "Servicios" en el grupo **Inventario**, solo ADMIN (el grupo
Inventario hoy lo ve todo el mundo: agregar el ítem solo cuando `esAdmin`).

Tests: roles por action, nombre duplicado (mayúsculas), upsert de cantidad, `totalEstimado`,
repuesto de otra sede rechazado por `agregarRepuestoAServicioAction`, vista de aplicación limitada a
la sede activa (D10), UI (lista, insignias, toggle, agregar repuesto llama la action).

Verificar, commit `fase18-task 2: catálogo de servicios y kits`, **pedir aprobación**.

### Task 3: Aplicar un servicio a una orden

**Archivos:** `src/app/actions/servicio-actions.ts` (`aplicarServicioAOrdenAction`) (+ test);
`src/app/(dashboard)/ordenes/[id]/aplicar-servicio-form.tsx` (+ test); `ordenes/[id]/page.tsx`.

- `aplicarServicioAOrdenAction(ordenId, prev, formData)` (campo `servicioId`): roles
  ADMIN/RECEPCION/TECNICO; orden con `scopeOrden(session.user.sedeActivaId)` (si no existe →
  "Orden no encontrada"); `assertOrdenMutable(orden)` igual que `addItemOrdenAction` (devolver su
  mensaje); servicio activo (si no → "El servicio no está disponible"). En **una transacción**: si
  `precioManoObra > 0` crear `ManoDeObra { ordenId, descripcion: servicio.nombre, valor, mecanicoId: orden.mecanicoId }`;
  por cada repuesto del kit crear `ItemOrden { ordenId, repuestoId, descripcion: repuesto.nombre, cantidad, precioUnitario: repuesto.precioVenta }`.
  Revalidar `/ordenes/<id>`. Respuesta `{ error: null, success: true, agregados: { manoDeObra: boolean, repuestos: number } }`.
  El kit se resuelve contra la sede activa (D10): solo se crean líneas de repuestos alcanzables con
  `scopeRepuesto(session.user.sedeActivaId)`. Si el servicio no aporta nada (precio 0 y ningún repuesto
  en la sede) → `{ error: "El servicio no tiene nada que agregar", success: false }` **sin escribir** (D11).
- UI `aplicar-servicio-form.tsx` en el detalle de la orden, con la misma condición de visibilidad que
  los formularios de agregar ítem / mano de obra (`!orden.factura` en `ordenes/[id]/page.tsx`):
  `Combobox` de servicios activos (muestra nombre, "Kit · N repuestos" y total estimado) + botón
  "Aplicar servicio"; `toast.success(...)` con lo que realmente se agregó.
  **Una sola instancia, en la tarjeta de Ítems**: el servicio crea líneas en Ítems *y* en Mano de obra,
  así que dos formularios idénticos invitarían a aplicar el mismo servicio dos veces.

Tests: orden ajena/inexistente, orden no mutable (ENTREGADA/facturada), servicio inactivo, servicio
sin repuestos (solo mano de obra), kit con precio de mano de obra 0 (solo repuestos), precios tomados
de `precioVenta` actual, mecánico de la orden heredado, kit con repuestos de otra sede → solo los de la
sede activa (D10), servicio sin nada que agregar → error sin escritura (D11), y error a mitad de la
transacción → se propaga y la action no devuelve `success` (con la BD mockeada no hay rollback real:
el test verifica la propagación del error, no el rollback — no lo nombres "nada creado").

Verificar, commit `fase18-task 3: aplicar servicios y kits a una orden`, **pedir aprobación**.

### Task 4: Aplicar un servicio a una cotización

**Archivos:** `src/app/actions/servicio-actions.ts` (`aplicarServicioACotizacionAction`) (+ test);
`src/app/(dashboard)/cotizaciones/[id]/aplicar-servicio-cotizacion-form.tsx` (+ test); `cotizaciones/[id]/page.tsx`.

- Mismas reglas de roles, alcance y estado editable que `agregarItemCotizacionAction` (leerla y
  reutilizar su verificación; devolver los mismos mensajes). En una transacción: `ItemCotizacion`
  `MANO_OBRA` (si precio > 0; cantidad 1, precioUnitario = precioManoObra, descripción = nombre) +
  un `REPUESTO` por repuesto del kit (cantidad, precioUnitario = precioVenta, repuestoId), con el kit
  resuelto contra la sede activa (D10) y D11 si no hay nada que agregar.
  Esa transacción **debe terminar llamando a `recomputeCotizacionTotales(tx, cotizacionId)`**, la misma
  función privada que usa `agregarItemCotizacionAction` (`src/app/actions/cotizacion-actions.ts`):
  sin ella `subtotal`/`descuento`/`iva`/`total` de la fila padre no reflejan las líneas nuevas y la
  cotización queda con un total falso (la spec original omitía este paso).
  Revalidar `/cotizaciones/<id>`.
- UI igual a la de la orden, junto al formulario de agregar ítem de la cotización y con su misma
  condición de visibilidad (`puedeEditar = esCotizacionMutable(cotizacion.estado)`).

Tests: análogos a la Task 3 (cotización no editable, servicio inactivo, propagación del error a mitad
de transacción, D10, D11) **más** el específico de esta tarea: aplicar un kit actualiza
`subtotal`/`iva`/`total` de la cotización, i.e. `recomputeCotizacionTotales` se llama con el `tx`.

Verificar, commit `fase18-task 4: aplicar servicios y kits a una cotización`, **pedir aprobación**.

---

## 4. Seguridad

Todo por `getTenantDb` con el tenant de la sesión; guard antes de cualquier lectura/escritura;
órdenes y cotizaciones con el mismo alcance de sede que sus acciones existentes; precios tomados del
servidor (nunca del cliente) al aplicar. Los repuestos del kit se resuelven siempre por la sede activa
(D10): el catálogo es del tenant, pero un kit no puede introducir repuestos de otra sede en una orden
o cotización ajena, ni saltarse el `scopeRepuesto` que aplican `addItemOrdenAction` y
`agregarItemCotizacionAction`.

## 5. Verificación final de la fase

`npx tsc --noEmit`, `npm test` completo y `npx eslint` en lo tocado. Revisar el diff completo de la
rama contra este documento (o una revisión final con otro modelo, si el usuario lo pide). Reporte.

## 6. Cierre (solo con aprobación del usuario)

1. Respaldo en el servidor: `ssh -i ~/.ssh/torqueflow_deploy alejo@192.168.1.50` y `pg_dump` a
   `~/backups/torqueflow_<fecha>_pre_fase18.sql` (URL de `DATABASE_URL` del `.env` del servidor sin `?schema=`).
2. Aplicar la migración a cada schema de tenant (`taller_dev`, `taller_dev_reference`):
   `TENANT_DATABASE_URL="${TENANT_DATABASE_BASE_URL}?schema=<schema>" npx prisma migrate deploy --schema=prisma/tenant/schema.prisma`
   y verificar `npx prisma migrate diff --from-url "<misma URL>" --to-schema-datamodel prisma/tenant/schema.prisma --script` → "empty migration".
3. Regenerar el cliente (ver §0.9) y dejar `npm run dev` corriendo para la prueba manual del usuario.
4. Con el visto bueno: `git checkout main && git pull && git merge --no-ff fase18-catalogo-servicios` y push.
   El deploy lo hace el usuario (pull + build + `sudo pm2 restart torqueflow`).
