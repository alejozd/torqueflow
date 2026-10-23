import type { Prisma } from "@/generated/prisma-tenant";
import { sincronizarCuentaPorPagar } from "@/lib/proveedores/sincronizar-cuenta";

export const PEDIDO_YA_RECIBIDO = "PEDIDO_YA_RECIBIDO";

export interface PedidoParaRecibir {
  id: string;
  proveedorId: string;
  bodegaId: string;
  creadoPorId: string;
  /** Lo que llegó de cada línea (cantidad > 0). */
  lineas: { repuestoId: string; cantidad: number; precioCompraUnitario: Prisma.Decimal | number | string }[];
}

/**
 * Cuerpo de la transacción de `recibirPedidoCompraAction`: crea la entrada de mercancía,
 * sube el stock, hace nacer la cuenta por pagar y cierra el pedido como RECIBIDO. `recibida`
 * (solo el script de datos de demostración) fija las marcas de tiempo.
 */
export async function recibirPedidoEnTransaccion(
  tx: Prisma.TransactionClient,
  pedido: PedidoParaRecibir,
  recibida?: Date,
): Promise<string> {
  const entrada = await tx.entradaMercancia.create({
    data: {
      proveedorId: pedido.proveedorId,
      bodegaId: pedido.bodegaId,
      creadoPorId: pedido.creadoPorId,
      ...(recibida ? { createdAt: recibida } : {}),
      items: {
        create: pedido.lineas.map((linea) => ({
          repuestoId: linea.repuestoId,
          cantidad: linea.cantidad,
          precioCompraUnitario: linea.precioCompraUnitario,
          ...(recibida ? { createdAt: recibida } : {}),
        })),
      },
    },
    select: { id: true },
  });
  for (const linea of pedido.lineas) {
    await tx.repuesto.update({
      where: { id: linea.repuestoId },
      data: { stockActual: { increment: linea.cantidad } },
    });
  }
  // La deuda con el proveedor nace con la mercancía (Fase 24, D5).
  await sincronizarCuentaPorPagar(tx, entrada.id, pedido.creadoPorId, recibida);
  // estado guard inside the transaction: two people receiving at once
  // must not create two entradas for the same pedido.
  const { count } = await tx.pedidoCompra.updateMany({
    where: { id: pedido.id, estado: "ENVIADO" },
    data: { estado: "RECIBIDO", recibidoAt: recibida ?? new Date(), entradaId: entrada.id },
  });
  if (count === 0) throw new Error(PEDIDO_YA_RECIBIDO);
  return entrada.id;
}
