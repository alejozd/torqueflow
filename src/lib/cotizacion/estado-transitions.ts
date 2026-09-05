import type { EstadoCotizacion } from "@/generated/prisma-tenant";

export const ESTADO_COTIZACION_TRANSITIONS: Record<EstadoCotizacion, EstadoCotizacion[]> = {
  BORRADOR: ["ENVIADA"],
  ENVIADA: ["APROBADA", "RECHAZADA", "VENCIDA"],
  APROBADA: [],
  RECHAZADA: [],
  VENCIDA: [],
};

export function isValidEstadoTransition(from: EstadoCotizacion, to: EstadoCotizacion): boolean {
  return ESTADO_COTIZACION_TRANSITIONS[from].includes(to);
}
