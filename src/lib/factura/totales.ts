import { roundMoney } from "@/lib/money/round";
import { desglosarIva, type TramoIva } from "@/lib/iva/desglose";

/**
 * Totales de una factura (y de una venta de mostrador, que reutiliza el cálculo).
 * Cada línea paga el IVA de su tarifa (`ivaPct`; sin valor, 19 %, el de las
 * líneas anteriores a las tarifas) y el descuento se reparte entre las tarifas
 * en proporción a su peso (src/lib/iva/desglose.ts).
 */
export interface FacturaTotalesInput {
  items: { cantidad: number; precioUnitario: number; ivaPct?: number }[];
  manoDeObra: { valor: number; ivaPct?: number }[];
  descuento: number;
}

export interface FacturaTotales {
  subtotal: number;
  descuento: number;
  iva: number;
  /** Una fila por tarifa usada, de la más alta a la más baja. */
  desgloseIva: TramoIva[];
  total: number;
}

export function computeFacturaTotales({ items, manoDeObra, descuento }: FacturaTotalesInput): FacturaTotales {
  const lineas = [
    ...items.map((item) => ({ importe: item.cantidad * item.precioUnitario, ivaPct: item.ivaPct })),
    ...manoDeObra.map((linea) => ({ importe: linea.valor, ivaPct: linea.ivaPct })),
  ];
  const subtotal = roundMoney(lineas.reduce((sum, linea) => sum + linea.importe, 0));
  const base = roundMoney(subtotal - descuento);
  const { tramos, iva } = desglosarIva(lineas, descuento);
  const total = roundMoney(base + iva);
  return { subtotal, descuento, iva, desgloseIva: tramos, total };
}
