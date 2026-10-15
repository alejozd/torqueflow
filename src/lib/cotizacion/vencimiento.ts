import { inicioDiaBogota } from "@/lib/fecha-bogota";

const DIA_MS = 24 * 60 * 60 * 1000;

export interface AvisoVencimiento {
  texto: string;
  /** "aviso" a 3 días o menos (y el mismo día), "vencida" si ya pasó. */
  tono: "normal" | "aviso" | "vencida";
}

/** Días calendario de Bogotá entre hoy y la fecha de vigencia: "Vence en 6 días", "Vence hoy", "Venció hace 2 días". */
export function avisoVencimiento(validaHasta: Date, ahora: Date): AvisoVencimiento {
  const dias = Math.round((inicioDiaBogota(validaHasta).getTime() - inicioDiaBogota(ahora).getTime()) / DIA_MS);
  if (dias < 0) {
    return { texto: dias === -1 ? "Venció ayer" : `Venció hace ${-dias} días`, tono: "vencida" };
  }
  if (dias === 0) return { texto: "Vence hoy", tono: "aviso" };
  if (dias === 1) return { texto: "Vence mañana", tono: "aviso" };
  return { texto: `Vence en ${dias} días`, tono: dias <= 3 ? "aviso" : "normal" };
}
