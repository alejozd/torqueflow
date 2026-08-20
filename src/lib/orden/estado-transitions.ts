import type { EstadoOrden } from "@/generated/prisma-tenant";

export const ESTADO_ORDEN_TRANSITIONS: Record<EstadoOrden, EstadoOrden[]> = {
  BORRADOR: ["EN_PROCESO", "ANULADA"],
  EN_PROCESO: ["TERMINADA", "ANULADA"],
  TERMINADA: ["ENTREGADA"],
  ENTREGADA: [],
  ANULADA: [],
};

export function isValidEstadoTransition(from: EstadoOrden, to: EstadoOrden): boolean {
  return ESTADO_ORDEN_TRANSITIONS[from].includes(to);
}
