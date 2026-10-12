import { roundMoney } from "@/lib/money/round";

/**
 * Cálculo puro de una liquidación: cuánto se le paga a un técnico por lo que
 * produjo en el periodo, según su esquema (D4), más el ajuste manual (D11).
 *
 * La base es siempre la mano de obra producida (D2), nunca el total facturado:
 * ni los repuestos ni el IVA entran en el porcentaje.
 */

export type TipoEsquema = "PORCENTAJE" | "FIJO" | "MIXTO";

export interface EsquemaAplicable {
  tipo: TipoEsquema;
  porcentaje: number | null;
  montoFijo: number | null;
}

export function calcularMontoLiquidacion(esquema: EsquemaAplicable, montoManoObra: number): number {
  const porcionVariable =
    esquema.tipo === "FIJO" ? 0 : roundMoney((montoManoObra * (esquema.porcentaje ?? 0)) / 100);
  const porcionFija = esquema.tipo === "PORCENTAJE" ? 0 : (esquema.montoFijo ?? 0);
  return roundMoney(porcionFija + porcionVariable);
}

export function totalLiquidacion(montoCalculado: number, ajuste: number): number {
  return roundMoney(montoCalculado + ajuste);
}

export interface ProduccionDelPeriodo {
  ordenes: number;
  trabajos: number;
  montoManoObra: number;
}

/**
 * Lo que el documento congeló, con el monto que se calculó con el esquema de
 * entonces (D10): si el taller produjo más trabajo o cambió el esquema, el
 * monto calculado ahora ya no coincide y hay que avisar antes de pagar.
 */
export interface LiquidacionCongelada extends ProduccionDelPeriodo {
  montoCalculado: number;
}

export function hayCambiosSinReflejar(documento: LiquidacionCongelada, vivo: LiquidacionCongelada): boolean {
  return (
    documento.ordenes !== vivo.ordenes ||
    documento.trabajos !== vivo.trabajos ||
    documento.montoManoObra !== vivo.montoManoObra ||
    documento.montoCalculado !== vivo.montoCalculado
  );
}

/** Promedio de mano de obra por trabajo; null cuando todavía no hay trabajos. */
export function montoPorTrabajo(montoManoObra: number, trabajos: number): number | null {
  if (trabajos <= 0) return null;
  return roundMoney(montoManoObra / trabajos);
}
