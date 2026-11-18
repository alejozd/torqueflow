import { roundMoney } from "@/lib/money/round";
import { IVA_PREDETERMINADO_RESPALDO, textoPorcentaje } from "./tarifas";

/** El IVA que va dentro del precio, por cada tarifa usada en un documento. */
export interface TramoIva {
  ivaPct: number;
  /** Base gravable de la tarifa (el precio sin IVA, ya con su parte del descuento). */
  base: number;
  iva: number;
}

export interface DesgloseIva {
  tramos: TramoIva[];
  iva: number;
  /** Suma de las bases (lo que queda sin IVA). */
  base: number;
}

/**
 * Los precios ya traen el IVA incluido. Agrupa las líneas por tarifa, reparte
 * el descuento global entre tarifas en proporción a su peso (la última se queda
 * con el residuo del redondeo, así base + IVA suma exactamente subtotal −
 * descuento) y separa en cada tramo la base y el IVA que lleva dentro.
 *
 * Los tramos salen de la tarifa más alta a la más baja; los que quedan sin
 * valor no aparecen.
 */
export function separarIvaIncluido(lineas: { importe: number; ivaPct?: number }[], descuento: number): DesgloseIva {
  const brutas = new Map<number, number>();
  for (const linea of lineas) {
    const pct = linea.ivaPct ?? IVA_PREDETERMINADO_RESPALDO;
    brutas.set(pct, (brutas.get(pct) ?? 0) + linea.importe);
  }
  const ordenadas = [...brutas.entries()]
    .map(([ivaPct, bruta]) => ({ ivaPct, bruta: roundMoney(bruta) }))
    .filter((t) => t.bruta > 0)
    .sort((a, b) => b.ivaPct - a.ivaPct);

  const subtotal = roundMoney(ordenadas.reduce((suma, t) => suma + t.bruta, 0));
  const descuentoReal = roundMoney(Math.min(Math.max(descuento, 0), subtotal));
  const totalNeto = roundMoney(subtotal - descuentoReal);

  const tramos: TramoIva[] = [];
  let repartido = 0;
  ordenadas.forEach((t, i) => {
    const total =
      i === ordenadas.length - 1
        ? roundMoney(totalNeto - repartido)
        : roundMoney(t.bruta - (subtotal > 0 ? (descuentoReal * t.bruta) / subtotal : 0));
    repartido = roundMoney(repartido + total);
    if (total <= 0) return;
    const base = roundMoney(total / (1 + t.ivaPct / 100));
    tramos.push({ ivaPct: t.ivaPct, base, iva: roundMoney(total - base) });
  });

  return {
    tramos,
    iva: roundMoney(tramos.reduce((suma, t) => suma + t.iva, 0)),
    base: roundMoney(tramos.reduce((suma, t) => suma + t.base, 0)),
  };
}

/** "IVA 19 %" o, al 0 %, "Exento". */
export function etiquetaTramoIva(tramo: Pick<TramoIva, "ivaPct">): string {
  return tramo.ivaPct === 0 ? "Exento" : `IVA ${textoPorcentaje(tramo.ivaPct)}`;
}

/** Lee el desglose guardado en una factura (JSON); lo que no tenga la forma esperada se ignora. */
export function leerDesgloseGuardado(valor: unknown): TramoIva[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((tramo) => {
    if (typeof tramo !== "object" || tramo === null) return [];
    const { ivaPct, base, iva } = tramo as Record<string, unknown>;
    const numeros = [ivaPct, base, iva].map(Number);
    if (numeros.some((n) => !Number.isFinite(n))) return [];
    return [{ ivaPct: numeros[0], base: numeros[1], iva: numeros[2] }];
  });
}
