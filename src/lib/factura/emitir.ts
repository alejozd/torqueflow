import type { Prisma } from "@/generated/prisma-tenant";
import { roundMoney } from "@/lib/money/round";
import { computeFacturaTotales } from "./totales";

export const STOCK_INSUFICIENTE = "STOCK_INSUFICIENTE";
export const ANTICIPOS_EXCEDEN = "ANTICIPOS_EXCEDEN";
export const ANTICIPO_CAMBIO = "ANTICIPO_CAMBIO";

export interface OrdenParaFacturar {
  id: string;
  clienteId: string;
  items: { repuestoId: string | null; cantidad: number; precioUnitario: number | { toString(): string } }[];
  manoDeObra: { valor: number | { toString(): string } }[];
}

/**
 * Escribe la factura de una orden (extraído de `crearFacturaAction`): crea la factura, descuenta
 * el stock de los repuestos (condicional a que alcance) y aplica los anticipos PENDIENTES como
 * pagos ANTICIPO. Debe correr dentro de una transacción: lanza `STOCK_INSUFICIENTE`,
 * `ANTICIPOS_EXCEDEN` o `ANTICIPO_CAMBIO` para que se revierta todo. `creadaAt` solo lo usan
 * los datos de demostración; la acción no lo pasa y rige el `now()` de la base.
 */
export async function emitirFacturaEnTransaccion(
  tx: Prisma.TransactionClient,
  orden: OrdenParaFacturar,
  descuento: number,
  emitidaPorId: string,
  creadaAt?: Date,
): Promise<{ id: string; total: number; saldoPendiente: number }> {
  const { subtotal, iva, total } = computeFacturaTotales({
    items: orden.items.map((item) => ({ cantidad: item.cantidad, precioUnitario: Number(item.precioUnitario) })),
    manoDeObra: orden.manoDeObra.map((linea) => ({ valor: Number(linea.valor) })),
    descuento,
  });
  if (descuento > subtotal) throw new Error("El descuento no puede ser mayor al subtotal");

  const decrementosStock = new Map<string, number>();
  for (const item of orden.items) {
    if (item.repuestoId) {
      decrementosStock.set(item.repuestoId, (decrementosStock.get(item.repuestoId) ?? 0) + item.cantidad);
    }
  }

  const creada = await tx.factura.create({
    data: {
      ordenId: orden.id,
      clienteId: orden.clienteId,
      subtotal,
      descuento,
      iva,
      total,
      saldoPendiente: total,
      emitidaPorId,
      estado: total <= 0 ? "PAGADA" : "PENDIENTE",
      ...(creadaAt ? { createdAt: creadaAt, updatedAt: creadaAt } : {}),
    },
  });
  for (const [repuestoId, cantidad] of decrementosStock) {
    const { count } = await tx.repuesto.updateMany({
      where: { id: repuestoId, stockActual: { gte: cantidad } },
      data: { stockActual: { decrement: cantidad } },
    });
    if (count === 0) {
      throw new Error(STOCK_INSUFICIENTE);
    }
  }

  // Anticipos PENDIENTES de la orden se aplican como pagos ANTICIPO. Si exceden el
  // total se lanza y la transacción completa (factura, stock) se revierte.
  let saldoPendiente = total;
  const anticipos = await tx.anticipo.findMany({ where: { ordenId: orden.id, estado: "PENDIENTE" } });
  if (anticipos.length > 0) {
    const sumaAnticipos = roundMoney(anticipos.reduce((suma, a) => suma + Number(a.monto), 0));
    if (sumaAnticipos > total) {
      throw new Error(ANTICIPOS_EXCEDEN);
    }
    for (const anticipo of anticipos) {
      const pago = await tx.pago.create({
        data: {
          facturaId: creada.id,
          monto: Number(anticipo.monto),
          metodoPago: "ANTICIPO",
          referencia: "Anticipo",
          registradoPorId: anticipo.registradoPorId,
          ...(creadaAt ? { createdAt: creadaAt } : {}),
        },
      });
      // Conditional on PENDIENTE: a concurrent devolución must not leave the
      // same anticipo both DEVUELTO and applied. Throwing rolls back everything.
      const { count } = await tx.anticipo.updateMany({
        where: { id: anticipo.id, estado: "PENDIENTE" },
        data: { estado: "APLICADO", pagoId: pago.id },
      });
      if (count === 0) {
        throw new Error(ANTICIPO_CAMBIO);
      }
    }
    saldoPendiente = roundMoney(total - sumaAnticipos);
    await tx.factura.update({
      where: { id: creada.id },
      data: saldoPendiente <= 0 ? { saldoPendiente: 0, estado: "PAGADA" } : { saldoPendiente },
    });
    saldoPendiente = Math.max(saldoPendiente, 0);
  }
  return { id: creada.id, total, saldoPendiente };
}
