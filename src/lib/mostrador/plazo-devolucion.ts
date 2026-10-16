import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Hasta cuándo y quién puede devolver una venta de mostrador (rediseño, D4):
 * hasta 30 días después de la venta, y si la venta es de una caja ya cerrada
 * solo ADMIN (su dinero ya se contó en un arqueo). Sin Prisma y con test propio:
 * la acción la aplica en el servidor y la pestaña Ventas la usa para avisar.
 */

export const DIAS_PLAZO_DEVOLUCION = 30;

const MS_DIA = 24 * 60 * 60 * 1000;

export const MOTIVO_FUERA_DE_PLAZO = `Esta venta tiene más de ${DIAS_PLAZO_DEVOLUCION} días: ya no se puede devolver`;
export const MOTIVO_CAJA_CERRADA = "Esta venta es de una caja ya cerrada: solo un administrador puede devolverla";

/**
 * Si la venta pertenece a una caja ya cerrada (regla del plan):
 * - Con control de caja: no hay caja abierta en la sede, o la abierta se abrió
 *   después de la venta (la de la venta ya se cerró).
 * - Sin control de caja: la venta es de un día anterior (hora Bogotá).
 */
export function ventaEnCajaCerrada({
  fechaVenta,
  ahora,
  usarControlCaja,
  cajaAbiertaDesde,
}: {
  fechaVenta: Date;
  ahora: Date;
  usarControlCaja: boolean;
  /** `abiertaAt` de la caja abierta de la sede; null si no hay ninguna. */
  cajaAbiertaDesde: Date | null;
}): boolean {
  if (usarControlCaja) return cajaAbiertaDesde === null || cajaAbiertaDesde.getTime() > fechaVenta.getTime();
  // "AAAA-MM-DD" se compara bien como texto.
  return formatoDiaBogota.format(fechaVenta) < formatoDiaBogota.format(ahora);
}

export function puedeDevolver({
  fechaVenta,
  ahora,
  rol,
  cajaCerrada,
}: {
  fechaVenta: Date;
  ahora: Date;
  rol: string;
  cajaCerrada: boolean;
}): { permitido: boolean; motivo: string | null } {
  if (ahora.getTime() - fechaVenta.getTime() > DIAS_PLAZO_DEVOLUCION * MS_DIA) {
    return { permitido: false, motivo: MOTIVO_FUERA_DE_PLAZO };
  }
  if (cajaCerrada && rol !== "ADMIN") return { permitido: false, motivo: MOTIVO_CAJA_CERRADA };
  return { permitido: true, motivo: null };
}
