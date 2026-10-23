import type { Prisma } from "@/generated/prisma-tenant";
import type { PagoEntrada } from "./cobro";

export const STOCK_INSUFICIENTE = "STOCK_INSUFICIENTE";

/** Stock insuficiente dentro de la transacción: lleva el repuesto para marcar su fila. */
export class ErrorSinStock extends Error {
  readonly repuestoId: string;
  readonly descripcion: string;

  constructor(repuestoId: string, descripcion: string) {
    super(STOCK_INSUFICIENTE);
    this.repuestoId = repuestoId;
    this.descripcion = descripcion;
  }
}

export interface VentaParaRegistrar {
  sedeId: string;
  clienteId: string | null;
  totales: { subtotal: number; descuento: number; iva: number; total: number };
  saldo: number;
  vueltas: number;
  recibidoEfectivo: number | null;
  lineas: { repuestoId?: string; descripcion: string; cantidad: number; precioUnitario: number }[];
  pagos: PagoEntrada[];
  creadoPorId: string;
}

/**
 * Cuerpo de la transacción de `crearVentaMostradorAction`: descuenta el stock con guarda
 * (agregando las líneas repetidas, D8), crea la venta con sus ítems y sus pagos. `creada`
 * (solo el script de datos de demostración) fija las marcas de tiempo.
 */
export async function registrarVentaEnTransaccion(
  tx: Prisma.TransactionClient,
  venta: VentaParaRegistrar,
  creada?: Date,
): Promise<{ id: string; numero: number }> {
  const tiempos = creada ? { createdAt: creada } : {};
  const porRepuesto = new Map<string, { cantidad: number; descripcion: string }>();
  for (const linea of venta.lineas) {
    if (!linea.repuestoId) continue;
    const acumulado = porRepuesto.get(linea.repuestoId);
    porRepuesto.set(linea.repuestoId, {
      cantidad: (acumulado?.cantidad ?? 0) + linea.cantidad,
      descripcion: linea.descripcion,
    });
  }

  for (const [repuestoId, linea] of porRepuesto) {
    const { count } = await tx.repuesto.updateMany({
      where: { id: repuestoId, stockActual: { gte: linea.cantidad } },
      data: { stockActual: { decrement: linea.cantidad } },
    });
    if (count === 0) throw new ErrorSinStock(repuestoId, linea.descripcion);
  }

  const creadaVenta = await tx.ventaMostrador.create({
    data: {
      sedeId: venta.sedeId,
      clienteId: venta.clienteId,
      subtotal: venta.totales.subtotal,
      descuento: venta.totales.descuento,
      iva: venta.totales.iva,
      total: venta.totales.total,
      saldoPendiente: venta.saldo,
      recibidoEfectivo: venta.recibidoEfectivo,
      vueltas: venta.vueltas,
      estado: venta.saldo === 0 ? "PAGADA" : "PENDIENTE",
      creadoPorId: venta.creadoPorId,
      ...(creada ? { createdAt: creada, updatedAt: creada } : {}),
      items: {
        create: venta.lineas.map((linea) => ({
          repuestoId: linea.repuestoId ?? null,
          descripcion: linea.descripcion,
          cantidad: linea.cantidad,
          precioUnitario: linea.precioUnitario,
          ...tiempos,
        })),
      },
    },
    select: { id: true, numero: true },
  });

  for (const pago of venta.pagos) {
    await tx.pagoVentaMostrador.create({
      data: {
        ventaId: creadaVenta.id,
        monto: pago.monto,
        metodoPago: pago.metodoPago,
        referencia: pago.referencia ?? null,
        registradoPorId: venta.creadoPorId,
        ...tiempos,
      },
    });
  }

  return creadaVenta;
}
