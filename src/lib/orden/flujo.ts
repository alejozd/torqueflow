import type { EstadoOrden, PrioridadOrden } from "@/generated/prisma-tenant";

/**
 * Reglas del flujo de taller (Fase 22), sin Prisma: las usan la consulta de
 * alertas, el listado y el tablero, y se prueban solas.
 *
 * "Actividad" es el mayor entre la cabecera de la orden y lo que se le ha
 * cargado (ítems, mano de obra, fotos del DVI y daños). Es a propósito:
 * `OrdenTrabajo.updatedAt` solo se mueve cuando alguien toca la fila de la orden
 * (estado, mecánico, recepción), así que cargar repuestos durante tres días
 * dejaría la orden como estancada si solo se mirara la cabecera.
 *
 * **Límite conocido:** de los hijos se mira su alta (`createdAt`), porque ninguno
 * de esos modelos guarda `updatedAt` (solo `Dvi` lo tiene). Editar o borrar una
 * línea ya cargada no cuenta como actividad. Cerrarlo pediría añadir `updatedAt`
 * a cuatro modelos y acordarse de tocarlo en cada acción; queda documentado en vez
 * de improvisado.
 */

export type MotivoAlerta = "ESTANCADA" | "TERMINADA_SIN_ENTREGAR";

export interface ActividadDeOrden {
  estado: EstadoOrden;
  createdAt: Date;
  updatedAt: Date;
  items: { createdAt: Date }[];
  manoDeObra: { createdAt: Date }[];
  dvi: { updatedAt: Date; fotos: { createdAt: Date }[] } | null;
  danios: { createdAt: Date }[];
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Una orden más vieja que esto ya no es "flujo de taller" sino historia: acota la
 * consulta de alertas para que no recorra años de órdenes terminadas, y evita que
 * un auto olvidado de hace dos años salga como alerta del día.
 */
export const DIAS_HISTORIAL_ALERTAS = 365;

export function limiteHistorialAlertas(ahora: Date): Date {
  return new Date(ahora.getTime() - DIAS_HISTORIAL_ALERTAS * MS_POR_DIA);
}

export function ultimaActividad(orden: ActividadDeOrden): Date {
  const momentos = [
    orden.createdAt,
    orden.updatedAt,
    ...orden.items.map((item) => item.createdAt),
    ...orden.manoDeObra.map((linea) => linea.createdAt),
    ...(orden.dvi ? [orden.dvi.updatedAt, ...orden.dvi.fotos.map((foto) => foto.createdAt)] : []),
    ...orden.danios.map((danio) => danio.createdAt),
  ];

  return momentos.reduce((mayor, momento) => (momento.getTime() > mayor.getTime() ? momento : mayor));
}

/** Días completos sin actividad; una fecha futura cuenta como 0, nunca negativo. */
export function diasSinActividad(orden: ActividadDeOrden, ahora: Date): number {
  const transcurrido = ahora.getTime() - ultimaActividad(orden).getTime();
  return transcurrido <= 0 ? 0 : Math.floor(transcurrido / MS_POR_DIA);
}

/**
 * Qué alerta levanta la orden, si alguna. Los borradores no alertan (un borrador
 * que nadie confirmó no es trabajo frenado) y lo entregado o anulado tampoco.
 */
export function alertaDeOrden(
  orden: ActividadDeOrden,
  opciones: { ahora: Date; diasUmbral: number },
): MotivoAlerta | null {
  if (diasSinActividad(orden, opciones.ahora) < opciones.diasUmbral) return null;
  if (orden.estado === "EN_PROCESO") return "ESTANCADA";
  if (orden.estado === "TERMINADA") return "TERMINADA_SIN_ENTREGAR";
  return null;
}

export const ETIQUETA_ALERTA: Record<MotivoAlerta, string> = {
  ESTANCADA: "Estancada",
  TERMINADA_SIN_ENTREGAR: "Terminada sin entregar",
};

export const ETIQUETA_PRIORIDAD: Record<PrioridadOrden, string> = {
  BAJA: "Baja",
  NORMAL: "Normal",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

/** Menor = más urgente, para ordenar con un `sort` numérico. */
export const ORDEN_PRIORIDAD: Record<PrioridadOrden, number> = {
  URGENTE: 0,
  ALTA: 1,
  NORMAL: 2,
  BAJA: 3,
};

/** Prioridad primero y, a igualdad, lo más antiguo (lo que lleva más esperando). */
export function compararPorPrioridad(
  a: { prioridad: PrioridadOrden; createdAt: Date },
  b: { prioridad: PrioridadOrden; createdAt: Date },
): number {
  const porPrioridad = ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad];
  if (porPrioridad !== 0) return porPrioridad;
  return a.createdAt.getTime() - b.createdAt.getTime();
}
