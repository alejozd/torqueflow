import { registrarEventoAuditoria } from "@/lib/auditoria/registrarEvento";
import { CATEGORIA_LIQUIDACION_ID } from "@/lib/liquidaciones/categorias";
import { totalLiquidacion } from "@/lib/liquidaciones/calculo";
import { leerFrecuenciaLiquidacion } from "@/lib/liquidaciones/configuracion";
import { cargarFilasDelPeriodo } from "@/lib/liquidaciones/filas-periodo";
import { etiquetaPeriodo, periodoActual } from "@/lib/liquidaciones/periodo";
import { MARCA } from "./contexto";
import { metodosDePago } from "./compras";
import type { EstadoEjecucion, Manejador } from "./ejecutor";
import { instante, soloDia } from "./fechas";

const sumar = (estado: EstadoEjecucion, clave: string, n = 1) => {
  estado.creados[clave] = (estado.creados[clave] ?? 0) + n;
};

/** Anota una advertencia visible al final de la corrida y cuenta el evento como omitido. */
function omitir(estado: EstadoEjecucion, texto: string) {
  (estado.advertencias ??= []).push(texto);
  sumar(estado, "omitido:liquidacion");
}

/**
 * pagarLiquidacionAction para cada técnico de la sede con esquema configurado: lee el periodo en
 * curso como la pantalla (mano de obra de las órdenes entregadas), crea el gasto de la categoría
 * del sistema y congela el documento PAGADA con la auditoría. Sin ajuste. En efectivo solo con caja
 * abierta. Nunca falla el día: si nadie tiene esquema, o la categoría falta, solo avisa.
 */
export const registrarLiquidacion: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "liquidacion") return;
  const cuando = instante(dia.fecha, evento.hora);
  const frecuencia = await leerFrecuenciaLiquidacion(tx);
  const periodo = periodoActual(frecuencia, cuando);
  const etiqueta = etiquetaPeriodo(frecuencia, periodo);

  const categoria = await tx.categoriaGasto.findUnique({ where: { id: CATEGORIA_LIQUIDACION_ID }, select: { id: true, activo: true } });
  if (!categoria?.activo) {
    omitir(estado, `Liquidación omitida el ${dia.fecha}: falta la categoría de gasto "Liquidación de mecánicos" (o está desactivada).`);
    return;
  }

  const { filas } = await cargarFilasDelPeriodo(tx, dia.sedeId, frecuencia, periodo);
  if (!filas.some((f) => f.tipo)) {
    omitir(estado, `Liquidación omitida el ${dia.fecha}: ningún mecánico de la sede tiene esquema de liquidación configurado.`);
    return;
  }

  for (const fila of filas) {
    const { tipo } = fila;
    if (!tipo || fila.pago || fila.solapada) continue; // sin esquema, ya pagada o ya cubierta por otro periodo
    const montoCalculado = fila.montoSugerido ?? 0;
    const total = totalLiquidacion(montoCalculado, 0);
    if (total <= 0) continue; // nada que pagar (sin trabajo en el periodo)

    const metodoPago = az.elegir(metodosDePago(estado, dia.sedeId));
    const referencia = metodoPago === "EFECTIVO" ? null : `${MARCA} Ref. ${az.entero(100_000, 999_999)}`;
    const gasto = await tx.gasto.create({
      data: {
        sedeId: dia.sedeId,
        categoriaId: CATEGORIA_LIQUIDACION_ID,
        descripcion: `${MARCA} Liquidación ${fila.nombre} · ${etiqueta}`,
        monto: total,
        fecha: soloDia(dia.fecha),
        referencia,
        registradoPorId: ctx.actorId,
        pagadoEnEfectivo: metodoPago === "EFECTIVO",
        createdAt: cuando,
      },
    });
    const foto = {
      estado: "PAGADA" as const,
      ordenes: fila.ordenes,
      trabajos: fila.trabajos,
      montoManoObra: fila.montoManoObra,
      tipo,
      porcentaje: fila.porcentaje,
      montoFijo: fila.montoFijo,
      montoCalculado,
      ajuste: 0,
      motivoAjuste: null,
      total,
      gastoId: gasto.id,
      generadaPorId: ctx.actorId,
      generadaAt: cuando,
      pagadaPorId: ctx.actorId,
      pagadaAt: cuando,
    };
    const existente = await tx.liquidacionMecanico.findUnique({
      where: { periodo_usuarioId_sedeId: { periodo, usuarioId: fila.usuarioId, sedeId: dia.sedeId } },
      select: { id: true },
    });
    let liquidacionId: string;
    if (existente) {
      const { count } = await tx.liquidacionMecanico.updateMany({
        where: { id: existente.id, estado: { not: "PAGADA" } },
        data: { ...foto, frecuencia, anuladaAt: null, anuladaPorId: null, motivoAnulacion: null },
      });
      if (count !== 1) throw new Error(`liquidacion: la liquidación ${existente.id} ya estaba pagada`);
      liquidacionId = existente.id;
    } else {
      liquidacionId = (await tx.liquidacionMecanico.create({
        data: { ...foto, periodo, frecuencia, sedeId: dia.sedeId, usuarioId: fila.usuarioId },
      })).id;
    }
    await registrarEventoAuditoria(tx, {
      tipo: "LIQUIDACION_PAGAR",
      actorId: ctx.actorId,
      entidadTipo: "LiquidacionMecanico",
      entidadId: liquidacionId,
      detalle: {
        periodo, frecuencia, usuarioId: fila.usuarioId, metodoPago, referencia,
        montoCalculado, ajuste: 0, motivoAjuste: null, monto: total, gastoId: gasto.id,
      },
    });
    sumar(estado, "liquidacion");
  }
};
