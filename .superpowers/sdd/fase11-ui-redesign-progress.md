# TorqueFlow — Modernización de UI (Fases 11-14) — Progress Ledger

Plan aprobado: `C:\Users\Alejo\.claude\plans\calm-snuggling-whale.md`
Convención de commits: `fase{N}-task X: ...` — un commit por tarea.
Ritmo de aprobación: el usuario aprueba al cierre de cada Fase (11, 12, 13,
14), no tarea por tarea dentro de una Fase.

Alcance total: 13 rutas bajo `(dashboard)`, ~11 vistas de listado/tabla,
~25 formularios, login + selección de sede, shell del dashboard. Ninguna
vista queda sin modernizar al cierre de la Fase 14.

---

## Fase 11 — Fundación de diseño + shell del dashboard

Estado: cerrada, pendiente de aprobación del usuario para pasar a Fase 12.

### Fase 11 / Tarea 2 — Shell del dashboard (sidebar)

Estado: cerrada.

- Agregado el componente compuesto `sidebar` de shadcn (+ `tooltip`, su
  dependencia para el modo colapsado — no se usa el modo ícono, pero el
  componente lo requiere igual).
- Nuevo `src/app/(dashboard)/dashboard-sidebar.tsx` (cliente, usa
  `usePathname()`): sidebar con los mismos 12 links, agrupados en
  Operación / Inventario / Administración (esAdmin-only), ícono por link
  (`lucide-react`), resaltado del link activo (`isActive` de
  `SidebarMenuButton`, coincide con el pathname exacto o cualquier
  subruta). `collapsible` se deja en su default (`offcanvas`) — nunca
  colapsa a solo-íconos, así el texto de cada link siempre es visible
  (necesario para `getByRole("link", {name})` del e2e).
- `src/app/(dashboard)/layout.tsx` reescrito: `SidebarProvider` +
  `DashboardSidebar` + `SidebarInset` con header (`SidebarTrigger` para
  mobile, sesión/tenant, `Badge` para "Sede: X", y los botones). Sigue
  siendo un server component — el `usePathname()` vive solo en el
  componente cliente nuevo.
- `sign-out-button.tsx`/`cambiar-sede-button.tsx`: mismo `onClick`/lógica,
  ahora usan el `Button` de shadcn con ícono. Texto del botón sin cambios
  ("Cerrar sesión"/"Cambiar de sede").
- Nota técnica: shadcn (`@base-ui/react`) usa un prop `render` (no
  `asChild` de Radix) para el patrón polimórfico —
  `<SidebarMenuButton render={<Link href="..." />}>Texto</SidebarMenuButton>`.
  El contenido va DENTRO de `SidebarMenuButton` (no en el `<Link>`), porque
  `mergeProps` resuelve `children` con el objeto de la derecha ganando —
  confirmado leyendo `node_modules/@base-ui/react/docs/react/utils/merge-props.md`
  antes de escribir el componente, para no perder tiempo adivinando.
- Verificación: `tsc --noEmit` limpio. `npm test`: 600 tests reales
  pasando (mismo flake de siempre). **`npx playwright test` completo (los
  3 specs) — los 3 pasan**, incluyendo el flujo completo de
  `tenant-flow.spec.ts` (nav, badge de sede, botones) — única cobertura
  real de este archivo, sin test unitario propio.
- Commit: `04bc380` (pusheado a main).

**Fase 11 completa — tareas 1 y 2 cerradas. Pendiente de aprobación del usuario antes de empezar la Fase 12.**

---

## Fase 12 — Login y selección de sede

Estado: cerrada.

### Fase 12 / Tarea 3 — Login y selección de sede

Estado: cerrada.

- `src/app/login/page.tsx` y `src/app/seleccionar-sede/page.tsx`: tarjeta
  centrada (`Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`
  de shadcn) sobre `<main>` con fondo `bg-muted/30` y centrado flex. El
  mensaje de error de nivel página en login pasa de `<p role="alert">` a
  `Alert variant="destructive"` + `AlertDescription` (el componente
  `Alert` ya fija `role="alert"` internamente).
- `login-form.tsx`: campos migrados a `Label`/`Input`/`Button` de shadcn,
  mismo `id`/`htmlFor`/texto de botón. Error de submit envuelto en
  `Alert variant="destructive"`. Lógica de `handleSubmit`/`signIn` sin
  cambios.
- `seleccionar-sede-form.tsx`: mismo patrón `Label`/`Button`/`Alert`. El
  campo `Sede` se queda en un `<select>` nativo (no el `Select` de shadcn)
  estilado a mano para calzar con `SelectTrigger` — el `Select` de shadcn
  (Base UI) no renderiza `<option>` reales en el DOM mientras está cerrado,
  lo que rompería `userEvent.selectOptions(...)` y
  `getByRole("option", {name})` de los tests existentes. Se evaluó y
  descartó a propósito para no tocar los 2 archivos de test.
- Ningún archivo de test tocado. Verificación: `tsc --noEmit` limpio;
  `npx vitest run src/app/login src/app/seleccionar-sede` — 4 archivos /
  17 tests, todos verdes sin modificar los tests. Suite completa: 597
  tests reales pasando (mismo flake de `prisma migrate deploy` ya
  documentado en Fase 11, sin relación con este cambio).
- Commit: `1452f41`.

**Fase 12 completa — tarea 3 cerrada. Pendiente de aprobación del usuario antes de empezar la Fase 13.**

---

## Fase 13 — Todas las tablas de datos

Estado: en progreso.

Relevamiento previo (agente de exploración) confirmó:
- Ninguno de los 10 módulos objetivo usa `<table>` hoy — todos son
  `<ul>/<li>` bare. `/reportes` y el panel superadmin YA usan `<table>`
  HTML crudo (no el `Table` de shadcn) con el patrón
  `getByRole("row").filter({hasText})` en sus e2e — se reusa ese patrón.
- Ningún `page.tsx` de listado tiene test unitario propio (`*.test.tsx`
  en esos directorios cubre solo formularios aislados) — la única
  cobertura de estas vistas es `e2e/tenant-flow.spec.ts`, hoy con
  `getByText(substring)`/`getByRole("link", {name})` sobre el texto
  concatenado del `<li>`. Migrar a `<Table>` real requiere actualizar esas
  aserciones a queries por fila/celda (`getByRole("row").filter({hasText})`,
  `getByRole("cell", {name})`) en el mismo commit de cada módulo — se
  documenta explícitamente porque implica tocar `e2e/tenant-flow.spec.ts`,
  algo que la Fase 12 evitó pero que aquí es inevitable (no hay otra red
  de seguridad para estas vistas).
- `vehiculos` NO es una ruta de listado propia (no hay
  `vehiculos/page.tsx`, solo `vehiculos/[id]/page.tsx` con 2 listas
  anidadas) — se saca de la lista de 10 módulos "top-level" y sus listas
  anidadas se evalúan junto con `clientes`.
- Dos formas de "acciones de fila" en la app hoy: (a) fila-completa-es-link
  a detalle (clientes, ordenes, facturas, citas, entradas-mercancia) y
  (b) formulario interactivo embebido por fila (usuarios ↔
  `AsignarSedesForm`, sedes ↔ `EditarSedeForm`, superadmin ↔
  `TenantRowActions`). El diseño de `DataTable` debe soportar ambas (una
  celda puede renderizar cualquier `ReactNode`, no solo texto/link).
- Solo `citas` tiene manejo de estado vacío hoy
  (`"No hay citas agendadas en esta sede."`). Los otros 9 módulos y 5+
  listas anidadas no tienen mensaje de vacío — se estandariza vía el prop
  `emptyMessage` de `DataTable`, con un mensaje puntual por módulo.

Estrategia de verificación por módulo: `tsc --noEmit` + `npm test`
(rápidos) en cada commit; `npx playwright test e2e/tenant-flow.spec.ts`
completo (es un único test que camina ~25 rutas en secuencia, no se
puede correr por módulo aislado) se ejecuta en checkpoints — no tras cada
uno de los 10 commits, para no pagar 10x el arranque del dev server —
y obligatorio al cerrar la Fase 13.

### Fase 13 / Tarea 4 — Componente `DataTable` reutilizable

Estado: cerrada.

- Nuevo `src/components/data-table.tsx`: `DataTable<T>({ columns, rows,
  getRowKey, emptyMessage })` genérico sobre `Table`/`TableHeader`/
  `TableBody`/`TableRow`/`TableHead`/`TableCell` de shadcn (`src/components/
  ui/table.tsx`, sin uso previo en la app). `columns: {header, cell: (row)
  => ReactNode, className?}[]` — `cell` retorna cualquier `ReactNode`
  (texto, `<Link>`, `<Badge>`, o un formulario completo), cubriendo ambas
  formas de acción de fila detectadas en el relevamiento. Si `rows.length
  === 0` renderiza `<p className="text-sm text-muted-foreground">
  {emptyMessage}</p>` en vez de una tabla vacía con headers huérfanos
  (gap que tenía el panel superadmin hoy).
- No se agregó `caption`/paginación/ordenamiento — ninguno de los 10
  módulos los necesita hoy (listas cortas, sin ordenamiento en la data
  actual); se agrega si una vista concreta lo necesita, no especulativo.
- Verificación: `tsc --noEmit` limpio. Sin tests propios (componente de
  presentación puro, sin lógica) — se verifica indirectamente vía los
  tests/e2e de cada módulo que lo consuma.
- Commit: `9f8497e`.

### Fase 13 / Tarea 5 — Módulo `clientes` (+ nested `vehiculos`)

Estado: cerrada.

- `clientes/page.tsx`: lista de clientes migrada a `DataTable` (1 columna
  "Nombre" con el mismo `<Link>` de antes). Nuevo `emptyMessage`: "No hay
  clientes registrados." (no existía antes).
- `clientes/[id]/page.tsx`: lista anidada "Vehículos" migrada igual (1
  columna, mismo `<Link>` combinado placa/marca/modelo). `emptyMessage`:
  "Este cliente no tiene vehículos registrados."
- `vehiculos/[id]/page.tsx` (detalle, no listado top-level — ver nota del
  relevamiento arriba): sus 2 listas anidadas también migradas —
  "Órdenes de trabajo" (`Link` con fecha — estado combinados, igual que
  antes) y "Historial" (texto plano fecha — descripción — autor, sin
  link). `emptyMessage` para ambas (ninguna tenía antes).
- Principio aplicado en las 4 migraciones: preservar el texto EXACTO
  dentro de cada `<Link>`/celda tal cual estaba en el `<li>` original —
  cero recorte de columnas nuevas, solo cambio de `<ul>/<li>` a
  `<table>/<tr>/<td>` real. Minimiza riesgo de e2e: ningún test de
  `tenant-flow.spec.ts` tuvo que tocarse para este módulo (todos usan
  `getByRole("link", {name})`/`getByText(substring)`, que no dependen de
  la estructura del contenedor).
- **2 bugs encontrados y arreglados por separado durante la verificación
  e2e de este módulo** (no forman parte de esta tarea, commits propios
  fuera de la numeración `fase13-task`):
  - `fix: eliminar sede con órdenes/bodegas ya no rompe la UI` (commit
    `0e2fc15`) — preexistente, confirmado con `git stash` antes de
    tocarlo, no relacionado con esta Fase.
  - `fase12-fix: título de página real (h1), no CardTitle` (commit
    `a563f4e`) — regresión real de la Fase 12: `CardTitle` de shadcn es
    un `<div>`, no un heading; rompía `getByRole("heading", {name:
    "Selecciona tu sede"})` para el flujo del técnico con 2 sedes.
    Ningún test unitario de Fase 12 lo cubría (solo `alert`/`label`), por
    eso pasó inadvertido hasta este checkpoint de e2e.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` en los 4 archivos
  tocados: 10/10 tests verdes, sin modificar ningún test. **`npx
  playwright test e2e/tenant-flow.spec.ts` completo: verde** (tras los 2
  fixes de arriba). `npx playwright test e2e/super-admin-flow.spec.ts`
  también verde (sanity check, no debería verse afectado).
- Commit: `cb8b899`.

### Fase 13 / Tarea 6 — Módulo `ordenes`

Estado: cerrada.

- `ordenes/page.tsx`: lista migrada a `DataTable` (1 columna "Orden",
  mismo `<Link>` combinado placa/cliente/estado-label). `emptyMessage`:
  "No hay órdenes de trabajo en este estado." Los tabs de filtro por
  estado (`<nav>` de `<Link>`) no se tocan — no son parte de la tabla.
- `ordenes/[id]/page.tsx`: 3 listas anidadas migradas — "Ítems
  (repuestos)", "Mano de obra" (ambas texto plano, sin link) y "DVI
  fotos" (`<img>` con el mismo `alt` de antes). `emptyMessage` nuevo para
  las 3 (ninguna tenía antes).
- Mismo principio que el módulo `clientes`: texto/contenido de celda
  idéntico al `<li>` original, cero columnas nuevas. Ningún test de
  `tenant-flow.spec.ts` tocado — todas las aserciones relevantes
  (`getByRole("link", {name: /ABC123/})`, `getByText(substring)`,
  `getByRole("img", {name})`) matchean por contenido, no por estructura.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (5 archivos/13
  tests) verde sin tocar tests. `npx playwright test
  e2e/tenant-flow.spec.ts` completo: verde.
- Commit: `1b9dd26`.

### Fase 13 / Tarea 7 — Módulo `usuarios`

Estado: cerrada.

- `usuarios/page.tsx`: lista migrada a `DataTable` de 3 columnas: "Nombre"
  (mismo `<h2>` de antes, ahora dentro de la celda — preserva
  `getByRole("heading", {name, level: 2})`), "Correo / Rol" (texto plano
  igual que antes), "Acciones" (link "Editar" + `AsignarSedesForm`
  embebido — el caso (b) del relevamiento: acción de fila = formulario
  interactivo completo, no solo un link).
- Única aserción e2e que dependía de la estructura (no del contenido):
  `e2e/tenant-flow.spec.ts` usaba `getByRole("listitem")` para scopear la
  fila de "Usuario E2E" antes de buscar el link "Editar" — se cambió a
  `getByRole("row")`, mismo patrón que `/reportes` y superadmin. Es el
  único cambio de e2e necesario en todo el módulo.
- `emptyMessage`: "No hay usuarios registrados." (no existía antes).
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (3 archivos/9
  tests) verde. `npx playwright test e2e/tenant-flow.spec.ts` completo:
  verde.
- Commit: `d9f4c78`.

### Fase 13 / Tarea 8 — Módulo `facturas`

Estado: cerrada.

- `facturas/page.tsx`: lista migrada a `DataTable` (1 columna, mismo
  `<Link>` combinado con número/cliente/placa/estado/total/saldo).
  `emptyMessage`: "No hay facturas en este estado."
- `facturas/[id]/page.tsx`: 3 listas anidadas migradas — "Ítems", "Mano
  de obra" (mismo patrón que `ordenes`) y "Pagos" (fecha — método — monto,
  texto plano). `emptyMessage` nuevo para las 3.
- Mismo principio de preservar contenido exacto. Ningún test de e2e
  tocado (no hay `*.test.tsx` para estas páginas tampoco).
- Verificación: `tsc --noEmit` limpio. Sin unit tests propios del módulo.
  `npx playwright test e2e/tenant-flow.spec.ts` completo: verde.
- Commit: `9a53b95`.

### Fase 13 / Tarea 9 — Módulo `citas`

Estado: cerrada.

- `citas/page.tsx`: lista migrada a `DataTable` de 2 columnas: "Cita"
  (mismo `<Link>` fecha/placa/motivo) y "Estado" (antes un `<span>
  [ESTADO]</span>` pegado al link, ahora columna propia sin corchetes —
  limpieza menor, ningún test dependía del formato con corchetes).
  `emptyMessage` reusa **el mismo texto exacto** que ya tenía
  (`"No hay citas agendadas en esta sede."`), el único módulo de los 10
  que ya manejaba estado vacío antes de esta Fase.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (2 archivos/5
  tests) verde. `npx playwright test e2e/tenant-flow.spec.ts` completo:
  verde (incluye la aserción de estado vacío tras eliminar sedes).
- Commit: `8125150`.

### Fase 13 / Tarea 10 — Módulo `bodegas`

Estado: cerrada.

- `bodegas/page.tsx`: lista migrada a `DataTable` (1 columna "Nombre",
  texto plano — este módulo no tenía link ni ruta de detalle, cero
  acciones de fila hoy). `emptyMessage`: "No hay bodegas registradas."
- Verificación: `tsc --noEmit` limpio, `npx vitest run` (junto con
  `proveedores`, verificados en el mismo pase) 5/5 verde, `npx playwright
  test e2e/tenant-flow.spec.ts` completo verde.
- Commit: `72f7726`.

### Fase 13 / Tarea 11 — Módulo `proveedores`

Estado: cerrada.

- `proveedores/page.tsx`: lista migrada a `DataTable` (1 columna, mismo
  texto combinado nombre/teléfono/email con fallback `—`). Sin link ni
  ruta de detalle, igual que `bodegas`. `emptyMessage`: "No hay
  proveedores registrados."
- Verificación: misma corrida que la tarea 10 (`tsc`/`vitest`/e2e
  compartidos, ambos módulos cambiados juntos antes de separarlos en
  commits).
- Commit: `d092c3f`.

### Fase 13 / Tarea 12 — Módulo `repuestos`

Estado: cerrada.

- `repuestos/page.tsx`: lista migrada a `DataTable` (1 columna, texto
  combinado idéntico al `<li>` original: código/nombre/stock/bodega +
  sufijo condicional "⚠ stock bajo"). Se mantiene en una sola celda a
  propósito (no se separó en columnas Código/Nombre/Stock/Bodega) para
  que el `<td>` conserve el substring exacto que matchea el regex e2e
  `getByText(/FRN-001.*stock: 20/)` sin depender de la concatenación de
  texto entre celdas. `emptyMessage`: "No hay repuestos registrados."
- Verificación: `tsc --noEmit` limpio (junto con `entradas-mercancia` y
  `sedes`, verificados en el mismo pase). `npx vitest run` 26/26 verde.
  `npx playwright test` completo (los 2 specs): verde.
- Commit: `d022242`.

### Fase 13 / Tarea 13 — Módulo `entradas-mercancia`

Estado: cerrada.

- `entradas-mercancia/page.tsx`: lista migrada a `DataTable` (1 columna,
  mismo `<Link>` fecha/proveedor/bodega/cantidad-de-ítems).
  `emptyMessage`: "No hay entradas de mercancía registradas."
- `entradas-mercancia/[id]/page.tsx`: lista anidada "Ítems recibidos"
  migrada igual (texto plano código/nombre/cantidad/precio).
  `emptyMessage`: "Esta entrada no tiene ítems registrados." (no existía
  antes).
- Verificación: compartida con la tarea 12 (ver arriba).
- Commit: `e24d5bd`.

### Fase 13 / Tarea 14 — Módulo `sedes`

Estado: cerrada — **cierra la Fase 13, los 10 módulos objetivo migrados**.

- `sedes/page.tsx`: lista migrada a `DataTable` de 2 columnas: "Nombre"
  (mismo `<h2>` + `<p>` de dirección opcional dentro de la celda —
  preserva `getByRole("heading", {name, level: 2})`) y "Acciones"
  (`EditarSedeForm` embebido completo — segundo caso real de "formulario
  de fila" junto a `usuarios`). `emptyMessage`: "No hay sedes
  registradas."
- Este módulo ya había recibido el fix `deleteSedeFormAction` (commit
  `0e2fc15`, fuera de la numeración de Fase 13) antes de esta migración —
  la tabla real confirma que el flujo "Eliminar Sede principal" (refutado
  por tener órdenes/bodegas) sigue mostrando el error inline sin romper
  el resto de la fila.
- Verificación: compartida con las tareas 12-13. **Con este módulo cierran
  los 10 objetivo de la Fase 13** (clientes, ordenes, usuarios, facturas,
  citas, bodegas, proveedores, repuestos, entradas-mercancia, sedes) más
  sus listas anidadas relevantes (vehículos, ítems, mano de obra, DVI
  fotos, pagos, entradas recibidas).
- Commit: `b8ca3a9`.

**Fase 13 completa — 14 tareas cerradas (4 componente + 10 módulos).
Pendiente de aprobación del usuario antes de empezar la Fase 14.**

---

## Fase 14 — Todos los formularios con validación visual

Estado: en progreso.

`react-hook-form@^7.86` + `@hookform/resolvers@^5.9` instalados (zod v4
del proyecto ya soportado). Patrón validado con `bodegas` (tarea 15,
formulario más simple posible) antes de escalar al resto:

```tsx
const [state, formAction, isPending] = useActionState(xxxAction, initialState);
const formRef = useRef<HTMLFormElement>(null);
const { register, handleSubmit, formState: { errors } } = useForm<XxxInput>({
  resolver: zodResolver(xxxInputSchema),
  defaultValues: { ... },
});

<form
  noValidate
  ref={formRef}
  onSubmit={handleSubmit(() => startTransition(() => formAction(new FormData(formRef.current!))))}
>
```

- **`startTransition` es obligatorio**, no opcional: llamar `formAction(...)`
  a mano desde el `onSubmit` de RHF (en vez de pasar `formAction` como el
  `action` nativo del `<form>`) dispara la advertencia de React "An async
  function with useActionState was called outside of a transition" y
  `isPending` deja de actualizar bien. Detectado corriendo
  `e2e/tenant-flow.spec.ts` (el warning aparece en el log del
  `[WebServer]`) — no lo hubiera detectado con `tsc`/`vitest` solos.
- Se arma el `FormData` leyendo `formRef.current` (no reconstruyendo a
  mano desde los valores tipados de RHF) — evita cualquier
  desalineamiento entre la coerción de zod (`z.coerce.number()`, etc.) y
  lo que el server action espera leer de `formData.get(name)`.
- Errores de campo (RHF/zod, client-side): texto plano con
  `id="{campo}-error"` + `aria-describedby`/`aria-invalid` en el input —
  **sin `role="alert"`**, reservado para el error del servidor
  (`state.error`) tal como pide el plan ("límite de plan, conflictos,
  etc."). Errores de refine a nivel de objeto (sin campo asociado, ver
  `itemOrdenInputSchema`) se muestran igual, sin `role="alert"`.
- **Impacto en tests existentes**: la validación client-side ahora
  bloquea el submit con campos vacíos/inválidos ANTES de llegar al
  server action — el patrón de test típico "click submit sin llenar
  nada, el mock del action devuelve el mensaje de requerido, aparece en
  `role=\"alert\"`" ya no ejercita el server action (nunca se llama). Se
  actualiza cada test así: (a) un test nuevo/ajustado que confirma que el
  campo vacío bloquea el submit SIN llamar al mock, mensaje de campo
  visible; (b) un test que llena el campo válido y hace que el mock
  devuelva un error de negocio (no de validación) para seguir cubriendo
  el `role="alert"` real. Es el único tipo de cambio de test esperado en
  esta Fase — a diferencia de 11-13, aquí el comportamiento SÍ cambia a
  propósito.
- **Schemas con `z.coerce`/`z.preprocess`** (dinero, números, `requiredMoney`):
  tipar `useForm<T>` con `z.input<typeof schema>`, NO `z.infer`/`z.output`
  — con `z.infer` `tsc` exige el tipo YA coercionado (`number`) para esos
  campos pero el resolver recibe `unknown` en la entrada real y falla la
  compilación. Descubierto en la tarea 17 (`repuestos`).
- **`z.coerce.number().optional()` NO trata `""` como ausente** —
  `.optional()` solo cubre `undefined`. Varios server actions ya
  resuelven esto en el propio call site
  (`formData.get("anio") || undefined` antes de llamar al schema, ver
  `vehiculo-actions.ts`) en vez de en el schema. El formulario RHF no
  pasa por ese call site — hay que revisar CADA action antes de asumir
  que el schema sirve tal cual, y replicar el mismo preprocesamiento con
  `z.preprocess((v) => (v === "" ? undefined : v), schema.shape.campo)`
  cuando el action lo hace. Descubierto en la tarea 20 (`vehiculos`,
  campo `anio`) — sin el fix, un campo numérico opcional vacío mostraba
  el mensaje genérico de zod en inglés en vez de dejar pasar el formulario.
- No todos los ~25 formularios se benefician igual: los que son un único
  `<select>` de un enum fijo sin texto libre (`cambiar-estado-form`,
  `cambiar-estado-cita-form`, partes de `dvi-checklist-form`/
  `dvi-foto-form`) no tienen estado inválido posible más allá de "no
  elegido" — se evalúa caso por caso si amerita RHF+zod o si el
  `required` nativo/lo que ya había es suficiente (mismo criterio de "no
  forzar semántica donde no aplica" que la Fase 13 aplicó a listas
  anidadas).

### Fase 14 / Tarea 15 — Formulario `bodegas` (patrón de referencia)

Estado: cerrada.

- `nuevo-bodega-form.tsx`: único campo (`nombre`), primer caso real del
  patrón de arriba. Ver la nota de `startTransition` — encontrado y
  corregido en este mismo commit.
- `nuevo-bodega-form.test.tsx` actualizado: caso de campo vacío ahora
  verifica bloqueo client-side + `mockCreateBodegaAction` NO llamado;
  caso nuevo con nombre válido + mock de error de negocio para seguir
  cubriendo `role="alert"`.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (1 archivo/3
  tests) verde. `npx playwright test e2e/tenant-flow.spec.ts` completo:
  verde (confirma que el warning de `startTransition` desapareció tras
  el fix).
- Commit: `c2449e9`.

### Fase 14 / Tarea 16 — Formulario `proveedores`

Estado: cerrada.

- `nuevo-proveedor-form.tsx`: mismo patrón, con un campo `email` que
  agrega validación real (`z.string().email(...)`), primer caso de
  mensaje de campo que no es "obligatorio". `contacto`/`telefono` quedan
  sin `register` de validación estricta (siguen siendo opcionales sin
  regla propia en `proveedorInputSchema`, solo `register(...)` para que
  RHF los incluya en el `FormData`).
- Test: caso de campo vacío (nombre) + caso nuevo de email inválido
  (bloquea sin llamar al server) + caso de error de servidor con datos
  válidos.
- Verificación: `tsc --noEmit` limpio, `npx vitest run` (1 archivo/5
  tests) verde.
- Commit: `f7800ad`.

### Fase 14 / Tarea 17 — Formulario `repuestos`

Estado: cerrada.

- **Descubrimiento de patrón nuevo**: cuando el schema usa
  `z.coerce`/`z.preprocess` (como `requiredMoney` y los campos
  numéricos), el genérico de `useForm<T>` debe tiparse con
  `z.input<typeof schema>` (el tipo ANTES de la coerción), no
  `z.infer`/`z.output` — con `z.infer` TypeScript exige `number` para
  esos campos pero el resolver en realidad maneja `unknown` en la
  entrada, y `tsc` lo rechaza. Documentado también arriba en la nota de
  patrón general de la Fase 14.
- `stockInicialSchema` (antes privado en `repuesto-actions.ts`, sin
  exportar) se movió a `src/lib/validation/inventario.ts` como
  `repuestoStockInicialSchema` — necesario para que el formulario lo
  reutilice como pide el objetivo de la Fase 14 ("reutilizando los
  schemas zod que ya existen"). `repuesto-actions.ts` ahora lo importa en
  vez de definirlo inline; mismo texto de error, mismo comportamiento —
  confirmado con `repuesto-actions.test.ts` (16/16 verde, sin tocar ese
  archivo de test).
  `nuevo-repuesto-form.tsx` usa `repuestoInputSchema.extend({stockActual:
  repuestoStockInicialSchema})` para combinar ambos en un solo schema de
  formulario.
- `precioCompra`/`precioVenta` mantienen su comportamiento original: sin
  `defaultValue` (input vacío al montar) — a diferencia de
  `stockActual`/`stockMinimo`, que sí tenían `defaultValue="0"` en el
  original y lo conservan vía `defaultValues` de RHF.
- Test: colisión de texto detectada y resuelta — el placeholder
  deshabilitado `<option>Selecciona una bodega</option>` tiene el mismo
  texto que el mensaje de error del campo `bodegaId` (misma cadena
  literal), así que `getByText` ambiguaba con 2 matches; el test usa
  `document.getElementById("bodegaId-error")` para apuntar al mensaje de
  error específicamente. Igual que los demás: caso de campos vacíos
  bloqueados client-side, caso de error de servidor con datos válidos.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (2 archivos/16
  tests, incluye `repuesto-actions.test.ts`) verde.
- Commit: `761796a`.

### Fase 14 / Tarea 18 — Formulario `asignar-sedes` (checkbox array)

Estado: cerrada.

- `asignar-sedes-form.tsx`: primer caso de grupo de checkboxes bajo el
  mismo `name` (`sedeIds`). RHF soporta esto de forma nativa: registrar
  el mismo campo (`register("sedeIds")`) en cada `<input
  type="checkbox">` con `value={sede.id}` distinto agrupa los valores
  marcados en un array automáticamente; `defaultValues: {sedeIds:
  usuario.sedeIds}` pre-marca los checkboxes correctos sin tocar
  `defaultChecked` a mano. El `FormData` armado desde el `formRef` sigue
  produciendo múltiples entradas `sedeIds` (una por checkbox marcado),
  igual que antes — compatible con
  `formData.getAll("sedeIds")` en `setUsuarioSedesAction`, sin tocar el
  server action.
  Valida `usuarioSedesInputSchema.sedeIds` (`min(1)` — "Selecciona al
  menos una sede"), el mismo mensaje que ya usa el server.
- Ningún test existente tocado — los 4 tests del archivo original solo
  verifican render estático (labels, pre-marcado, atributo `name`, texto
  del botón), ninguno ejercitaba el submit. Se agregó un test nuevo:
  las 2 sedes desmarcadas bloquean el submit sin llamar al server.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (1 archivo/5
  tests) verde.
- Commit: `4345605`.

### Fase 14 / Tarea 19 — Formulario `clientes`

Estado: cerrada.

- `nuevo-cliente-form.tsx`: mismo patrón de `proveedores` (nombre
  obligatorio, teléfono/documento libres, email con validación real).
- Test: campo vacío bloqueado + error de servidor con datos válidos.
- Verificación: `tsc --noEmit` limpio (junto con la tarea 20, verificadas
  en el mismo pase). `npx vitest run` 7/7 verde.
- Commit: `29fe12a`.

### Fase 14 / Tarea 20 — Formulario `nuevo-vehiculo` (cliente/[id])

Estado: cerrada.

- `nuevo-vehiculo-form.tsx`: placa/marca/modelo obligatorios, `anio`
  numérico opcional. Se agrega `noValidate` al `<form>` (no lo tenía en
  el original — único de los ~25 sin él; con RHF+zod a cargo, dejar la
  validación nativa del navegador activa en paralelo hubiera duplicado
  mensajes/comportamiento, igual que el resto de los formularios ya
  migrados).
- Ver la nota de patrón de arriba: `anio` necesitó
  `z.preprocess((v) => (v === "" ? undefined : v), vehiculoInputSchema.shape.anio)`
  para no bloquear un año vacío — descubierto corriendo el test de esta
  misma tarea.
- Test: nuevo caso de bloqueo client-side (placa vacía) agregado; los 2
  tests originales (render, éxito) no necesitaron cambios.
- Verificación: compartida con la tarea 19. `npx playwright test
  e2e/tenant-flow.spec.ts` completo: verde (checkpoint tras 5 tareas de
  Fase 14 sin correrlo).
- Commit: `ecf429d`.

### Fase 14 / Tarea 21 — Formulario `nueva-sede`

Estado: cerrada.

- `nueva-sede-form.tsx`: mismo patrón. Se conserva el atributo `required`
  nativo en `nombre` (inerte con `noValidate`, la validación real la
  hace zod) porque `nueva-sede-form.test.tsx` ya tenía un test
  `toBeRequired()`/`not.toBeRequired()` — más barato conservarlo que
  tocar ese test.
- Ningún test tocado (los 2 existentes son solo de render/atributos, no
  ejercitan submit).
- Verificación: compartida con la tarea 22.
- Commit: `0ef0aed`.

### Fase 14 / Tarea 22 — Formulario `editar-sede` (update + `.bind(null, id)`)

Estado: cerrada.

- `editar-sede-form.tsx`: primer caso de formulario de EDICIÓN
  (`updateSedeAction.bind(null, sede.id)`), mismo patrón — `defaultValues`
  toma los valores actuales de la sede (`sede.nombre`/`sede.direccion`)
  en vez de cadenas vacías. El segundo `<form>` de este archivo
  (`deleteFormAction`, agregado en el fix `0e2fc15` de Fase 13) queda
  intacto, sin RHF — es un botón sin campos, no tiene nada que validar.
- Sin test propio (no existía `editar-sede-form.test.tsx`).
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (junto con
  `nueva-sede-form` y `sede-actions.test.ts`) 17/17 verde.
- Commit: `d346ec8`.

### Fase 14 / Tarea 23 — Formulario `nuevo-usuario`

Estado: cerrada.

- `nuevo-usuario-form.tsx`: nombre/email/password (min 8) + `role`
  (`<select>` de 3 opciones fijas, con `register("role")` para incluirlo
  en el `FormData`, sin validación de campo extra — el enum ya restringe
  las opciones visibles).
- Test: el caso "shows the error returned by the action" enviaba el
  formulario vacío a propósito para simular el límite de plan —
  actualizado a llenar nombre/email/password primero (ahora bloquea
  client-side antes) y se agregó el caso nuevo de bloqueo por campos
  vacíos.
- Verificación: compartida con la tarea 24.
- Commit: `dafe511`.

### Fase 14 / Tarea 24 — Formulario `editar-usuario` (password opcional)

Estado: cerrada.

- `editar-usuario-form.tsx`: mismo patrón que `nuevo-usuario`, con
  `usuarioUpdateInputSchema` — `password` es
  `.optional().or(z.literal(""))` (dejarlo en blanco conserva la
  contraseña actual), así que el campo vacío NO bloquea el submit, a
  diferencia de `nuevo-usuario`. El segundo `<form>` de este archivo
  (`deleteUsuarioAction`, sin campos) queda intacto, sin RHF.
- Ningún test tocado: los 3 tests existentes (pre-llenado, error de
  servidor, click en eliminar) ya enviaban con nombre/email pre-llenados
  y password vacío (válido) — pasan sin cambios.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (3 archivos/11
  tests, incluye `nuevo-usuario-form` y `asignar-sedes-form`) verde.
- Commit: `b7da190`.

### Fase 14 / Tarea 25 — Formulario `agregar-item` (refine cross-field)

Estado: cerrada.

- **Dos descubrimientos nuevos de zod v4 + RHF, primer caso real de
  `.refine()` a nivel de objeto** (`itemOrdenInputSchema`: repuesto del
  inventario O descripción+precio manual):
  1. En zod v4, `.refine()` sobre un `z.object()` sigue siendo un
     `ZodObject` (no envuelve en `ZodEffects` como zod v3) — `.shape`
     sigue disponible, PERO `.extend()` normal lanza en runtime
     `"Cannot overwrite keys on object schemas containing refinements.
     Use .safeExtend() instead."` Hay que usar `.safeExtend()` para
     agregar el override de `precioUnitario` (mismo problema de `""` vs
     `undefined` que `anio` en la tarea 20) sin perder el refine.
  2. Un issue de zod sin `path` (el de `.refine()` a nivel de objeto)
     zodResolver lo indexa bajo la clave `""` en `formState.errors` (no
     `errors.root`) — `errors[""]?.message`, con cast a
     `Record<string, {message?: string} | undefined>` porque
     `FieldErrors<T>` solo tipa las claves de campos reales. Se muestra
     sin `role="alert"` (mismo criterio que los demás errores de
     validación de campo).
- Test: caso nuevo de bloqueo (ni repuesto ni descripción+precio) +
  caso de error de servidor con datos manuales válidos. El test de
  "shows the error message when the action returns one" original
  enviaba vacío a propósito (para forzar el error de cantidad del
  server) — ya no aplica, reemplazado por los 2 de arriba.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (1 archivo/4
  tests) verde.
- Commit: `befa9ad`.

### Fase 14 / Tarea 26 — Formulario `nueva-orden` (vehiculos/[id])

Estado: cerrada.

- `nueva-orden-form.tsx`: los 3 campos (`kilometrajeIngreso`, `sintomas`,
  `mecanicoId`) son opcionales en `ordenTrabajoInputSchema` — ningún
  campo bloquea un submit vacío, igual que el original. Mismo fix de
  `""` → `undefined` para `kilometrajeIngreso` (ver nota de patrón,
  `orden-actions.ts` ya hacía `|| undefined` antes de parsear). Se agrega
  `noValidate` (no lo tenía).
- Ningún test tocado: los 3 existentes (render, éxito, error de
  servidor con submit vacío) siguen pasando tal cual — no hay ningún
  campo obligatorio que el client bloquee.
- Verificación: compartida con la tarea 27.
- Commit: `90521d0`.

### Fase 14 / Tarea 27 — Formulario `nueva-entrada` (historial, vehiculos/[id])

Estado: cerrada.

- `nueva-entrada-form.tsx`: campo único `descripcion` obligatorio, mismo
  patrón que `bodegas`. Se agrega `noValidate` (no lo tenía).
- Ningún test tocado (no había caso de error de servidor que
  reescribir).
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (2 archivos/5
  tests) verde.
- Commit: `18757e9`.

### Fase 14 / Tarea 28 — Formulario `agregar-mano-obra`

Estado: cerrada.

- `agregar-mano-obra-form.tsx`: 3 campos obligatorios sin casos
  especiales (`manoDeObraInputSchema` no tiene `.optional()` en ningún
  campo, no necesitó el fix de `""` → `undefined`).
- Test: campos vacíos bloqueados client-side + error de servidor con
  datos válidos (reemplaza el caso que enviaba vacío a propósito).
- Verificación: compartida con la tarea 29.
- Commit: `09223dc`.

### Fase 14 / Tarea 29 — Formulario `generar-factura`

Estado: cerrada.

- `generar-factura-form.tsx`: único caso hasta ahora que NO usa
  `useActionState` — usa `useState`+`useTransition` a mano porque
  necesita `router.push` dentro de la misma transición que la llamada al
  action (comentario ya existente en el código: `revalidatePath` puede
  desmontar este componente antes de que un efecto reaccione al nuevo
  estado). RHF se integra igual: `handleSubmit(onValid)` en el
  `onSubmit`, y `onValid` arma el `FormData` desde el `formRef` como en
  todos los demás — el patrón no depende de `useActionState`
  específicamente, solo de tener un `<form ref>` y un punto donde llamar
  al action con `FormData`.
  Mismo fix de `""` → `undefined` para `descuento` (`factura-actions.ts`
  ya hacía `|| undefined`).
- Sin test propio.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (5 archivos/15
  tests, todo `ordenes/[id]`) verde.
- Commit: `98dfc32`.

### Fase 14 / Tarea 30 — Formulario `registrar-pago`

Estado: cerrada.

- `registrar-pago-form.tsx`: `monto` usa `requiredMoney` (ya maneja `""`
  → `undefined` internamente, sin necesitar el fix de preprocess a
  mano), `metodoPago` enum select, `referencia` libre opcional. Sin
  test propio.
- Verificación: compartida con las tareas 31-32.
- Commit: `[pendiente]`.

### Fase 14 / Tarea 31 — Formulario `agregar-entrada-item`

Estado: cerrada.

- `agregar-entrada-item-form.tsx`: `repuestoId` select obligatorio +
  `cantidad`/`precioCompraUnitario`. Mismo patrón que `agregar-item`
  (Fase 14/25) pero sin refine cross-field — aquí `repuestoId` es
  siempre obligatorio.
- Test: ambos casos "success" y "error" del archivo original enviaban
  el submit SIN seleccionar el repuesto (el mock ignoraba el contenido
  real) — con validación client-side esto ahora bloquea. Se reescriben
  los 2 y se agrega un tercero (bloqueo sin datos). Misma colisión de
  texto que repuestos (tarea 17): el placeholder deshabilitado
  "Selecciona un repuesto" == mensaje de error → se usa
  `document.getElementById("repuestoId-error")`.
- Verificación: compartida con la tarea 32.
- Commit: `[pendiente]`.

### Fase 14 / Tarea 32 — Formulario `nueva-entrada-mercancia`

Estado: cerrada.

- `nueva-entrada-mercancia-form.tsx`: único caso hasta ahora con SOLO
  selects obligatorios, cero texto libre (`proveedorId`/`bodegaId`).
  `entradaMercanciaInputSchema` no tiene campos `coerce` — el tipo
  exportado `EntradaMercanciaInput` (`z.infer`) sirve directo para
  `useForm`, sin necesitar `z.input`.
- Test: mismo caso que la tarea 31 — los 2 tests originales enviaban sin
  seleccionar nada, reescritos + 1 nuevo de bloqueo. Misma colisión de
  texto ("Selecciona un proveedor"), mismo fix con `getElementById`.
- Verificación: `tsc --noEmit` limpio. `npx vitest run` (2 archivos/8
  tests, `facturas` + `entradas-mercancia`) verde.
- Commit: `[pendiente]`.

### Fase 11 / Tarea 1 — Fundación de diseño

Estado: cerrada.

- `npx shadcn@latest init -d` corrió limpio (detectó Next.js + Tailwind v4
  sin intervención manual) — CLI shadcn 4.19.0, estilo `base-nova`, primitivas
  `@base-ui/react` (no Radix directamente; es el sucesor del mismo equipo),
  `lucide-react` para íconos, `class-variance-authority`/`clsx`/`tailwind-merge`.
  Crea `components.json`, `src/lib/utils.ts` (`cn()`).
- Componentes base agregados: `button`, `input`, `label`, `card`, `table`,
  `select`, `badge`, `alert`, `sheet`, `dropdown-menu`, `separator`,
  `skeleton`, `avatar` — en `src/components/ui/`.
- **Bug de la fuente Geist corregido**: `globals.css` tenía
  `--font-sans: var(--font-sans)` (circular, nunca resolvía a la fuente
  cargada) tras el init de shadcn. Cambiado a
  `--font-sans: var(--font-geist-sans)`.
- **Acento único definido**: naranja/ámbar cálido (`oklch(0.62 0.19 45)`
  claro / `oklch(0.72 0.17 50)` oscuro) en `--primary`/`--sidebar-primary`
  de `:root` y `.dark` — reemplaza el neutro puro por defecto de shadcn y
  corrige una inconsistencia que traía el init (dark mode's
  `--sidebar-primary` venía en azul `oklch(0.488 0.243 264.376)`, distinto
  del resto de la paleta). Resto de tokens (fondo, bordes, muted, destructive,
  charts) se dejan en el neutro puro que generó el CLI — base neutra + un
  solo acento, como pide la guía de rediseño.
- Verificación: `tsc --noEmit` limpio. `npm test`: 600 tests reales
  pasando (mismo flake de `migrate deploy` de siempre, sin relación).
  Ningún cambio de comportamiento todavía — solo fundación, ninguna página
  usa los componentes nuevos aún.
- Commit: `ad8465a` (pusheado a main).
