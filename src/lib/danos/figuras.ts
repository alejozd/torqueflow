import type { TipoDanio, ZonaVehiculo } from "@/generated/prisma-tenant";

/**
 * Silueta del diagrama de daños (Fase 21, D2): cada figura ofrece sus zonas como
 * `path` de SVG sobre un lienzo fijo, así que la zona que se marca es un dato y
 * no un dibujo libre. Es un módulo puro: el componente solo pinta lo que hay
 * aquí, y los tests comprueban que no haya zonas muertas ni solapadas.
 */

export type TipoFigura = "CARRO" | "MOTO";

export const LIENZO = { ancho: 320, alto: 200 };

export interface ZonaFigura {
  zona: ZonaVehiculo;
  etiqueta: string;
  /** `d` del `<path>` sobre el lienzo de `LIENZO`. */
  d: string;
}

type Caja = [x: number, y: number, ancho: number, alto: number];

/** Rectángulo como `path` cerrado: una zona siempre es una figura rellenable. */
function rect(...[x, y, ancho, alto]: Caja): string {
  return `M ${x} ${y} H ${x + ancho} V ${y + alto} H ${x} Z`;
}

/** Varias cajas en un solo `path` (los cuatro rines son una única zona). */
function cajas(...cajas: Caja[]): string {
  return cajas.map((caja) => rect(...caja)).join(" ");
}

/** Vista superior: el frente del carro mira hacia arriba. */
const CARRO: ZonaFigura[] = [
  { zona: "FRENTE", etiqueta: "Frente", d: rect(110, 8, 100, 14) },
  { zona: "ESPEJO_IZQUIERDO", etiqueta: "Espejo izquierdo", d: rect(56, 62, 16, 10) },
  { zona: "ESPEJO_DERECHO", etiqueta: "Espejo derecho", d: rect(248, 62, 16, 10) },
  { zona: "CAPO", etiqueta: "Capó", d: rect(110, 22, 100, 36) },
  { zona: "PUERTA_IZQUIERDA", etiqueta: "Puerta izquierda", d: rect(74, 58, 34, 66) },
  { zona: "PUERTA_DERECHA", etiqueta: "Puerta derecha", d: rect(212, 58, 34, 66) },
  { zona: "LATERAL_IZQUIERDO", etiqueta: "Lateral izquierdo", d: rect(22, 40, 16, 90) },
  { zona: "LATERAL_DERECHO", etiqueta: "Lateral derecho", d: rect(282, 40, 16, 90) },
  { zona: "PARABRISAS", etiqueta: "Parabrisas", d: rect(110, 58, 100, 12) },
  { zona: "TECHO", etiqueta: "Techo", d: rect(110, 70, 100, 54) },
  { zona: "COMPUERTA", etiqueta: "Compuerta", d: rect(110, 124, 100, 30) },
  {
    zona: "RINES",
    etiqueta: "Rines",
    d: cajas([74, 26, 34, 26], [212, 26, 34, 26], [74, 130, 34, 26], [212, 130, 34, 26]),
  },
];

/** Vista lateral: la moto mira hacia la izquierda. */
const MOTO: ZonaFigura[] = [
  { zona: "FRENTE", etiqueta: "Frente", d: rect(24, 60, 30, 62) },
  { zona: "MANUBRIO", etiqueta: "Manubrio", d: rect(58, 28, 62, 14) },
  { zona: "ESPEJO_IZQUIERDO", etiqueta: "Espejo izquierdo", d: rect(104, 10, 18, 12) },
  { zona: "ESPEJO_DERECHO", etiqueta: "Espejo derecho", d: rect(128, 10, 18, 12) },
  { zona: "TANQUE", etiqueta: "Tanque", d: rect(96, 44, 72, 34) },
  { zona: "ASIENTO", etiqueta: "Asiento", d: rect(168, 44, 62, 24) },
  { zona: "LATERAL_IZQUIERDO", etiqueta: "Lateral izquierdo", d: rect(96, 80, 134, 22) },
  { zona: "LATERAL_DERECHO", etiqueta: "Lateral derecho", d: rect(230, 60, 18, 42) },
  {
    zona: "RINES",
    etiqueta: "Rines",
    d: cajas([30, 122, 44, 44], [214, 122, 44, 44]),
  },
];

export const FIGURAS: Record<TipoFigura, { titulo: string; zonas: ZonaFigura[] }> = {
  CARRO: { titulo: "Carro", zonas: CARRO },
  MOTO: { titulo: "Moto", zonas: MOTO },
};

/** Moto solo para las motos; camioneta y camión se marcan sobre la figura del carro. */
export function figuraDe(tipoVehiculo: string): TipoFigura {
  return tipoVehiculo === "MOTO" ? "MOTO" : "CARRO";
}

export function zonasDe(tipoVehiculo: string): ZonaFigura[] {
  return FIGURAS[figuraDe(tipoVehiculo)].zonas;
}

/** Etiquetas en español, compartidas por la orden y el acta impresa. */
export const ETIQUETA_DANIO: Record<TipoDanio, string> = {
  GOLPE: "Golpe",
  RAYON: "Rayón",
  ROTURA: "Rotura",
  FALTANTE: "Faltante",
  OXIDO: "Óxido",
};

export function etiquetaZona(zona: ZonaVehiculo): string {
  if (zona === "OTRO") return "Otra zona";
  for (const figura of Object.values(FIGURAS)) {
    const encontrada = figura.zonas.find((candidata) => candidata.zona === zona);
    if (encontrada) return encontrada.etiqueta;
  }
  return zona;
}
