import type { MetodoPago, Prisma } from "@/generated/prisma-tenant";
import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";

export const DEVOLUCION_YA_REGISTRADA = "DEVOLUCION_YA_REGISTRADA";
export const SALDO_CAMBIADO = "SALDO_CAMBIADO";

export interface DevolucionParaRegistrar {
  ventaId: string;
  sedeId: string;
  motivo: string | null;
  metodoPago: MetodoPago;
  total: number;
  aCuenta: number;
  enEfectivo: number;
  creadoPorId: string;
  /** Por línea de la venta: lo vendido y lo que se devuelve ahora. */
  lineas: Map<string, { cantidad: number; vendida: number; repuestoId: string | null; precioUnitario: number }>;
}

/**
 * Cuerpo de la transacción de `crearDevolucionAction`: avanza `devueltoCantidad` con guarda,
 * baja la deuda de la venta, reingresa el stock, crea la devolución y la audita. `creada`
 * (solo el script de datos de demostración) fija las marcas de tiempo.
 */
export async function registrarDevolucionEnTransaccion(
  tx: Prisma.TransactionClient,
  devolucion: DevolucionParaRegistrar,
  creada?: Date,
): Promise<{ id: string; numero: number }> {
  const { ventaId, aCuenta, lineas } = devolucion;

  const porRepuesto = new Map<string, number>();
  for (const linea of lineas.values()) {
    if (!linea.repuestoId) continue;
    porRepuesto.set(linea.repuestoId, (porRepuesto.get(linea.repuestoId) ?? 0) + linea.cantidad);
  }

  // Primero las guardas: cada línea solo avanza si nadie devolvió antes esas
  // unidades. En una venta ya cobrada `aCuenta` es 0, así que la guarda del
  // saldo no protege nada aquí: sin esta, dos devoluciones simultáneas de la
  // misma línea pagarían y reingresarían el stock dos veces.
  for (const [ventaItemId, linea] of lineas) {
    const { count } = await tx.ventaMostradorItem.updateMany({
      where: { id: ventaItemId, devueltoCantidad: { lte: linea.vendida - linea.cantidad } },
      data: { devueltoCantidad: { increment: linea.cantidad } },
    });
    if (count === 0) throw new Error(DEVOLUCION_YA_REGISTRADA);
  }

  if (aCuenta > 0) {
    // Guarda: el saldo pudo cambiar entre la lectura y esta escritura.
    const { count } = await tx.ventaMostrador.updateMany({
      where: { id: ventaId, saldoPendiente: { gte: aCuenta } },
      data: { saldoPendiente: { decrement: aCuenta } },
    });
    if (count === 0) throw new Error(SALDO_CAMBIADO);

    // Si la devolución terminó de saldar la deuda, la venta queda pagada: el
    // estado se deriva del saldo, como en el cobro.
    const actualizada = await tx.ventaMostrador.findUniqueOrThrow({
      where: { id: ventaId },
      select: { saldoPendiente: true },
    });
    if (Number(actualizada.saldoPendiente) <= 0) {
      await tx.ventaMostrador.update({ where: { id: ventaId }, data: { estado: "PAGADA" } });
    }
  }

  for (const [repuestoId, cantidad] of porRepuesto) {
    await tx.repuesto.update({ where: { id: repuestoId }, data: { stockActual: { increment: cantidad } } });
  }

  const creadaDevolucion = await tx.devolucionMostrador.create({
    data: {
      ventaId,
      sedeId: devolucion.sedeId,
      motivo: devolucion.motivo,
      total: devolucion.total,
      montoEnEfectivo: devolucion.enEfectivo,
      metodoPago: devolucion.metodoPago,
      creadoPorId: devolucion.creadoPorId,
      ...(creada ? { createdAt: creada } : {}),
      items: {
        create: [...lineas.entries()].map(([ventaItemId, linea]) => ({
          ventaItemId,
          repuestoId: linea.repuestoId,
          cantidad: linea.cantidad,
          precioUnitario: linea.precioUnitario,
          ...(creada ? { createdAt: creada } : {}),
        })),
      },
    },
    select: { id: true, numero: true },
  });

  await registrarEventoAuditoria(tx, {
    tipo: "VENTA_DEVOLVER",
    actorId: devolucion.creadoPorId,
    entidadTipo: "DevolucionMostrador",
    entidadId: creadaDevolucion.id,
    detalle: {
      ventaId,
      numero: creadaDevolucion.numero,
      total: devolucion.total,
      enEfectivo: devolucion.enEfectivo,
      aCuenta,
      motivo: devolucion.motivo,
    },
  });

  return creadaDevolucion;
}
