import type { getTenantDb } from "@/lib/db/tenant-client";
import type { MovimientosCaja, Metodo } from "./resumen";

type TenantDb = ReturnType<typeof getTenantDb>;
type TenantTx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

/** Cliente de tenant o transacción: ambos sirven para consultar los movimientos. */
export type DbMovimientosCaja = TenantDb | TenantTx;

/**
 * Filas de la sede en la ventana [desde, hasta) que mueven el cajón: pagos de facturas (sin
 * ANTICIPO), anticipos, devoluciones de anticipo, gastos en efectivo, ventas de mostrador,
 * devoluciones de mostrador y abonos a proveedores en efectivo. Fuente única para el cierre de
 * caja (acción) y para el script de datos de demostración.
 */
export async function consultarMovimientosCaja(db: DbMovimientosCaja, sedeId: string, desde: Date, hasta: Date) {
  const ventana = { gte: desde, lt: hasta };
  const pagos = await db.pago.findMany({
    where: { metodoPago: { not: "ANTICIPO" }, createdAt: ventana, factura: { orden: { sedeId } } },
    include: { factura: { select: { numero: true } } },
  });
  const anticipos = await db.anticipo.findMany({ where: { sedeId, createdAt: ventana } });
  const devoluciones = await db.anticipo.findMany({
    where: { sedeId, estado: "DEVUELTO", devueltoAt: ventana },
  });
  const gastos = await db.gasto.findMany({
    where: { sedeId, pagadoEnEfectivo: true, createdAt: ventana },
  });
  // Fase 24: las ventas de mostrador son ingreso y sus devoluciones, egreso.
  const pagosMostrador = await db.pagoVentaMostrador.findMany({
    where: { createdAt: ventana, venta: { sedeId } },
    include: { venta: { select: { numero: true } } },
  });
  const devolucionesMostrador = await db.devolucionMostrador.findMany({
    where: { sedeId, createdAt: ventana },
    include: { venta: { select: { numero: true } } },
  });
  // Abonos a proveedores en efectivo: sale dinero del cajón (Fase 24).
  const pagosProveedor = await db.pagoProveedor.findMany({
    where: { metodoPago: "EFECTIVO", createdAt: ventana, cuenta: { entrada: { bodega: { sedeId } } } },
    include: { cuenta: { select: { proveedor: { select: { nombre: true } } } } },
  });
  return { pagos, anticipos, devoluciones, gastos, pagosMostrador, devolucionesMostrador, pagosProveedor };
}

export type FilasMovimientosCaja = Awaited<ReturnType<typeof consultarMovimientosCaja>>;

/** Entrada de `calcularResumenCaja` a partir de las filas consultadas. */
export function resumenBaseDeMovimientos(f: FilasMovimientosCaja): MovimientosCaja {
  return {
    pagos: f.pagos.map((p) => ({ monto: Number(p.monto), metodo: p.metodoPago as Metodo })),
    anticipos: f.anticipos.map((a) => ({ monto: Number(a.monto), metodo: a.metodoPago as Metodo })),
    devoluciones: [
      ...f.devoluciones.map((d) => ({
        monto: Number(d.monto),
        metodo: (d.metodoDevolucion ?? "EFECTIVO") as Metodo,
      })),
      ...f.devolucionesMostrador.map((d) => ({ monto: Number(d.montoEnEfectivo), metodo: d.metodoPago as Metodo })),
    ],
    ventasMostrador: f.pagosMostrador.map((p) => ({ monto: Number(p.monto), metodo: p.metodoPago as Metodo })),
    gastosEfectivo: f.gastos.map((g) => Number(g.monto)),
    pagosProveedorEfectivo: f.pagosProveedor.map((p) => Number(p.monto)),
  };
}
