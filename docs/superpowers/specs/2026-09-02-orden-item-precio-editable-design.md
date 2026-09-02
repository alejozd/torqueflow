# Diseño: campo Descripción condicional + precio unitario editable en ítems de orden

## Contexto

En "Agregar ítem" (`agregar-item-form.tsx`) de una orden de trabajo, el usuario puede elegir un repuesto del inventario o cargar un ítem manual (sin `repuestoId`, para insumos menores como tornillos, arandelas, parches — cosas que no ameritan su propio SKU en el inventario).

Hoy el formulario muestra siempre los cuatro campos (Repuesto, Descripción, Cantidad, Precio unitario), pero cuando se selecciona un repuesto, el servidor descarta silenciosamente lo escrito en Descripción y en Precio unitario, y usa `repuesto.nombre` / `repuesto.precioVenta` en su lugar (`item-orden-actions.ts:51-63`). Esto es confuso: el usuario puede escribir un precio distinto sin que tenga ningún efecto.

El precio guardado en el repuesto debe tratarse como una **sugerencia**: el usuario puede subirlo (o bajarlo) al agregar el ítem, y ese valor se guarda únicamente para ese ítem de esa orden — no se propaga al catálogo de repuestos.

## Cambios

### 1. `RepuestoOption` (`src/app/actions/repuesto-actions.ts:24`)

Gana el campo `precioVenta: number`. `listRepuestoOptions` (línea 56) lo incluye en su `select`. Necesario para que el cliente conozca el precio sugerido al elegir un repuesto en el combobox.

### 2. `itemOrdenInputSchema` (`src/lib/validation/orden.ts:11`)

`precioUnitario` pasa de opcional a requerido (`z.coerce.number().min(0, ...)`, sin `.optional()`): como el campo será siempre visible y prellenado en el cliente, ya no hace falta la rama condicional que lo trataba como ausente.

El `.refine()` se simplifica: la condición pasa de `repuestoId || (descripcion && precioUnitario !== undefined)` a `Boolean(data.repuestoId) || Boolean(data.descripcion)` — cantidad y precio ya se validan siempre a nivel de campo; el refine solo decide si falta identificar el ítem (ni repuesto ni descripción).

### 3. `addItemOrdenAction` (`src/app/actions/item-orden-actions.ts:16-81`)

Cuando `repuestoId` está presente:
- `descripcion` sigue tomándose de `repuesto.nombre` (sin cambio — la descripción libre no tiene uso si hay repuesto).
- `precioUnitario` deja de tomarse de `repuesto.precioVenta` y pasa a tomarse siempre de `parsed.data.precioUnitario` (lo que el formulario envíe).

El repuesto sigue siendo obligatorio buscarlo (`tenantDb.repuesto.findFirst`) para validar que existe y pertenece a la sede activa, y para derivar `descripcion` — pero su `precioVenta` deja de leerse para el guardado del ítem.

### 4. UI (`src/app/(dashboard)/ordenes/[id]/agregar-item-form.tsx`)

Layout reorganizado en dos filas dentro del mismo `FormGroup`:

- **Fila 1 (siempre visible):** Repuesto (combobox) + Cantidad.
- **Fila 2:** Descripción — visible y requerida solo cuando no hay repuesto seleccionado (ítem manual). Precio unitario — siempre visible; al seleccionar un repuesto, se autocompleta con su `precioVenta` (vía `setValue`/`useEffect` reaccionando al cambio del combobox) pero queda editable por el usuario.

El texto de ayuda actual ("Si seleccionas un repuesto del inventario, la descripción y el precio se completan automáticamente") se actualiza para reflejar que el precio es editable: algo como "El precio se sugiere desde el inventario, pero puedes ajustarlo para este ítem."

## Fuera de alcance

Restringir por rol quién puede editar el precio sugerido. Por ahora, cualquier rol que ya puede agregar ítems a una orden (`ADMIN`, `RECEPCION`, `TECNICO`) puede editarlo. Diferido explícitamente por el usuario para una fase posterior.

## Tests a actualizar (Strict TDD Mode)

- `item-orden-actions.test.ts`: el caso que hoy asume que el precio enviado se descarta cuando hay `repuestoId` se invierte — debe verificar que el precio enviado por el formulario es el que se guarda.
- `agregar-item-form.test.tsx`: casos nuevos para (a) Descripción oculta/no requerida cuando se selecciona un repuesto, (b) Precio unitario se autocompleta con el precio del repuesto al seleccionarlo, (c) Precio unitario editable y su valor se envía en el submit.
