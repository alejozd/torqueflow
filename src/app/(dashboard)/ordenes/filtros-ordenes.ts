import type { EstadoOrden } from "@/generated/prisma-tenant";
import type { MotivoAlerta } from "@/lib/orden/flujo";

/**
 * Filtros, orden y URL del listado de órdenes (Fase 22). Viven aparte de la
 * página para poder probarlos: la página ya era el archivo más cargado de la
 * pantalla y esta fase le suma prioridad y alertas.
 */

export const ESTADOS_VALIDOS: EstadoOrden[] = ["BORRADOR", "EN_PROCESO", "TERMINADA", "ENTREGADA", "ANULADA"];

export type SortKey = "fecha" | "total" | "estado" | "cliente" | "prioridad";
export type SortOrder = "asc" | "desc";
export type VistaOrdenes = "tabla" | "tablero";

export const SORT_KEYS: SortKey[] = ["fecha", "total", "estado", "cliente", "prioridad"];

export const ALERTAS_VALIDAS: MotivoAlerta[] = ["ESTANCADA", "TERMINADA_SIN_ENTREGAR"];

export const ETIQUETA_FILTRO_ALERTA: Record<MotivoAlerta, string> = {
  ESTANCADA: "Estancadas",
  TERMINADA_SIN_ENTREGAR: "Sin entregar",
};

export function parseEstado(valor: string | undefined): EstadoOrden | undefined {
  return ESTADOS_VALIDOS.includes(valor as EstadoOrden) ? (valor as EstadoOrden) : undefined;
}

export function parseAlerta(valor: string | undefined): MotivoAlerta | undefined {
  return ALERTAS_VALIDAS.includes(valor as MotivoAlerta) ? (valor as MotivoAlerta) : undefined;
}

export function parseSort(valor: string | undefined): SortKey | undefined {
  return SORT_KEYS.includes(valor as SortKey) ? (valor as SortKey) : undefined;
}

export function parseOrder(valor: string | undefined): SortOrder {
  return valor === "asc" ? "asc" : "desc";
}

export function parseVista(valor: string | undefined): VistaOrdenes {
  return valor === "tablero" ? "tablero" : "tabla";
}

export interface ParametrosOrdenes {
  estado?: EstadoOrden;
  vista?: VistaOrdenes;
  sort?: SortKey;
  order?: SortOrder;
  alerta?: MotivoAlerta;
}

/** Arma la URL conservando las otras dimensiones (estado, vista, orden y alerta). */
export function construirHrefOrdenes(base: ParametrosOrdenes): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.vista && base.vista !== "tabla") params.set("vista", base.vista);
  if (base.sort) params.set("sort", base.sort);
  if (base.sort && base.order === "asc") params.set("order", "asc");
  if (base.alerta) params.set("alerta", base.alerta);
  const query = params.toString();
  return query ? `/ordenes?${query}` : "/ordenes";
}

/**
 * Recorta a las órdenes con la alerta pedida. `motivos` viene de la consulta de
 * alertas (cruzada por id), no de la fila: así el listado no necesita cargar
 * ítems, mano de obra, DVI ni daños solo para pintar la marca.
 */
export function filtrarPorAlerta<T extends { id: string }>(
  ordenes: T[],
  alerta: MotivoAlerta | undefined,
  motivos: Map<string, MotivoAlerta>,
): T[] {
  if (!alerta) return ordenes;
  return ordenes.filter((orden) => motivos.get(orden.id) === alerta);
}
