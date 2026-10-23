import type { FrecuenciaLiquidacion, Prisma, TipoEsquemaLiquidacion } from "@/generated/prisma-tenant";
import { ROLES_MECANICO } from "@/lib/auth/permisos";
import { calcularMontoLiquidacion, montoPorTrabajo } from "./calculo";
import { rangoDelPeriodo, ventanasSolapan } from "./periodo";
import { computeProduccionPorMecanico } from "./produccion";

/** Lo congelado de una liquidación pagada. */
export interface LiquidacionPagada {
  id: string;
  montoCalculado: number;
  ajuste: number;
  motivoAjuste: string | null;
  total: number;
  pagadaAt: Date | null;
}

export interface LiquidacionFila {
  usuarioId: string;
  nombre: string;
  /** Lo producido en el periodo (vivo), atribuido por líneas de mano de obra. */
  ordenes: number;
  trabajos: number;
  montoManoObra: number;
  montoPorTrabajo: number | null;
  /** Esquema vigente; null = sin esquema, no se liquida. */
  tipo: TipoEsquemaLiquidacion | null;
  porcentaje: number | null;
  montoFijo: number | null;
  montoSugerido: number | null;
  /** La ventana ya está pagada en otro periodo del mismo técnico (cambio de frecuencia). */
  solapada: boolean;
  /** null = por pagar. */
  pago: LiquidacionPagada | null;
}

/** Mano de obra del periodo que no se le puede liquidar a nadie (sin mecánico). */
export interface SinAsignarDelPeriodo { ordenes: number; trabajos: number; montoManoObra: number }

export interface FilasDelPeriodo {
  filas: LiquidacionFila[];
  sinAsignar: SinAsignarDelPeriodo | null;
}

type Lector = Pick<Prisma.TransactionClient, "liquidacionMecanico" | "usuario" | "ordenTrabajo">;

function aNumero(valor: { toString(): string } | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Number(valor.toString());
}

/**
 * Por técnico de la sede: lo que produjo en el periodo (vivo), su esquema
 * vigente, el monto que le corresponde y el pago, si ya lo hay. Reporte y
 * liquidación comparten la agregación (`computeProduccionPorMecanico`), así que
 * no pueden divergir. Se usa igual fuera y dentro de la transacción del pago.
 */
export async function cargarFilasDelPeriodo(
  db: Lector,
  sedeId: string,
  frecuencia: FrecuenciaLiquidacion,
  periodo: string,
): Promise<FilasDelPeriodo> {
  const rango = rangoDelPeriodo(frecuencia, periodo);

  // Solo cuentan los pagos: una anulada (o una pendiente de antes de la
  // simplificación) deja el periodo por pagar. Son pocas filas por sede.
  const pagadas = await db.liquidacionMecanico.findMany({
    where: { sedeId, estado: "PAGADA" },
    select: {
      id: true,
      usuarioId: true,
      periodo: true,
      frecuencia: true,
      montoCalculado: true,
      ajuste: true,
      motivoAjuste: true,
      total: true,
      pagadaAt: true,
    },
  });
  const esDelPeriodo = (pagada: { periodo: string; frecuencia: FrecuenciaLiquidacion }) =>
    pagada.periodo === periodo && pagada.frecuencia === frecuencia;

  // Un técnico que ya no está en la sede pero tiene un pago de este periodo
  // también entra: si no, ese pago quedaría imposible de anular.
  const idsConPago = pagadas.filter(esDelPeriodo).map((pagada) => pagada.usuarioId);
  const tecnicosDeLaSede = { role: { in: [...ROLES_MECANICO] }, sedes: { some: { sedeId } } };

  const [tecnicos, ordenes] = await Promise.all([
    db.usuario.findMany({
      where: idsConPago.length > 0 ? { OR: [tecnicosDeLaSede, { id: { in: idsConPago } }] } : tecnicosDeLaSede,
      select: {
        id: true,
        nombre: true,
        esquemaLiquidacion: { select: { tipo: true, porcentaje: true, montoFijo: true } },
      },
      orderBy: { nombre: "asc" },
    }),
    db.ordenTrabajo.findMany({
      where: { sedeId, estado: "ENTREGADA", entregadaAt: { gte: rango.gte, lt: rango.lt } },
      select: {
        mecanicoId: true,
        mecanico: { select: { nombre: true } },
        manoDeObra: { select: { valor: true, mecanicoId: true, mecanico: { select: { nombre: true } } } },
      },
    }),
  ]);

  const produccion = computeProduccionPorMecanico(
    ordenes.map((orden) => ({
      mecanicoId: orden.mecanicoId,
      mecanicoNombre: orden.mecanico?.nombre ?? null,
      manoDeObra: orden.manoDeObra.map((linea) => ({
        valor: Number(linea.valor),
        mecanicoId: linea.mecanicoId,
        mecanicoNombre: linea.mecanico?.nombre ?? null,
      })),
    })),
  );
  const porMecanico = new Map(produccion.flatMap((fila) => (fila.mecanicoId ? [[fila.mecanicoId, fila]] : [])));
  // La bolsa "Sin asignar" no se liquida (no hay a quién), pero se avisa: es
  // trabajo que nadie cobra.
  const sinAsignarBruto = produccion.find((fila) => fila.mecanicoId === null);
  const sinAsignar = sinAsignarBruto
    ? { ordenes: sinAsignarBruto.ordenes, trabajos: sinAsignarBruto.trabajos, montoManoObra: sinAsignarBruto.montoManoObra }
    : null;

  const filas = tecnicos.map((tecnico): LiquidacionFila => {
    const vivo = porMecanico.get(tecnico.id) ?? { ordenes: 0, trabajos: 0, montoManoObra: 0 };
    const esquema = tecnico.esquemaLiquidacion
      ? {
          tipo: tecnico.esquemaLiquidacion.tipo,
          porcentaje: aNumero(tecnico.esquemaLiquidacion.porcentaje),
          montoFijo: aNumero(tecnico.esquemaLiquidacion.montoFijo),
        }
      : null;
    const suyas = pagadas.filter((pagada) => pagada.usuarioId === tecnico.id);
    const pago = suyas.find(esDelPeriodo) ?? null;

    return {
      usuarioId: tecnico.id,
      nombre: tecnico.nombre,
      ordenes: vivo.ordenes,
      trabajos: vivo.trabajos,
      montoManoObra: vivo.montoManoObra,
      montoPorTrabajo: montoPorTrabajo(vivo.montoManoObra, vivo.trabajos),
      tipo: esquema?.tipo ?? null,
      porcentaje: esquema?.porcentaje ?? null,
      montoFijo: esquema?.montoFijo ?? null,
      montoSugerido: esquema ? calcularMontoLiquidacion(esquema, vivo.montoManoObra) : null,
      solapada: suyas.some(
        (pagada) => !esDelPeriodo(pagada) && ventanasSolapan(pagada.frecuencia, pagada.periodo, frecuencia, periodo),
      ),
      pago: pago
        ? {
            id: pago.id,
            montoCalculado: Number(pago.montoCalculado),
            ajuste: Number(pago.ajuste),
            motivoAjuste: pago.motivoAjuste,
            total: Number(pago.total),
            pagadaAt: pago.pagadaAt,
          }
        : null,
    };
  });

  return { filas, sinAsignar };
}
