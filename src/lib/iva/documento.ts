import { ivaSumadoAparte } from "@/lib/cotizacion/totales";
import { separarIvaIncluido, type TramoIva } from "./desglose";
import { textoPorcentaje } from "./tarifas";

/** Una fila del IVA discriminado en un documento para el cliente. */
export interface FilaIvaDocumento {
  etiqueta: string;
  valor: number;
}

export interface IvaDocumento {
  /**
   * Documentos de antes de los precios con IVA incluido: el IVA que se sumó
   * aparte al total. Cuando es mayor que 0, `filas` va vacío.
   */
  ivaAparte: number;
  /** Lo que el total lleva dentro: la base gravable y el IVA de cada tarifa. */
  filas: FilaIvaDocumento[];
}

/**
 * El IVA discriminado que se imprime o se envía al cliente (cotización, acta de
 * la orden). Los precios traen el IVA incluido, así que bajo el total se
 * muestra, por tarifa, la base gravable y el IVA que va dentro; lo exento sale
 * en una sola fila. Con `tramosGuardados` (la factura) se usan esos; si no, se
 * calculan de las líneas con el descuento repartido.
 */
export function ivaDelDocumento({
  subtotal,
  descuento,
  total,
  lineas,
  tramosGuardados,
}: {
  subtotal: number;
  descuento: number;
  total: number;
  lineas: { importe: number; ivaPct?: number }[];
  tramosGuardados?: TramoIva[];
}): IvaDocumento {
  const ivaAparte = ivaSumadoAparte({ subtotal, descuento, total });
  if (ivaAparte > 0) return { ivaAparte, filas: [] };
  const tramos =
    tramosGuardados && tramosGuardados.length > 0 ? tramosGuardados : separarIvaIncluido(lineas, descuento).tramos;
  return {
    ivaAparte: 0,
    // En pesos enteros: la base se redondea y el IVA es el resto, así base + IVA
    // sigue sumando exactamente lo que el cliente paga por esa tarifa.
    filas: tramos.flatMap((tramo) => {
      const conIva = Math.round(tramo.base + tramo.iva);
      const base = Math.round(tramo.base);
      return tramo.ivaPct === 0
        ? [{ etiqueta: "Exento de IVA", valor: conIva }]
        : [
            { etiqueta: `Base gravable ${textoPorcentaje(tramo.ivaPct)}`, valor: base },
            { etiqueta: `IVA ${textoPorcentaje(tramo.ivaPct)}`, valor: conIva - base },
          ];
    }),
  };
}
