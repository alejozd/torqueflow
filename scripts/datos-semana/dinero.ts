import { consultarMovimientosCaja, resumenBaseDeMovimientos } from "@/lib/caja/movimientos";
import { calcularResumenCaja } from "@/lib/caja/resumen";
import { roundMoney } from "@/lib/money/round";
import { MARCA } from "./contexto";
import type { Manejador } from "./ejecutor";
import { instante } from "./fechas";

const monto = (v: { toString(): string } | number) => Number(v);

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
};
