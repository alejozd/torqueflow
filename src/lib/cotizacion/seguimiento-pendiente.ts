import { inicioDiaBogota } from "@/lib/fecha-bogota";
import type { EstadoCotizacion } from "@/generated/prisma-tenant";

/**
 * Once a cotización is decided (APROBADA/RECHAZADA) or expired (VENCIDA),
 * there is nothing left to follow up on.
 */
const ESTADOS_CON_SEGUIMIENTO_ACTIVO: EstadoCotizacion[] = ["BORRADOR", "ENVIADA"];

export interface CotizacionParaSeguimientoPendiente {
  estado: EstadoCotizacion;
}

export interface UltimoSeguimientoParaPendiente {
  proximoSeguimiento: Date | null;
}

/**
 * Single definition of "pendiente de seguimiento", shared by the list filter
 * chip, the "Próximo seguimiento" column, and the sidebar/KPI counts so all
 * three never drift apart:
 *
 * A cotización is pendiente when its MOST RECENT seguimiento (by fecha desc --
 * callers pass that one row, not the full history) has a non-null
 * `proximoSeguimiento` that is due (<= hoy, compared in America/Bogota via
 * inicioDiaBogota) AND the cotización is still open (BORRADOR/ENVIADA).
 * A cotización with zero seguimientos is never pendiente -- there is no
 * scheduled next-contact date to be overdue on.
 */
export function esCotizacionPendienteDeSeguimiento(
  cotizacion: CotizacionParaSeguimientoPendiente,
  ultimoSeguimiento: UltimoSeguimientoParaPendiente | null | undefined,
  ahora: Date,
): boolean {
  if (!ultimoSeguimiento?.proximoSeguimiento) return false;
  if (!ESTADOS_CON_SEGUIMIENTO_ACTIVO.includes(cotizacion.estado)) return false;
  return ultimoSeguimiento.proximoSeguimiento.getTime() <= inicioDiaBogota(ahora).getTime();
}
