import { NavSecciones } from "@/components/nav-secciones";

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

/** La barra de secciones del Inicio (componente compartido con la ficha de la orden). */
export function NavSeccionesDashboard() {
  return <NavSecciones etiqueta="Secciones del dashboard" secciones={SECCIONES_DASHBOARD} />;
}
