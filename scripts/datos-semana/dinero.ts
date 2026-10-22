import { calcularResumenCaja, type Metodo } from "@/lib/caja/resumen";
import { roundMoney } from "@/lib/money/round";
import { MARCA } from "./contexto";
import type { Manejador, TenantTx } from "./ejecutor";
import { instante } from "./fechas";

const aMetodo = (m: string) => m as Metodo;
const monto = (v: { toString(): string } | number) => Number(v);

/**
 * Misma consulta de movimientos que `cargarMovimientos` de caja-actions (no se exporta):
 * lo que entra o sale del cajón en la ventana [desde, hasta) de la sede.
 */
async function movimientosEnVentana(tx: TenantTx, sedeId: string, desde: Date, hasta: Date) {
  const ventana = { gte: desde, lt: hasta };
  const pagos = await tx.pago.findMany({
    where: { metodoPago: { not: "ANTICIPO" }, createdAt: ventana, factura: { orden: { sedeId } } },
  });
  const anticipos = await tx.anticipo.findMany({ where: { sedeId, createdAt: ventana } });
  const devoluciones = await tx.anticipo.findMany({ where: { sedeId, estado: "DEVUELTO", devueltoAt: ventana } });
  const gastos = await tx.gasto.findMany({ where: { sedeId, pagadoEnEfectivo: true, createdAt: ventana } });
  const pagosMostrador = await tx.pagoVentaMostrador.findMany({ where: { createdAt: ventana, venta: { sedeId } } });
  const devolucionesMostrador = await tx.devolucionMostrador.findMany({ where: { sedeId, createdAt: ventana } });
  const pagosProveedor = await tx.pagoProveedor.findMany({
    where: { metodoPago: "EFECTIVO", createdAt: ventana, cuenta: { entrada: { bodega: { sedeId } } } },
  });
  return {
    pagos: pagos.map((p) => ({ monto: monto(p.monto), metodo: aMetodo(p.metodoPago) })),
    anticipos: anticipos.map((a) => ({ monto: monto(a.monto), metodo: aMetodo(a.metodoPago) })),
    devoluciones: [
      ...devoluciones.map((d) => ({ monto: monto(d.monto), metodo: aMetodo(d.metodoDevolucion ?? "EFECTIVO") })),
      ...devolucionesMostrador.map((d) => ({ monto: monto(d.montoEnEfectivo), metodo: aMetodo(d.metodoPago) })),
    ],
    ventasMostrador: pagosMostrador.map((p) => ({ monto: monto(p.monto), metodo: aMetodo(p.metodoPago) })),
    gastosEfectivo: gastos.map((g) => monto(g.monto)),
    pagosProveedorEfectivo: pagosProveedor.map((p) => monto(p.monto)),
  };
}

/** abrirCajaAction: una caja abierta por sede; si ya hay una (real), no se toca. */
export const abrirCaja: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "abrirCaja") return;
  const abierta = await tx.cajaSesion.findFirst({ where: { sedeId: dia.sedeId, cerradaAt: null }, select: { id: true } });
  if (abierta) return;
  const sesion = await tx.cajaSesion.create({
    data: {
      sedeId: dia.sedeId,
      baseInicial: az.entero(5, 30) * 10_000,
      abiertaAt: instante(dia.fecha, evento.hora),
      abiertaPorId: ctx.recepcionistaId,
      notas: MARCA,
    },
  });
  estado.cajaAbierta.set(dia.sedeId, sesion.id);
  estado.creados.caja = (estado.creados.caja ?? 0) + 1;
};

/** cerrarCajaAction: el esperado se recalcula; el contado es esperado + diferencia. */
export const cerrarCaja: Manejador = async (tx, ctx, estado, dia, evento) => {
  if (evento.tipo !== "cerrarCaja") return;
  const cajaId = estado.cajaAbierta.get(dia.sedeId);
  if (!cajaId) return;
  const sesion = await tx.cajaSesion.findUnique({ where: { id: cajaId } });
  if (!sesion || sesion.cerradaAt) return;
  const cerradaAt = instante(dia.fecha, evento.hora);
  const movimientos = await movimientosEnVentana(tx, sesion.sedeId, sesion.abiertaAt, cerradaAt);
  const { efectivoEsperado } = calcularResumenCaja(monto(sesion.baseInicial), movimientos);
  await tx.cajaSesion.updateMany({
    where: { id: cajaId, cerradaAt: null },
    data: {
      cerradaAt,
      cerradaPorId: ctx.recepcionistaId,
      efectivoEsperado,
      efectivoContado: roundMoney(efectivoEsperado + evento.diferencia),
    },
  });
  estado.cajaAbierta.delete(dia.sedeId);
};
