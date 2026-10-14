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

/** Color propio de cada nivel: el punto del chip, la franja y el ícono de la ficha. */
export const PRIORIDAD_COLOR: Record<PrioridadOrden, string> = {
  BAJA: "oklch(0.62 0.02 250)",
  NORMAL: "oklch(0.55 0.12 250)",
  ALTA: "oklch(0.7 0.15 60)",
  URGENTE: "var(--destructive)",
};

/** Qué significa cada nivel, en lenguaje sencillo, para la tarjeta de la ficha. */
export const PRIORIDAD_DESCRIPCION: Record<PrioridadOrden, string> = {
  BAJA: "Puede esperar: se atiende cuando haya espacio.",
  NORMAL: "Va en su turno, sin afán.",
  ALTA: "Pasa adelante de las normales.",
  URGENTE: "Se atiende primero que todo.",
};
