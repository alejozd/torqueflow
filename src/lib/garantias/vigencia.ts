import { formatoDiaBogota } from "@/lib/fecha-bogota";

/**
 * Vigencia de una garantía (Fase 21, D3): el taller registra una cobertura por
 * fecha y/o por kilometraje, y aquí se decide si sigue vigente. Es lógica pura
 * porque la usan la ficha del vehículo y los tests, sin base de datos.
 *
 * Regla: **vence lo primero que llega**. Sin ninguna cobertura la garantía es
 * informativa (no se puede decir que esté vencida).
 */

export type EstadoGarantia = "VIGENTE" | "VENCIDA" | "SIN_COBERTURA";

export const ETIQUETA_VIGENCIA: Record<EstadoGarantia, string> = {
  VIGENTE: "Vigente",
  VENCIDA: "Vencida",
  SIN_COBERTURA: "Informativa",
};

export interface CoberturaGarantia {
  cubreHasta: Date | null;
  cubreHastaKm: number | null;
}

export interface ContextoGarantia {
  hoy: Date;
  /** Kilometraje actual del vehículo; sin dato, la cobertura por km no se evalúa. */
  kilometraje: number | null;
}

export function estadoGarantia(cobertura: CoberturaGarantia, contexto: ContextoGarantia): EstadoGarantia {
  if (!cobertura.cubreHasta && cobertura.cubreHastaKm === null) return "SIN_COBERTURA";

  if (cobertura.cubreHasta) {
    // Se compara por día: vence al terminar la fecha indicada, así que el mismo
    // día sigue vigente.
    const limite = Date.UTC(
      cobertura.cubreHasta.getUTCFullYear(),
      cobertura.cubreHasta.getUTCMonth(),
      cobertura.cubreHasta.getUTCDate(),
    );
    // Hoy es el día de Bogotá, llevado a la misma convención que `cubreHasta`
    // (@db.Date = medianoche UTC). Con el día UTC, desde las 7 p. m. una
    // garantía que vence hoy salía vencida.
    const hoy = Date.parse(`${formatoDiaBogota.format(contexto.hoy)}T00:00:00.000Z`);
    if (hoy > limite) return "VENCIDA";
  }

  if (cobertura.cubreHastaKm !== null && contexto.kilometraje !== null && contexto.kilometraje > cobertura.cubreHastaKm) {
    return "VENCIDA";
  }

  return "VIGENTE";
}
