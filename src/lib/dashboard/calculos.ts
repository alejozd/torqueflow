/**
 * Pure aggregation helpers for the Inicio/Dashboard page (Fase 11-14 UI
 * redesign). Deliberately Prisma-type-free and side-effect-free -- same
 * rationale as src/lib/reportes/*.ts: unit-testable without a database, and
 * the dashboard-actions.ts orchestration layer converts Prisma Decimal
 * fields to plain numbers before calling these.
 */

/** OrdenTrabajo total: items (cantidad x precioUnitario) + manoDeObra (horas x precioHora). */
export function totalOrden(orden: {
  items: { cantidad: number; precioUnitario: number }[];
  manoDeObra: { horas: number; precioHora: number }[];
}): number {
  const itemsTotal = orden.items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
  const manoDeObraTotal = orden.manoDeObra.reduce((sum, linea) => sum + linea.horas * linea.precioHora, 0);
  return itemsTotal + manoDeObraTotal;
}

function aFechaIsoUtc(fecha: Date): string {
  const anio = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/**
 * The last `n` UTC calendar dates ending on `hoy` (inclusive), oldest first --
 * same UTC-boundary convention as src/lib/reportes/rango-fechas.ts (accepted
 * local-timezone limitation, not re-litigated here).
 */
export function ultimosNDiasIso(hoy: Date, n: number): string[] {
  const dias: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const fecha = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - i));
    dias.push(aFechaIsoUtc(fecha));
  }
  return dias;
}

/** Sums Factura.total per UTC day, filling requested days with no facturas as 0. */
export function agruparFacturacionPorDia(
  facturas: { createdAt: Date; total: number }[],
  dias: string[],
): { fecha: string; total: number }[] {
  const totalesPorDia = new Map<string, number>();
  for (const dia of dias) {
    totalesPorDia.set(dia, 0);
  }
  for (const factura of facturas) {
    const dia = aFechaIsoUtc(factura.createdAt);
    if (!totalesPorDia.has(dia)) continue;
    totalesPorDia.set(dia, (totalesPorDia.get(dia) ?? 0) + factura.total);
  }
  return dias.map((fecha) => ({ fecha, total: totalesPorDia.get(fecha) ?? 0 }));
}

/**
 * Most critical first: biggest (stockActual - stockMinimo) deficit at the
 * top. Plain-JS sort because Prisma cannot compare two columns of the same
 * row in a `where` clause without raw SQL.
 */
export function ordenarPorCriticidad<T extends { stockActual: number; stockMinimo: number }>(repuestos: T[]): T[] {
  return [...repuestos].sort((a, b) => a.stockActual - a.stockMinimo - (b.stockActual - b.stockMinimo));
}
