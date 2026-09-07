import type { EstadoCotizacion } from "@/generated/prisma-tenant";

// A cotización stays mutable (items, descuento) through BORRADOR and ENVIADA
// -- staff may still need to correct something before the client decides, or
// after resending it once already ENVIADA. Locked only once a final decision
// exists (APROBADA/RECHAZADA) or it expired (VENCIDA).
const MUTABLE_ESTADOS: EstadoCotizacion[] = ["BORRADOR", "ENVIADA"];

export function esCotizacionMutable(estado: EstadoCotizacion): boolean {
  return MUTABLE_ESTADOS.includes(estado);
}

/** Only a BORRADOR or ENVIADA cotización can have its ítems or descuento changed. */
export function assertCotizacionMutable(cotizacion: { estado: EstadoCotizacion }): void {
  if (!esCotizacionMutable(cotizacion.estado)) {
    throw new Error(`No se puede modificar una cotización en estado ${cotizacion.estado}.`);
  }
}
