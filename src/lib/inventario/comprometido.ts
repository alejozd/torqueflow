import type { getTenantDb } from "@/lib/db/tenant-client";
import { scopeRepuesto } from "@/lib/sede/scope";

type TenantDb = ReturnType<typeof getTenantDb>;

/**
 * Items whose units are spoken for but still counted in stockActual: stock is
 * only decremented when an orden is invoiced (factura-actions.ts), so every
 * non-anulada orden without a factura holds units that are not really free.
 * The single definition shared by the dashboard alerts, the sidebar badge
 * and the Repuestos page, so all three count the same repuestos.
 */
export function whereItemsComprometidos(sedeActivaId: string) {
  return {
    repuestoId: { not: null },
    repuesto: scopeRepuesto(sedeActivaId),
    orden: { estado: { not: "ANULADA" as const }, factura: null },
  };
}

/** Units committed on open ordenes, per repuestoId (repuestos with none are absent). */
export async function comprometidoPorRepuesto(tenantDb: TenantDb, sedeActivaId: string): Promise<Map<string, number>> {
  const filas = await tenantDb.itemOrden.groupBy({
    by: ["repuestoId"],
    where: whereItemsComprometidos(sedeActivaId),
    _sum: { cantidad: true },
  });
  const mapa = new Map<string, number>();
  for (const fila of filas) {
    if (fila.repuestoId) mapa.set(fila.repuestoId, fila._sum.cantidad ?? 0);
  }
  return mapa;
}

/** Same rule as the dashboard alerts: what is free after open ordenes is at or below the minimum. */
export function estaBajoMinimo(repuesto: { stockActual: number; stockMinimo: number }, comprometido: number): boolean {
  return repuesto.stockActual - comprometido <= repuesto.stockMinimo;
}
