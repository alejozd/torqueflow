import { cn } from "@/lib/utils";

// Dot per pill echoes each section's own dominant color elsewhere on the
// page: resumen reuses KPI_TONE.info (En el taller/Citas de hoy), flujo
// reuses the "Terminadas" bar segment (bg-primary), agenda reuses the
// PROGRAMADA cita dot (amber), facturación reuses the success green used
// for money figures, alertas del taller reuses the "Estancadas" amber/orange
// of its card, and inventario reuses KPI_TONE.danger (Stock bajo).
// The order is the page's order: each id is the target section's `id`.
export const SECCIONES_DASHBOARD = [
  { id: "resumen", label: "Resumen", dot: "bg-blue-500" },
  { id: "flujo-taller", label: "Flujo del taller", dot: "bg-primary" },
  { id: "agenda-hoy", label: "Agenda de hoy", dot: "bg-amber-500" },
  { id: "facturacion", label: "Facturación", dot: "bg-[oklch(0.4_0.1_150)]" },
  { id: "alertas-taller", label: "Alertas del taller", dot: "bg-orange-500" },
  { id: "alertas-inventario", label: "Inventario", dot: "bg-red-500" },
] as const;

/**
 * Anchor nav so it's obvious there's more below the fold and the user can
 * jump straight to a section instead of guessing at scroll depth. Sticky at
 * the top of the page's own scroll flow (the layout's header above isn't
 * sticky, so this becomes the fixed reference once scrolled past it).
 * scroll-mt-16 on each section target keeps it from tucking under this bar.
 */
export function NavSeccionesDashboard() {
  return (
    <nav
      aria-label="Secciones del dashboard"
      className="sticky top-0 z-10 -mt-4 flex gap-2 overflow-x-auto border-b bg-slate-50/95 py-2 backdrop-blur supports-backdrop-filter:bg-slate-50/75 dark:bg-slate-900/75"
    >
      {SECCIONES_DASHBOARD.map((seccion) => (
        <a
          key={seccion.id}
          href={`#${seccion.id}`}
          className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className={cn("size-2 shrink-0 rounded-full", seccion.dot)} />
          {seccion.label}
        </a>
      ))}
    </nav>
  );
}
