import { computeFacturaTotales, type FacturaTotales } from "@/lib/factura/totales";
import { roundMoney } from "@/lib/money/round";

/**
 * Reglas de una venta de mostrador (Fase 24), sin Prisma y con test propio.
 * Los totales **reutilizan** el mismo cálculo que la factura (IVA 19% sobre la
 * base, descuento como monto) para que mostrador y facturación no puedan
 * separarse con el tiempo.
 */

export function calcularTotalesVenta(
  lineas: { cantidad: number; precioUnitario: number }[],
  descuento: number,
): FacturaTotales {
  return computeFacturaTotales({
    items: lineas,
    manoDeObra: [],
    descuento: Math.max(0, roundMoney(descuento)),
  });
}

/** Cuánto queda por devolver de una línea: ni negativo ni por encima de lo vendido. */
export function cantidadDevolvible(vendida: number, yaDevuelta: number): number {
  return Math.max(0, vendida - Math.max(0, yaDevuelta));
}

/**
 * Lo que vale lo devuelto, **repartiendo el descuento de la venta en proporción**.
 * Sin repartirlo, devolver una línea de una venta con descuento pagaría su precio
 * sin descuento, más de lo que el cliente pagó por ella. El factor sale del total
 * cobrado sobre el subtotal, así que devolver todas las líneas devuelve
 * exactamente el total (y el tope de `montoADevolverPermitido` sigue de red).
 */
export function totalDevolucion(
  lineas: { cantidad: number; precioUnitario: number }[],
  venta: { subtotal: number; total: number },
): number {
  if (venta.subtotal <= 0) return 0;
  const base = lineas.reduce((suma, linea) => suma + linea.cantidad * linea.precioUnitario, 0);
  return roundMoney(base * (venta.total / venta.subtotal));
}

/**
 * Tope del dinero a devolver: nunca más de lo que la venta cobró menos lo ya
 * devuelto. Es la red que hace imposible devolver de más aunque la venta llevara
 * descuento (devolver todas las líneas sin este tope devolvería el precio sin
 * descuento, más de lo que el cliente pagó).
 */
export function montoADevolverPermitido(totalVenta: number, yaDevuelto: number, calculado: number): number {
  return roundMoney(Math.max(0, Math.min(calculado, totalVenta - Math.max(0, yaDevuelto))));
}
