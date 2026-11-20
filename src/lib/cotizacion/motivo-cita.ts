import type { BloqueConceptos } from "@/lib/conceptos/conceptos";

const MAX_NOMBRES = 3;

/**
 * El motivo con que se prellena la cita que sale de una cotización:
 * "Cotización #46: Cambio de aceite, Amortiguador delantero y 2 más". Un kit
 * cuenta como un solo trabajo, con su nombre.
 */
export function motivoCitaDesdeCotizacion(numero: number, bloques: BloqueConceptos[]): string {
  const nombres = bloques.map((bloque) => (bloque.clase === "kit" ? bloque.nombre : bloque.concepto.descripcion));
  if (nombres.length === 0) return `Cotización #${numero}`;
  const visibles = nombres.slice(0, MAX_NOMBRES).join(", ");
  const resto = nombres.length - MAX_NOMBRES;
  return `Cotización #${numero}: ${visibles}${resto > 0 ? ` y ${resto} más` : ""}`;
}
