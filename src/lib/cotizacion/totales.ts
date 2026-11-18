import { roundMoney } from "@/lib/money/round";
import { separarIvaIncluido, type TramoIva } from "@/lib/iva/desglose";

export type TipoDescuentoCotizacion = "PORCENTAJE" | "MONTO";

export interface CotizacionTotalesInput {
  /** `ivaPct` de la línea; sin valor, 19 % (las líneas de antes de las tarifas). */
  items: { tipo: "REPUESTO" | "MANO_OBRA"; cantidad: number; precioUnitario: number; ivaPct?: number }[];
  descuentoPct: number;
  /** Sin valor se asume PORCENTAJE, el único tipo que existía antes. */
  descuentoTipo?: TipoDescuentoCotizacion;
  descuentoMonto?: number;
}

export interface CotizacionTotales {
  subtotalRepuestos: number;
  subtotalManoObra: number;
  subtotal: number;
  descuento: number;
  iva: number;
  /** Una fila por tarifa usada, de la más alta a la más baja. */
  desgloseIva: TramoIva[];
  total: number;
}

export function computeCotizacionTotales({
  items,
  descuentoPct,
  descuentoTipo = "PORCENTAJE",
  descuentoMonto = 0,
}: CotizacionTotalesInput): CotizacionTotales {
  const subtotalRepuestos = roundMoney(
    items.filter((item) => item.tipo === "REPUESTO").reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0),
  );
  const subtotalManoObra = roundMoney(
    items.filter((item) => item.tipo === "MANO_OBRA").reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0),
  );
  const subtotal = roundMoney(subtotalRepuestos + subtotalManoObra);
  // Un monto fijo mayor que el subtotal dejaría la base negativa: se limita.
  const descuento =
    descuentoTipo === "MONTO"
      ? roundMoney(Math.min(Math.max(descuentoMonto, 0), subtotal))
      : roundMoney(subtotal * (descuentoPct / 100));
  // Los precios ya traen el IVA: el total es lo cotizado menos el descuento, y
  // el IVA que va dentro se separa por tarifa (solo para la factura).
  const total = roundMoney(subtotal - descuento);
  const { tramos, iva } = separarIvaIncluido(
    items.map((item) => ({ importe: item.cantidad * item.precioUnitario, ivaPct: item.ivaPct })),
    descuento,
  );
  return { subtotalRepuestos, subtotalManoObra, subtotal, descuento, iva, desgloseIva: tramos, total };
}

/** "Descuento (10%)" o, si es un monto fijo, solo "Descuento". */
export function etiquetaDescuento(descuentoPct: number | null): string {
  return descuentoPct === null ? "Descuento" : `Descuento (${descuentoPct}%)`;
}

/** El porcentaje que se muestra junto al descuento; null cuando es un monto fijo. */
export function porcentajeVisible(descuentoTipo: TipoDescuentoCotizacion, descuentoPct: number): number | null {
  return descuentoTipo === "MONTO" ? null : descuentoPct;
}
