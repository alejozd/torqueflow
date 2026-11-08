import { roundMoney } from "@/lib/money/round";
import { IVA_PREDETERMINADO_RESPALDO, textoPorcentaje } from "./tarifas";

/** Lo que paga de IVA cada tarifa usada en un documento. */
export interface TramoIva {
  ivaPct: number;
  /** Base gravable de la tarifa, ya con su parte del descuento. */
  base: number;
  iva: number;
}

export interface DesgloseIva {
  tramos: TramoIva[];
  iva: number;
}

/**
 * Agrupa las líneas por tarifa y reparte el descuento global entre las bases
 * en proporción a su peso; cada base paga su IVA. La última tarifa se queda
 * con el residuo del redondeo, así la suma de las bases es exactamente
 * `subtotal − descuento` (con una sola tarifa da lo mismo que el cálculo de antes).
 *
 * Los tramos salen de la tarifa más alta a la más baja; los que quedan sin
 * base no aparecen.
 */
export function desglosarIva(
  lineas: { importe: number; ivaPct?: number }[],
  descuento: number,
): DesgloseIva {
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
  const baseTotal = roundMoney(subtotal - descuentoReal);

  const tramos: TramoIva[] = [];
  let repartida = 0;
  ordenadas.forEach((t, i) => {
    const base =
      i === ordenadas.length - 1
        ? roundMoney(baseTotal - repartida)
        : roundMoney(t.bruta - (subtotal > 0 ? (descuentoReal * t.bruta) / subtotal : 0));
    repartida = roundMoney(repartida + base);
    if (base > 0) tramos.push({ ivaPct: t.ivaPct, base, iva: roundMoney((base * t.ivaPct) / 100) });
  });

  return { tramos, iva: roundMoney(tramos.reduce((suma, t) => suma + t.iva, 0)) };
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
