import type { MetodoPago } from "@/generated/prisma-tenant";
import { roundMoney } from "@/lib/money/round";

/**
 * Reglas de cobro del mostrador (rediseño, D1-D3), sin Prisma y con test propio:
 * pagos mixtos, saldo a crédito y tope de descuento por rol.
 */

export interface PagoEntrada {
  metodoPago: MetodoPago;
  monto: number;
  referencia?: string | null;
}

export interface ResumenPagos {
  /** Lo aplicado a la venta (nunca más que el total). */
  pagado: number;
  saldo: number;
  vueltas: number;
  error: string | null;
}

/**
 * Los pagos son netos: su suma no puede pasar del total. Las vueltas salen solo
 * de `recibidoEfectivo` (lo que entregó el cliente) menos el pago en efectivo.
 */
export function resumirPagos(total: number, pagos: PagoEntrada[], recibidoEfectivo: number | null): ResumenPagos {
  const fallo = (error: string): ResumenPagos => ({ pagado: 0, saldo: roundMoney(total), vueltas: 0, error });

  if (pagos.some((pago) => !(pago.monto > 0))) return fallo("Cada pago debe ser mayor que cero");

  const suma = roundMoney(pagos.reduce((acc, pago) => acc + pago.monto, 0));
  const efectivo = roundMoney(
    pagos.filter((pago) => pago.metodoPago === "EFECTIVO").reduce((acc, pago) => acc + pago.monto, 0),
  );

  if (suma > total) return fallo("Los pagos suman más que el total");

  // Los pagos son netos (lo que se queda en el taller); las vueltas solo salen de lo recibido.
  let vueltas = 0;
  if (recibidoEfectivo !== null) {
    if (recibidoEfectivo < efectivo) return fallo("Lo recibido en efectivo es menor que el pago en efectivo");
    vueltas = roundMoney(recibidoEfectivo - efectivo);
  }
  return { pagado: suma, saldo: roundMoney(total - suma), vueltas, error: null };
}

/** Descuento como porcentaje del subtotal (antes de IVA). */
export function porcentajeDescuento(subtotal: number, descuento: number): number {
  if (subtotal <= 0 || descuento <= 0) return 0;
  // Seis decimales: quita el ruido de coma flotante (7000/100000 daba 7.000000000000001)
  // sin esconder un peso de más.
  return Math.round((descuento / subtotal) * 100 * 1e6) / 1e6;
}

/** ADMIN no tiene tope; RECEPCION puede hasta el tope inclusive. */
export function descuentoPermitido(rol: "ADMIN" | "RECEPCION", porcentaje: number, tope: number): boolean {
  return rol === "ADMIN" || porcentaje <= tope;
}
