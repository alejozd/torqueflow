/**
 * Lógica del trazo de la firma (Fase 21, D10), aislada del canvas a propósito:
 * jsdom no dibuja ni convierte a PNG, así que lo que se prueba aquí son los
 * puntos (acumular, saber si hay firma, pasarlos a un `path`), y el componente
 * solo pinta.
 */

export interface Punto {
  x: number;
  y: number;
}

export type Trazo = Punto[];

/** Distancia mínima entre puntos guardados: evita miles de puntos repetidos. */
export const DISTANCIA_MINIMA = 1.5;

export function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Deja el punto dentro del canvas (un pointer puede salirse del área). */
export function limitarPunto(punto: Punto, ancho: number, alto: number): Punto {
  return {
    x: Math.min(Math.max(punto.x, 0), ancho),
    y: Math.min(Math.max(punto.y, 0), alto),
  };
}

/** Agrega un punto al trazo actual, ignorando los que están pegados al anterior. */
export function agregarPunto(trazo: Trazo, punto: Punto, distanciaMinima = DISTANCIA_MINIMA): Trazo {
  const ultimo = trazo[trazo.length - 1];
  if (ultimo && distancia(ultimo, punto) < distanciaMinima) return trazo;
  return [...trazo, punto];
}

/** ¿Hay algo dibujado? Un solo punto (un clic suelto) no es una firma. */
export function hayTrazo(trazos: Trazo[]): boolean {
  return trazos.some((trazo) => trazo.length >= 2);
}

/** `d` de un `<path>`: mueve al primer punto y traza líneas al resto. */
export function aPathD(trazo: Trazo): string {
  if (trazo.length === 0) return "";
  const [primero, ...resto] = trazo;
  return `M ${primero!.x} ${primero!.y}${resto.map((punto) => ` L ${punto.x} ${punto.y}`).join("")}`;
}

/** Pinta los trazos sobre un contexto 2D (el componente le pasa el canvas). */
export function pintarTrazos(
  contexto: Pick<CanvasRenderingContext2D, "clearRect" | "beginPath" | "moveTo" | "lineTo" | "stroke">,
  trazos: Trazo[],
  ancho: number,
  alto: number,
): void {
  contexto.clearRect(0, 0, ancho, alto);
  for (const trazo of trazos) {
    // Un punto suelto no dibuja nada.
    if (trazo.length < 2) continue;
    contexto.beginPath();
    contexto.moveTo(trazo[0]!.x, trazo[0]!.y);
    for (const punto of trazo.slice(1)) contexto.lineTo(punto.x, punto.y);
    contexto.stroke();
  }
}
