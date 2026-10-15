export type EstadoDisponibilidad = "alcanza" | "parcial" | "agotado";

/**
 * Semáforo de existencias de un repuesto cotizado: verde si la bodega cubre la
 * cantidad, ámbar si hay algo pero no todo, rojo si no hay nada. Solo informa
 * a quien cotiza; no bloquea ni sale en la impresión.
 */
export function estadoDisponibilidad(stockActual: number, cantidad: number): EstadoDisponibilidad {
  if (stockActual <= 0) return "agotado";
  if (stockActual < cantidad) return "parcial";
  return "alcanza";
}
