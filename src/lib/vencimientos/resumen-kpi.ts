import type { EstadoVencimiento } from "./estado-vencimiento";

/**
 * Lo que dice la tarjeta "Vencimientos" del Inicio. Siempre lleva subtítulo:
 * con un 0 a secas no se entendía qué medía (SOAT y tecnomecánica vencidos o
 * dentro del aviso configurado).
 */
export function resumenKpiVencimientos(filas: readonly { estado: EstadoVencimiento }[]): {
  total: number;
  subtitulo: string;
} {
  if (filas.length === 0) return { total: 0, subtitulo: "SOAT y tecnomecánica al día" };
  const vencidos = filas.filter((fila) => fila.estado === "VENCIDO").length;
  const porVencer = filas.length - vencidos;
  const partes = [
    vencidos > 0 ? `${vencidos} ${vencidos === 1 ? "vencido" : "vencidos"}` : null,
    porVencer > 0 ? `${porVencer} por vencer` : null,
  ].filter((parte): parte is string => parte !== null);
  return { total: filas.length, subtitulo: partes.join(" · ") };
}
