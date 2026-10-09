/**
 * Clientes and vehículos can only be deleted while they have no history
 * (product decision, 2026-10-09): once an orden, factura, cita, cotización or
 * historial entry points at them, they stay. This turns the related-record
 * counts into the human-readable reason shown when a delete is refused.
 */

export interface ConteoHistorial {
  ordenes?: number;
  facturas?: number;
  citas?: number;
  cotizaciones?: number;
  historial?: number;
}

const ETIQUETAS: Record<keyof ConteoHistorial, [singular: string, plural: string]> = {
  ordenes: ["orden", "órdenes"],
  facturas: ["factura", "facturas"],
  citas: ["cita", "citas"],
  cotizaciones: ["cotización", "cotizaciones"],
  historial: ["registro en el historial", "registros en el historial"],
};

/** Adds up several counts (e.g. a cliente's own plus each of its vehículos'). */
export function sumarConteos(conteos: ConteoHistorial[]): ConteoHistorial {
  const total: ConteoHistorial = {};
  for (const conteo of conteos) {
    for (const clave of Object.keys(ETIQUETAS) as (keyof ConteoHistorial)[]) {
      total[clave] = (total[clave] ?? 0) + (conteo[clave] ?? 0);
    }
  }
  return total;
}

/** "2 órdenes, 1 cita" -- or null when there is nothing, i.e. the record can be deleted. */
export function describirHistorial(conteo: ConteoHistorial): string | null {
  const partes = (Object.keys(ETIQUETAS) as (keyof ConteoHistorial)[])
    .filter((clave) => (conteo[clave] ?? 0) > 0)
    .map((clave) => {
      const cantidad = conteo[clave]!;
      const [singular, plural] = ETIQUETAS[clave];
      return `${cantidad} ${cantidad === 1 ? singular : plural}`;
    });
  return partes.length > 0 ? partes.join(", ") : null;
}
