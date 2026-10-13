import type { PrioridadOrden } from "@/generated/prisma-tenant";

/**
 * Tono de la prioridad (Fase 22), compartido por el listado, la ficha y el
 * tablero: urgente avisa, alta avisa menos, normal y baja no compiten con el
 * color del estado.
 */
export const PRIORIDAD_BADGE_CLASSNAME: Record<PrioridadOrden, string> = {
  BAJA: "",
  NORMAL: "",
  ALTA: "border-transparent bg-[oklch(0.7_0.15_60/0.15)] text-[oklch(0.55_0.15_60)]",
  URGENTE: "border-transparent bg-destructive/10 text-destructive",
};
