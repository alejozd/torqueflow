import { roundMoney } from "@/lib/money/round";

/** `precioCompra` is null for a free-text ItemOrden with no catalog Repuesto behind it. */
export interface RentabilidadItem {
  cantidad: number;
  precioCompra: number | null;
}

export interface RentabilidadManoDeObra {
  valor: number;
}

export interface RentabilidadFactura {
  /** Factura.total (IVA-inclusive) -- reported as "Total facturado", NOT used for margin. */
  total: number;
  /** Factura.subtotal - Factura.descuento (IVA-exclusive) -- used for margen/margenPorcentaje. */
  base: number;
  items: RentabilidadItem[];
  manoDeObra: RentabilidadManoDeObra[];
}

export interface RentabilidadTotales {
  facturasCount: number;
  /** Sum of Factura.total — already net of descuento and inclusive of IVA. */
  totalFacturado: number;
  costoRepuestos: number;
  margen: number;
  margenPorcentaje: number;
  manoDeObraFacturada: number;
}

export function computeRentabilidad(facturas: RentabilidadFactura[]): RentabilidadTotales {
  let facturado = 0;
  let baseFacturado = 0;
  let costo = 0;
  let manoDeObra = 0;

  for (const factura of facturas) {
    facturado += factura.total;
    baseFacturado += factura.base;
    for (const item of factura.items) {
      if (item.precioCompra !== null) {
        costo += item.cantidad * item.precioCompra;
      }
    }
    for (const linea of factura.manoDeObra) {
      manoDeObra += linea.valor;
    }
  }

  const totalFacturado = roundMoney(facturado);
  const baseTotal = roundMoney(baseFacturado);
  const costoRepuestos = roundMoney(costo);
  const margen = roundMoney(baseTotal - costoRepuestos);

  return {
    facturasCount: facturas.length,
    totalFacturado,
    costoRepuestos,
    margen,
    margenPorcentaje: baseTotal === 0 ? 0 : roundMoney((margen / baseTotal) * 100),
    manoDeObraFacturada: roundMoney(manoDeObra),
  };
}
