import type { EstadoOrden } from "@/generated/prisma-tenant";

/** Las pestañas de la ficha de la orden (su valor en `?tab=`). */
export type PestanaOrden = "recepcion" | "trabajo" | "inspeccion" | "entrega";

export const PESTANAS_ORDEN: readonly PestanaOrden[] = ["recepcion", "trabajo", "inspeccion", "entrega"];

const POR_ESTADO: Record<EstadoOrden, PestanaOrden> = {
  BORRADOR: "recepcion",
  EN_PROCESO: "trabajo",
  TERMINADA: "entrega",
  ENTREGADA: "entrega",
  ANULADA: "trabajo",
};

/**
 * Dónde abre la ficha: donde está el trabajo según el momento de la orden, salvo
 * que la URL pida otra pestaña válida (un enlace «Ir a la entrega», por ejemplo).
 */
export function pestanaInicial(estado: EstadoOrden, pedida?: string | null): PestanaOrden {
  return PESTANAS_ORDEN.find((pestana) => pestana === pedida) ?? POR_ESTADO[estado];
}

export type TonoResumen = "rojo" | "ambar" | "verde" | "azul" | "gris";

/** Color del punto de cada resumen (mismos tonos que el resto de la ficha). */
export const COLOR_TONO: Record<TonoResumen, string> = {
  rojo: "oklch(0.5 0.2 27)",
  ambar: "oklch(0.55 0.15 60)",
  verde: "oklch(0.4 0.1 150)",
  azul: "oklch(0.44 0.12 250)",
  gris: "oklch(0.7 0 0)",
};

/** «4 de 8 revisados · 2 críticos · 1 atención»: lo crítico manda en el color. */
export function resumenInspeccion(valores: string[], total: number): { texto: string; tono: TonoResumen } {
  const criticos = valores.filter((valor) => valor === "CRITICO").length;
  const atencion = valores.filter((valor) => valor === "ATENCION").length;
  const partes = [`${valores.length} de ${total} revisados`];
  if (criticos > 0) partes.push(`${criticos} ${criticos === 1 ? "crítico" : "críticos"}`);
  if (atencion > 0) partes.push(`${atencion} atención`);
  const tono: TonoResumen = criticos > 0 ? "rojo" : atencion > 0 ? "ambar" : valores.length > 0 ? "verde" : "gris";
  return { texto: partes.join(" · "), tono };
}

/** En qué va el acta de entrega. */
export function resumenEntrega(estado: EstadoOrden, actaFirmada: boolean): { texto: string; tono: TonoResumen } {
  if (estado === "ENTREGADA") return { texto: "Entregada", tono: "verde" };
  if (actaFirmada) return { texto: "Firmada", tono: "verde" };
  if (estado === "TERMINADA") return { texto: "Lista para firmar", tono: "azul" };
  return { texto: "Pendiente", tono: "gris" };
}
