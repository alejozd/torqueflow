# Plan: Skeleton loaders + mejoras de paginación para DataTable

## Contexto

Iteración previa (misma fecha, ya mergeada a main) dejó `DataTable` (Server)
+ `DataTableInteractive` (Client, `"use client"`) + `Pagination` con
paginación y búsqueda client-side funcionando en las ~17 tablas del
proyecto. Esta iteración mejora la UX de esas tablas sin tocar su arquitectura:

1. **Skeleton loaders** durante la carga inicial de las 4 páginas
   principales (Órdenes, Clientes, Citas, Facturas), usando `loading.tsx`
   (convención de Next.js App Router -- Suspense automático al nivel del
   route segment, sin tocar los `page.tsx`).
2. **Paginación mejorada**: el selector de pageSize existe visualmente en
   `Pagination` pero **nunca queda conectado** -- `DataTableInteractive` no
   le pasa `onPageSizeChange`, así que hoy es un no-op. Esta iteración lo
   conecta de verdad, añade `100` a las opciones por defecto, y agrega
   botones de Primera/Última página (solo cuando `pageCount > 5`).

## Hallazgos de la investigación (ya verificados, no re-investigar)

- `src/components/ui/pagination.tsx`: ya muestra "Mostrando X-Y de Z
  registros" y Prev/Next. `onPageSizeChange` existe como prop opcional pero
  **ningún caller la pasa hoy** -- el selector de pageSize nunca se
  renderiza en la práctica.
- `src/components/data-table-interactive.tsx`: `pageSize` es un prop fijo
  (no state), pasado directo a `<Pagination pageSize={pageSize} ...>` sin
  `onPageSizeChange`.
- `src/components/data-table.tsx`: Server Component, expone
  `pageSize?: number` (default 20) que hoy es un valor fijo por página.
  **Después de este plan sigue siendo el valor inicial/default -- el
  cambio real de tamaño vive en el estado de `DataTableInteractive`.**
- No existe ningún `loading.tsx` en el proyecto (`find src/app -iname
  loading.tsx` vacío) -- es un patrón nuevo, sin precedente que seguir.
- `src/app/(dashboard)/ordenes/page.tsx`, `citas/page.tsx`,
  `facturas/page.tsx`: usan `DataTable` con búsqueda **server-side** vía
  formulario GET (`?q=`) -- NO tienen `searchable`/`searchValue`. Este plan
  no los toca a nivel de datos/filtros, solo agrega `loading.tsx`.
- `src/app/(dashboard)/clientes/page.tsx` → `ClientesTable` (client) →
  `DataTable` con `searchable` (client-side, ya migrado en la iteración
  previa). 7 columnas: Cliente, Teléfono, Correo, Vehículos, Última visita,
  Órdenes, Saldo.
- Columnas de las otras 3 páginas (para dimensionar el skeleton):
  - Órdenes: 8 columnas (Orden, Vehículo, Cliente, Estado, Mecánico,
    Ingreso, Ítems, Total). Además tiene 4 KPI cards arriba de la tabla y
    un toggle Tabla/Tablero -- el skeleton solo cubre el estado de carga
    inicial (vista "tabla" es el default), no el tablero Kanban.
  - Citas: 6 columnas (Fecha y hora, Vehículo, Cliente, Motivo, Estado,
    Notas). 3 KPI cards arriba. Vista default es "agenda", no "tabla" --
    el skeleton de tabla es una aproximación razonable ya que `loading.tsx`
    no puede leer `searchParams`/`vista` (se resuelve antes de que el
    Server Component async empiece a leerlos).
  - Facturas: 7 columnas (Factura, Cliente, Vehículo, Emitida, Estado,
    Total, Saldo). 3 KPI cards arriba.

## Global Constraints (copiar verbatim en cada reviewer dispatch)

- NO tocar la búsqueda/paginación server-side existente de
  Órdenes/Citas/Facturas (`?q=`, `?sort=`, `?estado=`, `?vista=`) -- cero
  cambios en esos `page.tsx` salvo que Task 4/6/7 solo agregan un
  `loading.tsx` nuevo, no modifican `page.tsx`.
- NO agregar filtros por columna, selección múltiple de filas, ni
  virtualización -- excluido explícitamente por el usuario.
- `Pagination` y `DataTableInteractive` son compartidos por ~17 tablas:
  cualquier cambio ahí debe mantener retrocompatibilidad total con las
  tablas que NO pasan `onPageSizeChange` hoy (después de Task 2, TODAS lo
  recibirán automáticamente vía `DataTableInteractive`, así que no hay
  callers "viejos" que romper a nivel de `DataTable`/`Pagination` props).
  `data-table.test.tsx` y `pagination.test.tsx` existentes deben seguir
  pasando salvo los que se actualicen explícitamente en la misma tarea que
  cambia el comportamiento que cubren.
- Botones Primera (`ChevronsLeft`)/Última (`ChevronsRight`) de
  `lucide-react`: visibles únicamente cuando `pageCount > 5`. Mismo patrón
  visual que los botones Prev/Next existentes (`variant="outline"
  size="icon-sm"`, `aria-label`, `disabled` en el extremo correspondiente).
- Todo cambio de pageSize debe resetear a página 1 (mismo comportamiento
  que ya existe para cambios de búsqueda).
- `tsc --noEmit` limpio y suite de tests pasando (salvo el flake de
  DB-provisioning ya documentado, no relacionado) en cada commit.
- Commits atómicos por tarea, formato
  `fase-ux-task N: descripción breve`, push inmediato a main tras cada
  tarea (por RULES.md del proyecto).

## Tareas

### Task 1: `Pagination` -- botones Primera/Última + pageSizeOptions + wiring de onPageSizeChange

Archivos: `src/components/ui/pagination.tsx`,
`src/components/ui/pagination.test.tsx`,
`src/components/data-table-interactive.tsx`.

(Se combinan Fase 1 puntos 1 y 2 del plan conversado con el usuario en una
sola tarea porque son un solo cambio de comportamiento end-to-end: sin el
wiring en `DataTableInteractive`, el selector de `Pagination` no tiene
efecto visible y no se puede testear de forma significativa.)

1. En `pagination.tsx`:
   - Cambiar el default de `pageSizeOptions` de `[10, 20, 50]` a
     `[10, 20, 50, 100]`.
   - Importar `ChevronsLeft`, `ChevronsRight` de `lucide-react` (ya se
     importan `ChevronLeft`/`ChevronRight` de ahí).
   - Dentro del bloque `{pageCount > 1 ? (...)}`, agregar un bloque
     adicional que solo se renderiza cuando `pageCount > 5`: un botón
     "Primera página" (`ChevronsLeft`, `disabled={page <= 1}`,
     `onClick={() => onPageChange(1)}`) ANTES del botón "Página anterior",
     y un botón "Última página" (`ChevronsRight`,
     `disabled={page >= pageCount}`, `onClick={() =>
     onPageChange(pageCount)}`) DESPUÉS del botón "Página siguiente".
     Mismo `variant="outline" size="icon-sm"` que los botones existentes,
     con `aria-label="Primera página"` / `aria-label="Última página"`
     respectivamente.
   - No cambiar la firma pública de `Pagination` (mismos props). El
     `onPageSizeChange` YA existe como prop opcional -- no se toca su
     firma, solo se agregan los botones y el default de
     `pageSizeOptions`.

2. En `data-table-interactive.tsx`:
   - Cambiar `const [page, setPage] = useState(1);` para agregar un
     segundo estado: `const [pageSize, setPageSize] = useState(initialPageSize);`
     donde `initialPageSize` es el prop `pageSize` que el componente ya
     recibe (renombrar el prop recibido para no chocar con el nombre del
     estado, p.ej. mantener el prop como `pageSize` en la firma de tipos
     pero usarlo solo como valor semilla del `useState`).
   - Reemplazar todos los usos internos de la constante `pageSize` (cálculo
     de `pageCount`, `start`, slice) para que usen el nuevo estado en vez
     del prop directo.
   - Agregar un handler `handlePageSizeChange(value: number)` que hace
     `setPageSize(value)` y `setPage(1)` (mismo patrón que
     `handleQueryChange` ya usa para búsqueda).
   - Pasar `onPageSizeChange={handlePageSizeChange}` a `<Pagination>`.

3. Tests en `pagination.test.tsx` (agregar, no reemplazar los existentes):
   - Con `pageCount <= 5`: los botones Primera/Última NO aparecen (usar
     `queryByRole` con los `aria-label` exactos).
   - Con `pageCount > 5`: los botones SÍ aparecen; en `page=1` el botón
     Primera está `disabled` y Última no; en `page=pageCount` es al
     revés; hacer click en Última llama a `onPageChange(pageCount)`;
     click en Primera llama a `onPageChange(1)`.
   - `pageSizeOptions` default incluye `100` cuando se renderiza el
     selector (pasar `onPageSizeChange` en el test para que el selector se
     muestre, y verificar que la opción "100 por página" existe).

4. Como `data-table-interactive.tsx` no tiene test file propio (se cubre
   vía `data-table.test.tsx` a través de la API pública de `DataTable`),
   agregar en `data-table.test.tsx` un test que: renderiza `DataTable` con
   filas suficientes para 2 páginas, usa `userEvent` para cambiar el
   selector de pageSize (buscar el `SelectField` renderizado, o su
   `combobox` role, y seleccionar una opción distinta a la actual), y
   verifica que el conteo de filas visibles y el texto "Mostrando X-Y de Z"
   cambian de acuerdo al nuevo pageSize, y que vuelve a página 1.

No tocar `DataTable`'s prop `pageSize` (sigue siendo el nombre y el
default `20` -- ahora documentado como "valor inicial", pero eso es
puramente un comentario, no un cambio de tipo/firma).

### Task 2: Componente `DataTableSkeleton`

Archivos nuevos: `src/components/data-table-skeleton.tsx`,
`src/components/data-table-skeleton.test.tsx`.

Crear un componente Server-safe (sin `"use client"`, no tiene estado) que
replica la estructura visual de una `DataTable` cargada, usando
`Skeleton` de `src/components/ui/skeleton.tsx` y los primitivos de
`src/components/ui/table.tsx` (`Table`, `TableHeader`, `TableRow`,
`TableHead`, `TableBody`, `TableCell`) para que el layout (anchos de
columna, padding, bordes) sea idéntico al de una tabla real y no haya
"salto" visual cuando el contenido real reemplaza al skeleton.

```tsx
export function DataTableSkeleton({
  columns,
  rows = 8,
}: {
  columns: number;
  rows?: number;
}) {
  // <Table><TableHeader><TableRow>{columns veces <TableHead><Skeleton .../></TableHead>}
  // <TableBody>{rows veces <TableRow>{columns veces <TableCell><Skeleton .../></TableCell>}}
  // Debajo de la tabla: una fila de skeleton que imita el footer de Pagination
  // ("Mostrando..." + controles), para que el salto de layout al cargar sea mínimo.
}
```

Detalles:
- `columns` es obligatorio (cada página especifica su propio conteo real).
- `rows` default `8` (aproxima el `pageSize` típico sin necesidad de
  saberlo).
- Cada celda de skeleton usa `<Skeleton className="h-4 w-full" />` (ajustar
  ancho/alto para que se vea proporcional, no una franja completa idéntica
  en cada celda -- variar levemente el ancho de alguna columna, p.ej. la
  última columna al 60% de ancho, es aceptable pero no obligatorio; mantenerlo
  simple).
- Debajo de la tabla, un `<div>` con dos `<Skeleton>` (uno a la izquierda
  imitando el texto "Mostrando...", uno a la derecha imitando los
  controles) usando las mismas clases de layout (`flex items-center
  justify-between`) que `Pagination` usa en su contenedor raíz, para que
  el reemplazo por la tabla real no cause un salto de altura brusco.

Test: renderiza `<DataTableSkeleton columns={5} />`, verifica que hay
exactamente 5 `TableHead` y `5 * 8 = 40` `TableCell` (usar
`getAllByRole("columnheader")` / `getAllByRole("cell")`), y que con
`rows={3}` hay `5 * 3 = 15` celdas.

### Task 3: `loading.tsx` para Órdenes

Archivo nuevo: `src/app/(dashboard)/ordenes/loading.tsx`.

Server Component (sin `"use client"`, sin data fetching -- Next.js lo
muestra automáticamente mientras `page.tsx` hace su `await`). Debe
replicar la estructura visual de `ordenes/page.tsx` en su estado "cargado"
para minimizar el salto de layout:

- Header: `<h1>` real "Órdenes de trabajo" (no necesita ser skeleton, es
  texto estático) + un `<Skeleton className="h-9 w-36" />` donde iría el
  botón "Nueva orden" (no se puede saber su ancho exacto sin el dato, un
  skeleton está bien).
- Grid de 4 KPI cards (`grid grid-cols-1 gap-4 sm:grid-cols-2
  lg:grid-cols-4`, igual que el real) -- cada `Card` con `CardHeader` +
  `CardTitle` real (el label sí se conoce, p.ej. "En proceso", "Terminadas
  sin facturar", "Tiempo medio", "Ticket medio" -- copiarlos tal cual del
  `page.tsx` real) y `CardContent` con un `<Skeleton className="h-8
  w-16" />` en vez del número.
- Un `Card` con `CardHeader`/`CardTitle` "Listado" real, y
  `CardContent` con `<DataTableSkeleton columns={8} />`.

No incluir el toggle Tabla/Tablero ni los filtros por estado (son
interactivos y dependen de `searchParams`, que `loading.tsx` no recibe) --
un `<Skeleton>` simple de una fila imitando esa barra de navegación es
opcional y no obligatorio; si se agrega, mantenerlo a un solo
`<Skeleton className="h-8 w-64" />` sin intentar replicar cada pill.

### Task 4: `loading.tsx` para Clientes

Archivo nuevo: `src/app/(dashboard)/clientes/loading.tsx`.

Misma idea, más simple (Clientes no tiene KPI cards):

- Header: `<h1>` real "Clientes" + `<Skeleton className="h-4 w-64" />`
  donde iría el subtítulo "{N} clientes registrados en Sede {X}" +
  `<Skeleton className="h-9 w-32" />` para el botón "Nuevo cliente".
- `Card` con `CardTitle` "Listado" real + `CardContent` con
  `<DataTableSkeleton columns={7} />` (7 columnas, ver Contexto arriba).

### Task 5: `loading.tsx` para Citas

Archivo nuevo: `src/app/(dashboard)/citas/loading.tsx`.

- Header: `<h1>` real "Citas" + `<Skeleton className="h-4 w-64" />` para
  el subtítulo + `<Skeleton className="h-9 w-36" />` para "Nueva cita".
- Grid de 3 KPI cards (`sm:grid-cols-3`), títulos reales ("Hoy",
  "Confirmadas", "Canceladas"), `<Skeleton className="h-8 w-12" />` por
  valor.
- `Card` "Listado" + `CardContent` con `<DataTableSkeleton columns={6} />`.

### Task 6: `loading.tsx` para Facturas

Archivo nuevo: `src/app/(dashboard)/facturas/loading.tsx`.

- Header: `<h1>` real "Facturas" + `<Skeleton className="h-9 w-36" />`
  para "Nueva factura".
- Grid de 3 KPI cards (`sm:grid-cols-3`), títulos reales ("Emitidas en el
  mes", "Por cobrar", "Cobrado"), `<Skeleton className="h-8 w-20" />` por
  valor.
- `Card` "Listado" + `CardContent` con `<DataTableSkeleton columns={7} />`.

### Task 7: Verificación final

- `npx tsc --noEmit` limpio.
- `npx vitest run` -- confirmar mismo resultado base (764+ passed, el
  flake de DB-provisioning ya documentado no cuenta como regresión) más
  los tests nuevos de Task 1 y Task 2 en verde.
- Verificación manual en navegador (dev server, throttling de red si es
  posible para ver el skeleton, o revisar el HTML inicial vía
  `read_page`/`get_page_text` antes de que hidrate):
  - Las 4 rutas (`/ordenes`, `/clientes`, `/citas`, `/facturas`) muestran
    el skeleton correspondiente brevemente y sin salto de layout brusco al
    cargar los datos reales.
  - En una tabla con más de 5 páginas (usar `pageSize=10` en una tabla con
    suficientes filas seed, p.ej. Repuestos con 152 filas y pageSize=50 da
    4 páginas -- si no hay ninguna tabla existente con >5 páginas bajo
    pageSize actual, verificar el comportamiento cambiando manualmente el
    pageSize a 10 vía el selector recién conectado, lo cual SÍ debería
    producir >5 páginas en Repuestos: 152/10 = 16 páginas) los botones
    Primera/Última aparecen y navegan correctamente.
  - El selector de pageSize (10/20/50/100) cambia visiblemente cuántas
    filas se muestran y resetea a página 1.
- Actualizar el ledger de progreso con el resumen final.
