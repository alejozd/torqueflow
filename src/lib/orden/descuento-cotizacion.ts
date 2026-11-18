import type { TipoDescuentoCotizacion } from "@/lib/cotizacion/totales";

export interface DescuentoCotizacion {
  numero: number;
  descuentoTipo: TipoDescuentoCotizacion;
  descuentoPct: number;
  descuentoMonto: number;
}

/**
 * El descuento que la orden hereda de su cotización (tanda 4), para mostrarlo en
 * la Cuenta y prellenar la factura. La orden puede haber cambiado desde que se
 * aprobó, así que un porcentaje se aplica al total de hoy y un monto fijo no pasa
 * de él. En pesos enteros, como el de la cotización. Sin cotización, o sin descuento en ella, no hay nada que heredar.
 */
export function descuentoHeredado(
  cotizacion: DescuentoCotizacion | null,
  subtotal: number,
): { descuento: number; etiqueta: string } | null {
  if (!cotizacion) return null;
  const descuento =
    cotizacion.descuentoTipo === "MONTO"
      ? Math.round(Math.min(Math.max(cotizacion.descuentoMonto, 0), subtotal))
      : Math.round(subtotal * (cotizacion.descuentoPct / 100));
  if (descuento <= 0) return null;
  const detalle = cotizacion.descuentoTipo === "MONTO" ? "" : ` (${cotizacion.descuentoPct} %)`;
  return { descuento, etiqueta: `Descuento de la cotización #${cotizacion.numero}${detalle}` };
}
