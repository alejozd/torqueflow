import { roundMoney } from "@/lib/money/round";
import { separarIvaIncluido, type TramoIva } from "@/lib/iva/desglose";

/**
 * Totales de una factura (y de una venta de mostrador, que reutiliza el cálculo).
 * Los precios traen el IVA incluido: el total es la suma menos el descuento, y
 * el IVA de cada tarifa (`ivaPct`; sin valor, 19 %) se separa por dentro, con
 * el descuento repartido entre tarifas (src/lib/iva/desglose.ts).
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
  // Precios con IVA incluido: el total no sube; el IVA se separa por dentro.
  const total = roundMoney(subtotal - descuento);
  const { tramos, iva } = separarIvaIncluido(lineas, descuento);
  return { subtotal, descuento, iva, desgloseIva: tramos, total };
}
