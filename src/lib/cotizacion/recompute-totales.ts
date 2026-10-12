import { computeCotizacionTotales } from "@/lib/cotizacion/totales";
import type { Prisma } from "@/generated/prisma-tenant";

/**
 * Recomputes and persists subtotal/descuento/iva/total from the cotización's
 * current items + descuentoPct. Called after every item mutation and every
 * descuentoPct change so the parent row never drifts from its ítems -- same
 * reason crearFacturaAction computes totals from source rows instead of
 * trusting a client-submitted total (src/app/actions/factura-actions.ts).
 *
 * Lives outside cotizacion-actions.ts on purpose: that module is `"use server"`,
 * so every export there becomes an endpoint the client can call. Aplicar un
 * servicio del catálogo (src/app/actions/servicio-actions.ts) necesita la misma
 * función dentro de su propia transacción, y duplicarla la dejaría divergir.
 */
export async function recomputeCotizacionTotales(
  tx: Prisma.TransactionClient,
  cotizacionId: string,
): Promise<void> {
  const cotizacion = await tx.cotizacion.findUniqueOrThrow({
    where: { id: cotizacionId },
    select: { descuentoPct: true, items: { select: { tipo: true, cantidad: true, precioUnitario: true } } },
  });
  const { subtotal, descuento, iva, total } = computeCotizacionTotales({
    items: cotizacion.items.map((item) => ({
      tipo: item.tipo,
      cantidad: Number(item.cantidad),
      precioUnitario: Number(item.precioUnitario),
    })),
    descuentoPct: Number(cotizacion.descuentoPct),
  });
  await tx.cotizacion.update({ where: { id: cotizacionId }, data: { subtotal, descuento, iva, total } });
}
