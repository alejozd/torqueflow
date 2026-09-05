import type { EstadoCotizacion } from "@/generated/prisma-tenant";

const MUTABLE_ESTADOS: EstadoCotizacion[] = ["BORRADOR"];

/** Only a BORRADOR cotización can have its ítems or descuento changed. */
export function assertCotizacionMutable(cotizacion: { estado: EstadoCotizacion }): void {
  if (!MUTABLE_ESTADOS.includes(cotizacion.estado)) {
    throw new Error(`No se puede modificar una cotización en estado ${cotizacion.estado}.`);
  }
}
