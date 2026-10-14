import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Pure aggregation helpers for the Inicio/Dashboard page (Fase 11-14 UI
 * redesign). Deliberately Prisma-type-free and side-effect-free -- same
 * rationale as src/lib/reportes/*.ts: unit-testable without a database, and
 * the dashboard-actions.ts orchestration layer converts Prisma Decimal
 * fields to plain numbers before calling these.
 */

/** OrdenTrabajo total: items (cantidad x precioUnitario) + manoDeObra (flat valor per línea). */
export function totalOrden(orden: {
  items: { cantidad: number; precioUnitario: number }[];
  manoDeObra: { valor: number }[];
}): number {
  const itemsTotal = orden.items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
  const manoDeObraTotal = orden.manoDeObra.reduce((sum, linea) => sum + linea.valor, 0);
  return itemsTotal + manoDeObraTotal;
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * The last `n` Bogotá calendar dates ending on `hoy` (inclusive), oldest first.
 * Bogotá, not UTC: with UTC dates the Inicio rolled over to "tomorrow" at
 * 7 p.m. local time. Same rule as src/lib/reportes/rango-fechas.ts.
 */
export function ultimosNDiasIso(hoy: Date, n: number): string[] {
  // Mediodía del día de Bogotá: restar días enteros nunca cruza a otra fecha.
  const mediodia = new Date(`${formatoDiaBogota.format(hoy)}T12:00:00-05:00`).getTime();
  const dias: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    dias.push(formatoDiaBogota.format(new Date(mediodia - i * UN_DIA_MS)));
  }
  return dias;
}
