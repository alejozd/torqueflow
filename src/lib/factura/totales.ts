import { roundMoney } from "@/lib/money/round";

export const IVA_RATE = 0.19;

export interface FacturaTotalesInput {
  items: { cantidad: number; precioUnitario: number }[];
  manoDeObra: { horas: number; precioHora: number }[];
  descuento: number;
}

export interface FacturaTotales {
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
}

export function computeFacturaTotales({ items, manoDeObra, descuento }: FacturaTotalesInput): FacturaTotales {
  const itemsTotal = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
  const manoDeObraTotal = manoDeObra.reduce((sum, linea) => sum + linea.horas * linea.precioHora, 0);
  const subtotal = roundMoney(itemsTotal + manoDeObraTotal);
  const base = roundMoney(subtotal - descuento);
  const iva = roundMoney(base * IVA_RATE);
  const total = roundMoney(base + iva);
  return { subtotal, descuento, iva, total };
}
