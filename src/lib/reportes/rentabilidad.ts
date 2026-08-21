import { roundMoney } from "@/lib/money/round";

/** `precioCompra` is null for a free-text ItemOrden with no catalog Repuesto behind it. */
export interface RentabilidadItem {
  cantidad: number;
  precioCompra: number | null;
}

export interface RentabilidadManoDeObra {
  horas: number;
  precioHora: number;
}

export interface RentabilidadFactura {
  total: number;
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
  let costo = 0;
  let manoDeObra = 0;

  for (const factura of facturas) {
    facturado += factura.total;
    for (const item of factura.items) {
      if (item.precioCompra !== null) {
        costo += item.cantidad * item.precioCompra;
      }
    }
    for (const linea of factura.manoDeObra) {
      manoDeObra += linea.horas * linea.precioHora;
    }
  }

  const totalFacturado = roundMoney(facturado);
  const costoRepuestos = roundMoney(costo);
  const margen = roundMoney(totalFacturado - costoRepuestos);

  return {
    facturasCount: facturas.length,
    totalFacturado,
    costoRepuestos,
    margen,
    margenPorcentaje: totalFacturado === 0 ? 0 : roundMoney((margen / totalFacturado) * 100),
    manoDeObraFacturada: roundMoney(manoDeObra),
  };
}
