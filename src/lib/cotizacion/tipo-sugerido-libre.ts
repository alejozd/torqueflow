/**
 * Tipo que el buscador ofrece primero para un concepto que no está en el
 * catálogo. Con Enter se elige la primera opción, así que si el texto dice
 * "mano de obra" (o describe un trabajo) y salía primero "repuesto", el
 * concepto quedaba mal clasificado y el resumen mostraba la mano de obra en $0.
 */
const PATRONES_MANO_OBRA: RegExp[] = [
  /\bmano\s+de\s+obra\b/,
  /^m\.?\s?o\b\.?/,
  /\b(servicio|revision|diagnostico|alineacion|balanceo|instalacion|montaje|desmontaje|reparacion|sincronizacion|escaneo|lavado|limpieza|ajuste|calibracion|torneado|rectificado|soldadura|pintura|latoneria)\b/,
];

export function tipoSugeridoLibre(texto: string): "REPUESTO" | "MANO_OBRA" {
  const normal = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return PATRONES_MANO_OBRA.some((patron) => patron.test(normal)) ? "MANO_OBRA" : "REPUESTO";
}
