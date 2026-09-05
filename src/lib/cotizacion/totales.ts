import { roundMoney } from "@/lib/money/round";

export const IVA_RATE = 0.19;

export interface CotizacionTotalesInput {
  items: { tipo: "REPUESTO" | "MANO_OBRA"; cantidad: number; precioUnitario: number }[];
  descuentoPct: number;
}

export interface CotizacionTotales {
  subtotalRepuestos: number;
  subtotalManoObra: number;
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
}

export function computeCotizacionTotales({ items, descuentoPct }: CotizacionTotalesInput): CotizacionTotales {
  const subtotalRepuestos = roundMoney(
    items.filter((item) => item.tipo === "REPUESTO").reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0),
  );
  const subtotalManoObra = roundMoney(
    items.filter((item) => item.tipo === "MANO_OBRA").reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0),
  );
  const subtotal = roundMoney(subtotalRepuestos + subtotalManoObra);
  const descuento = roundMoney(subtotal * (descuentoPct / 100));
  const base = roundMoney(subtotal - descuento);
  const iva = roundMoney(base * IVA_RATE);
  const total = roundMoney(base + iva);
  return { subtotalRepuestos, subtotalManoObra, subtotal, descuento, iva, total };
}
