import type { MetodoPago, Prisma } from "@/generated/prisma-tenant";
import { montoExacto } from "@/lib/money/monto-exacto";

export const SALDO_INSUFICIENTE = "SALDO_INSUFICIENTE";

/**
 * Escribe un pago contra una factura (extraído de `registrarPagoAction`): descuenta el saldo
 * (condicional a que alcance), crea el pago y marca la factura PAGADA si el saldo llega a 0.
 * Debe correr dentro de una transacción; lanza `SALDO_INSUFICIENTE` si el monto excede el saldo.
 * `creadoAt` solo lo usan los datos de demostración.
 */
export async function registrarPagoEnTransaccion(
  tx: Prisma.TransactionClient,
  pago: { facturaId: string; monto: number; metodoPago: MetodoPago; referencia: string | null; registradoPorId: string },
  creadoAt?: Date,
): Promise<void> {
  const { count } = await tx.factura.updateMany({
    where: { id: pago.facturaId, saldoPendiente: { gte: montoExacto(pago.monto) } },
    data: { saldoPendiente: { decrement: montoExacto(pago.monto) } },
  });
  if (count === 0) {
    throw new Error(SALDO_INSUFICIENTE);
  }

  await tx.pago.create({
    data: {
      facturaId: pago.facturaId,
      monto: pago.monto,
      metodoPago: pago.metodoPago,
      referencia: pago.referencia,
      registradoPorId: pago.registradoPorId,
      ...(creadoAt ? { createdAt: creadoAt } : {}),
    },
  });

  const actualizada = await tx.factura.findUniqueOrThrow({ where: { id: pago.facturaId } });
  if (Number(actualizada.saldoPendiente) <= 0) {
    await tx.factura.update({ where: { id: pago.facturaId }, data: { estado: "PAGADA" } });
  }
}
