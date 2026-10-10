import { roundMoney } from "@/lib/money/round";
import type { RentabilidadTotales } from "@/lib/reportes/rentabilidad";

export interface RentabilidadNeta {
  gastosTotal: number;
  utilidadNeta: number;
  margenNetoPorcentaje: number;
  ticketPromedioBase: number;
  /** Ventas sin IVA necesarias para cubrir los gastos; null si el margen es <= 0. */
  puntoEquilibrioVentas: number | null;
  puntoEquilibrioFacturas: number | null;
  /** base − punto de equilibrio: positivo sobra, negativo falta. */
  diferenciaEquilibrio: number | null;
}

/**
 * El margen bruto no descuenta lo pagado a los mecánicos: eso entra como gasto
 * de Nómina, así que restar los gastos no cuenta nada dos veces. El punto de
 * equilibrio usa margen/base sin redondear para no arrastrar el redondeo del %.
 */
export function computeRentabilidadNeta(totales: RentabilidadTotales, gastosTotal: number): RentabilidadNeta {
  const base = totales.baseFacturada;
  const gastos = roundMoney(gastosTotal);
  const utilidadNeta = roundMoney(totales.margen - gastos);
  const ticketPromedioBase = totales.facturasCount > 0 ? roundMoney(base / totales.facturasCount) : 0;

  const alcanzable = totales.margen > 0 && base > 0;
  const puntoEquilibrioVentas = alcanzable ? roundMoney((gastos * base) / totales.margen) : null;

  return {
    gastosTotal: gastos,
    utilidadNeta,
    margenNetoPorcentaje: base === 0 ? 0 : roundMoney((utilidadNeta / base) * 100),
    ticketPromedioBase,
    puntoEquilibrioVentas,
    puntoEquilibrioFacturas:
      puntoEquilibrioVentas !== null && ticketPromedioBase > 0 ? Math.ceil(puntoEquilibrioVentas / ticketPromedioBase) : null,
    diferenciaEquilibrio: puntoEquilibrioVentas !== null ? roundMoney(base - puntoEquilibrioVentas) : null,
  };
}
