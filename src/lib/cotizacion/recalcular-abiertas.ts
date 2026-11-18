import type { getTenantDb } from "@/lib/db/tenant-client";
import { recomputeCotizacionTotales } from "./recompute-totales";

type TenantDb = ReturnType<typeof getTenantDb>;

/**
 * Se corre una sola vez, después de la migración 20261118120000_iva_incluido:
 * esa migración sube con su IVA los precios de las líneas de las cotizaciones
 * abiertas, y aquí se recalculan sus totales guardados con la misma función de
 * la app (no se duplica el cálculo en SQL). Devuelve cuántas recalculó.
 */
export async function recalcularCotizacionesAbiertas(db: TenantDb): Promise<number> {
  const abiertas = await db.cotizacion.findMany({
    where: { estado: { in: ["BORRADOR", "ENVIADA"] } },
    select: { id: true },
  });
  for (const cotizacion of abiertas) {
    await db.$transaction((tx) => recomputeCotizacionTotales(tx, cotizacion.id));
  }
  return abiertas.length;
}
