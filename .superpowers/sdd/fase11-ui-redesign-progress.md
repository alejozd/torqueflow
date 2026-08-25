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
- Commit: `[pendiente]`.

**Fase 12 completa — tarea 3 cerrada. Pendiente de aprobación del usuario antes de empezar la Fase 13.**

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
