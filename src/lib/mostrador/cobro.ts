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
 * Suma de pagos; vueltas = exceso pagado en EFECTIVO sobre el total (nunca de otro
 * método). `recibidoEfectivo` es el billete que entregó el cliente: si supera el
 * pago en efectivo, la diferencia también son vueltas.
 */
export function resumirPagos(total: number, pagos: PagoEntrada[], recibidoEfectivo: number | null): ResumenPagos {
  const fallo = (error: string): ResumenPagos => ({ pagado: 0, saldo: roundMoney(total), vueltas: 0, error });

  if (pagos.some((pago) => !(pago.monto > 0))) return fallo("Cada pago debe ser mayor que cero");

  const suma = roundMoney(pagos.reduce((acc, pago) => acc + pago.monto, 0));
  const efectivo = roundMoney(
    pagos.filter((pago) => pago.metodoPago === "EFECTIVO").reduce((acc, pago) => acc + pago.monto, 0),
  );

  if (suma > total) {
    const exceso = roundMoney(suma - total);
    if (exceso > efectivo) return fallo("Los pagos suman más que el total");
    return { pagado: roundMoney(total), saldo: 0, vueltas: exceso, error: null };
  }

  const vueltas =
    efectivo > 0 && recibidoEfectivo !== null && recibidoEfectivo > efectivo
      ? roundMoney(recibidoEfectivo - efectivo)
      : 0;
  return { pagado: suma, saldo: roundMoney(total - suma), vueltas, error: null };
}

/** Descuento como porcentaje del subtotal (antes de IVA). */
export function porcentajeDescuento(subtotal: number, descuento: number): number {
  if (subtotal <= 0 || descuento <= 0) return 0;
  return (descuento / subtotal) * 100;
}

/** ADMIN no tiene tope; RECEPCION puede hasta el tope inclusive. */
export function descuentoPermitido(rol: "ADMIN" | "RECEPCION", porcentaje: number, tope: number): boolean {
  return rol === "ADMIN" || porcentaje <= tope;
}
