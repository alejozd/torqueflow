import type { EstadoOrden } from "@/generated/prisma-tenant";
import { ESTADO_ORDEN_TRANSITIONS } from "@/lib/orden/estado-transitions";

/**
 * Etiqueta y tono de cada estado (Fase 22), compartidos por el listado, la ficha
 * y el tablero. Antes vivían dentro de `ordenes/page.tsx`; el tablero los
 * necesita al pasar a ser un componente cliente.
 */
export const ESTADO_LABELS: Record<EstadoOrden, string> = {
  BORRADOR: "Borrador",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  ANULADA: "Anulada",
};

// Draft -> in progress (amber, active work) -> finished (blue, ready) ->
// delivered (green, done) -> cancelled (red). Badge's own variants only cover
// default/secondary/destructive/outline, so the amber/blue/green states use
// the same bg-X/10 + text-X className mechanism the destructive variant uses.
export const ESTADO_BADGE_CLASSNAME: Record<EstadoOrden, string> = {
  BORRADOR: "",
  EN_PROCESO: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  TERMINADA: "border-transparent bg-[oklch(0.44_0.12_250/0.1)] text-[oklch(0.44_0.12_250)]",
  ENTREGADA: "border-transparent bg-[oklch(0.4_0.1_150/0.1)] text-[oklch(0.4_0.1_150)]",
  ANULADA: "",
};

export const ESTADO_BADGE_VARIANT: Partial<Record<EstadoOrden, "outline" | "destructive">> = {
  BORRADOR: "outline",
  ANULADA: "destructive",
};

export const ESTADO_DOT_COLOR: Record<EstadoOrden, string> = {
  BORRADOR: "oklch(0.7 0 0)",
  EN_PROCESO: "oklch(0.55 0.15 60)",
  TERMINADA: "oklch(0.44 0.12 250)",
  ENTREGADA: "oklch(0.4 0.1 150)",
  ANULADA: "oklch(0.5 0.2 27)",
};

/**
 * Estados a los que el tablero puede mover una orden: las transiciones válidas
 * menos ENTREGADA, que se hace desde el acta de entrega (`entregarOrdenAction`), y
 * menos ANULADA, que es destructiva y pasa por el menú con confirmación.
 */
export function destinosArrastrables(estado: EstadoOrden): EstadoOrden[] {
  return ESTADO_ORDEN_TRANSITIONS[estado].filter((destino) => destino !== "ENTREGADA" && destino !== "ANULADA");
}

/**
 * Estas dos son la razón de que el menú de una orden `TERMINADA` siga
 * apareciendo aunque no tenga destinos de arrastre: su camino es el acta de
 * entrega. Entregar **no** depende de que la orden sea editable: una terminada
 * ya facturada se entrega igual (fase de consolidación, D2).
 */
export function puedeEntregar(estado: EstadoOrden): boolean {
  return ESTADO_ORDEN_TRANSITIONS[estado].includes("ENTREGADA");
}

export function puedeAnular(estado: EstadoOrden, movible: boolean): boolean {
  return movible && ESTADO_ORDEN_TRANSITIONS[estado].includes("ANULADA");
}

/** El menú "Mover a…" se muestra si hay algo que ofrecer. */
export function ofreceMenu(estado: EstadoOrden, movible: boolean): boolean {
  return puedeEntregar(estado) || (movible && (destinosArrastrables(estado).length > 0 || puedeAnular(estado, movible)));
}

/**
 * Anular no se arrastra y siempre pasa por una confirmación en línea, porque
 * deja la orden inmutable. El resto de movimientos del tablero son reversibles
 * a mano y no preguntan.
 */
export function requiereConfirmacion(destino: EstadoOrden): boolean {
  return destino === "ANULADA";
}
