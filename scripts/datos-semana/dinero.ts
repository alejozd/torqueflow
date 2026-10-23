import { consultarMovimientosCaja, resumenBaseDeMovimientos } from "@/lib/caja/movimientos";
import { calcularResumenCaja } from "@/lib/caja/resumen";
import { emitirFacturaEnTransaccion, type OrdenParaFacturar } from "@/lib/factura/emitir";
import { registrarPagoEnTransaccion } from "@/lib/factura/registrar-pago";
import { roundMoney } from "@/lib/money/round";
import type { Azar } from "./azar";
import { MARCA, type Contexto } from "./contexto";
import type { EstadoEjecucion, Manejador, TenantTx } from "./ejecutor";
import { desfasar, instante, sumarDias } from "./fechas";

const monto = (v: { toString(): string } | number) => Number(v);

/**
 * abrirCajaAction: una caja abierta por sede; si ya hay una (real), no se toca. Tampoco se abre
 * si la sede ya abrió una caja ese día (real o de otra corrida): dos cajas sobre la misma ventana
 * contarían el mismo efectivo dos veces. Sin caja del script, los cobros caen en tarjeta/transferencia.
 */
export const abrirCaja: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "abrirCaja") return;
  const inicioDia = instante(dia.fecha, "00:00");
  const finDia = instante(sumarDias(dia.fecha, 1), "00:00");
  const existente = await tx.cajaSesion.findFirst({
    where: { sedeId: dia.sedeId, OR: [{ cerradaAt: null }, { abiertaAt: { gte: inicioDia, lt: finDia } }] },
    select: { id: true },
  });
  if (existente) return;
  const sesion = await tx.cajaSesion.create({
    data: {
      sedeId: dia.sedeId,
      baseInicial: az.entero(5, 30) * 10_000,
      abiertaAt: new Date(Math.min(instante(dia.fecha, evento.hora).getTime(), Date.now())),
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
  const movimientos = resumenBaseDeMovimientos(await consultarMovimientosCaja(tx, sesion.sedeId, sesion.abiertaAt, cerradaAt));
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
  (estado.cajasCerradas ??= []).push(cajaId);
};

/** Sin caja abierta en la sede el efectivo no se puede registrar (exigirCajaParaEfectivo): solo tarjeta o transferencia. */
function metodosDeCobro(estado: EstadoEjecucion, sedeId: string) {
  return estado.cajaAbierta.has(sedeId)
    ? (["EFECTIVO", "TARJETA", "TRANSFERENCIA"] as const)
    : (["TARJETA", "TRANSFERENCIA"] as const);
}

const centenas = (v: number) => Math.floor(v / 100) * 100;

/**
 * registrarAnticipoAction para cada orden de `anticiposPendientes`: entre el 20 y el 40 % del
 * subtotal de sus líneas (siempre por debajo del total, así que `crearFacturaAction` no lo rechaza).
 */
export async function registrarAnticiposPendientes(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, sedeId: string, az: Azar, creado: Date,
): Promise<void> {
  const claves = estado.anticiposPendientes.splice(0);
  for (const clave of claves) {
    const ordenId = estado.ordenes.get(clave);
    if (!ordenId) continue;
    const [items, manoDeObra] = await Promise.all([
      tx.itemOrden.findMany({ where: { ordenId }, select: { cantidad: true, precioUnitario: true } }),
      tx.manoDeObra.findMany({ where: { ordenId }, select: { valor: true } }),
    ]);
    const subtotal = items.reduce((s, i) => s + i.cantidad * monto(i.precioUnitario), 0)
      + manoDeObra.reduce((s, l) => s + monto(l.valor), 0);
    const valor = Math.max(1000, Math.floor((subtotal * (0.2 + az.azar() * 0.2)) / 1000) * 1000);
    await tx.anticipo.create({
      data: {
        ordenId, sedeId, monto: valor,
        metodoPago: az.elegir(metodosDeCobro(estado, sedeId)),
        referencia: `${MARCA} Anticipo`,
        registradoPorId: ctx.recepcionistaId,
        createdAt: creado,
      },
    });
    estado.creados.anticipo = (estado.creados.anticipo ?? 0) + 1;
  }
}

export type OrdenParaCobrar = OrdenParaFacturar & { id: string };

/** Montos de los pagos por hacer: completo (a veces en dos), parcial (30 a 70 % del saldo) o ninguno. */
function repartirPagos(pago: "COMPLETO" | "PARCIAL" | "PENDIENTE", saldo: number, az: Azar): number[] {
  if (pago === "PENDIENTE" || saldo <= 0) return [];
  if (pago === "PARCIAL") return [centenas(saldo * (0.3 + az.azar() * 0.4))].filter((v) => v > 0);
  if (saldo >= 2000 && az.probabilidad(0.3)) {
    const primero = centenas(saldo * (0.4 + az.azar() * 0.2));
    return [primero, roundMoney(saldo - primero)];
  }
  return [saldo];
}

/**
 * crearFacturaAction + registrarPagoAction: factura la orden (con totales, descuento de stock y
 * aplicación de anticipos de la app) y registra los pagos que pide el evento. Los métodos nunca
 * incluyen efectivo sin caja abierta; si hay dos pagos usan métodos distintos.
 */
export async function facturarYCobrar(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, sedeId: string,
  orden: OrdenParaCobrar, pago: "COMPLETO" | "PARCIAL" | "PENDIENTE", az: Azar, creada: Date,
): Promise<void> {
  const factura = await emitirFacturaEnTransaccion(tx, orden, 0, ctx.recepcionistaId, creada);
  estado.creados.factura = (estado.creados.factura ?? 0) + 1;
  (estado.facturasCreadas ??= []).push(factura.id);

  const montos = repartirPagos(pago, factura.saldoPendiente, az);
  const disponibles = [...metodosDeCobro(estado, sedeId)];
  for (const [i, valor] of montos.entries()) {
    const metodoPago = disponibles.splice(az.entero(0, disponibles.length - 1), 1)[0]!;
    await registrarPagoEnTransaccion(tx, {
      facturaId: factura.id, monto: valor, metodoPago,
      referencia: `${MARCA} ${metodoPago === "EFECTIVO" ? "Pago en caja" : `Ref. ${az.entero(100_000, 999_999)}`}`,
      registradoPorId: ctx.recepcionistaId,
    }, desfasar(creada, i + 1));
    estado.creados.pago = (estado.creados.pago ?? 0) + 1;
  }
}
