import type { EstadoOrden } from "@/generated/prisma-tenant";

/** Las secciones plegables de la ficha de la orden (su `id` en la página). */
export type SeccionOrden = "informacion" | "recepcion" | "items" | "mano-obra" | "dvi" | "entrega" | "anticipos";

/**
 * Qué secciones de la ficha van abiertas según el momento de la orden: mientras
 * se arma, todo lo de trabajo y el acta plegada (se usa al entregar y antes
 * confundía); al terminar, el acta pasa al frente y lo de trabajo queda para
 * consulta. Cualquiera se puede abrir o cerrar a mano.
 */
export function seccionesAbiertas(estado: EstadoOrden): ReadonlySet<SeccionOrden> {
  switch (estado) {
    case "BORRADOR":
    case "EN_PROCESO":
      return new Set(["informacion", "recepcion", "items", "mano-obra", "dvi", "anticipos"]);
    case "TERMINADA":
      return new Set(["informacion", "entrega", "anticipos"]);
    case "ENTREGADA":
      return new Set(["entrega"]);
    case "ANULADA":
      return new Set(["informacion"]);
  }
}
