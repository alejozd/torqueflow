/**
 * Cómo se lee la cobertura de una garantía (Fase 21, D3). Vive aparte porque la
 * usan la orden, el acta impresa y la ficha del vehículo.
 */

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

export interface CoberturaVista {
  cubreHasta: Date | null;
  cubreHastaKm: number | null;
}

export function coberturaDe(garantia: CoberturaVista): string {
  const partes = [
    garantia.cubreHasta ? `hasta el ${formatoFecha.format(garantia.cubreHasta)}` : null,
    garantia.cubreHastaKm !== null ? `hasta ${garantia.cubreHastaKm.toLocaleString("es-CO")} km` : null,
  ].filter((parte): parte is string => parte !== null);

  return partes.length > 0 ? partes.join(" o ") : "Sin cobertura (informativa)";
}
