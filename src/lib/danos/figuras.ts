import type { TipoDanio, ZonaVehiculo } from "@/generated/prisma-tenant";

/**
 * Silueta del diagrama de daños (Fase 21, D2; redibujada para que se entienda):
 * cada figura ofrece sus zonas como cajas sobre su propio lienzo, así que la
 * zona que se marca es un dato y no un dibujo libre. Las cajas son la verdad
 * (los tests comprueban que no se pisen ni se salgan); el trazo con esquinas
 * redondeadas se calcula de ellas. La silueta y la orientación son decorado:
 * no se tocan, solo ayudan a ubicarse. Módulo puro: el componente pinta lo de aquí.
 */

export type TipoFigura = "CARRO" | "MOTO";

/** [x, y, ancho, alto] sobre el lienzo de la figura. */
export type Caja = [x: number, y: number, ancho: number, alto: number];

export interface ZonaFigura {
  zona: ZonaVehiculo;
  etiqueta: string;
  cajas: Caja[];
  /** `d` del `<path>`: las cajas con las esquinas redondeadas. */
  d: string;
  /** Nombre corto que se escribe dentro de la zona (solo en las grandes). */
  rotulo?: string;
  /** Aclaración que se ve al pasar el mouse ("parachoques", "guardabarros"). */
  detalle?: string;
}

export interface RotuloOrientacion {
  texto: string;
  x: number;
  y: number;
  ancla: "start" | "middle" | "end";
}

export interface Figura {
  titulo: string;
  lienzo: { ancho: number; alto: number };
  zonas: ZonaFigura[];
  /** Trazos decorativos (carrocería, ruedas) que se pintan debajo de las zonas. */
  silueta: string[];
  orientacion: RotuloOrientacion[];
}

/** Una caja como `path` cerrado con esquinas redondeadas (radio acotado a la caja). */
function trazoCaja([x, y, ancho, alto]: Caja): string {
  const r = Math.min(5, ancho / 2, alto / 2);
  const x2 = x + ancho;
  const y2 = y + alto;
  return [
    `M ${x + r} ${y}`,
    `H ${x2 - r} A ${r} ${r} 0 0 1 ${x2} ${y + r}`,
    `V ${y2 - r} A ${r} ${r} 0 0 1 ${x2 - r} ${y2}`,
    `H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y2 - r}`,
    `V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`,
  ].join(" ");
}

/**
 * La `etiqueta` es el nombre genérico de la zona (la misma en el carro y en la
 * moto: la usan la lista de daños y el acta impresa); el `detalle` aclara qué
 * parte es en esta figura.
 */
function zona(
  zonaVehiculo: ZonaVehiculo,
  etiqueta: string,
  cajas: Caja[],
  extra: { rotulo?: string; detalle?: string } = {},
): ZonaFigura {
  return { zona: zonaVehiculo, etiqueta, cajas, d: cajas.map(trazoCaja).join(" "), ...extra };
}

/** Rectángulo redondeado decorativo (carrocería). */
function contorno(x: number, y: number, ancho: number, alto: number, r: number): string {
  return `M ${x + r} ${y} H ${x + ancho - r} A ${r} ${r} 0 0 1 ${x + ancho} ${y + r} V ${y + alto - r} A ${r} ${r} 0 0 1 ${x + ancho - r} ${y + alto} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + alto - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

/** Círculo decorativo (rueda de la moto). */
function circulo(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

/**
 * Carro visto desde arriba, el frente hacia arriba: en el eje, de adelante hacia
 * atrás, parachoques, capó, parabrisas, techo y compuerta; a cada lado, los
 * guardabarros (laterales) antes y después de la puerta; afuera, espejos y llantas.
 */
const CARRO: Figura = {
  titulo: "Carro (visto desde arriba)",
  lienzo: { ancho: 260, alto: 440 },
  silueta: [contorno(40, 24, 180, 392, 48)],
  orientacion: [
    { texto: "▲ Adelante", x: 130, y: 15, ancla: "middle" },
    { texto: "Atrás", x: 130, y: 433, ancla: "middle" },
    { texto: "Izq.", x: 4, y: 230, ancla: "start" },
    { texto: "Der.", x: 256, y: 230, ancla: "end" },
  ],
  zonas: [
    zona("FRENTE", "Frente", [[84, 28, 92, 18]], { rotulo: "Frente", detalle: "parachoques delantero" }),
    zona("CAPO", "Capó", [[84, 48, 92, 84]], { rotulo: "Capó" }),
    zona("PARABRISAS", "Parabrisas", [[88, 134, 84, 36]], { rotulo: "Parabrisas" }),
    zona("TECHO", "Techo", [[88, 172, 84, 120]], { rotulo: "Techo" }),
    zona("COMPUERTA", "Compuerta", [[84, 294, 92, 112]], { rotulo: "Compuerta", detalle: "maletero, vidrio y parachoques trasero" }),
    zona("PUERTA_IZQUIERDA", "Puerta izquierda", [[44, 136, 38, 152]], { rotulo: "Puerta" }),
    zona("PUERTA_DERECHA", "Puerta derecha", [[178, 136, 38, 152]], { rotulo: "Puerta" }),
    zona(
      "LATERAL_IZQUIERDO",
      "Lateral izquierdo",
      [
        [44, 60, 38, 74],
        [44, 290, 38, 100],
      ],
      { detalle: "guardabarros delantero y trasero" },
    ),
    zona(
      "LATERAL_DERECHO",
      "Lateral derecho",
      [
        [178, 60, 38, 74],
        [178, 290, 38, 100],
      ],
      { detalle: "guardabarros delantero y trasero" },
    ),
    zona("ESPEJO_IZQUIERDO", "Espejo izquierdo", [[14, 140, 26, 16]]),
    zona("ESPEJO_DERECHO", "Espejo derecho", [[220, 140, 26, 16]]),
    zona("RINES", "Rines", [
      [22, 74, 16, 50],
      [222, 74, 16, 50],
      [22, 312, 16, 50],
      [222, 312, 16, 50],
    ], { detalle: "las cuatro llantas" }),
  ],
};

/** Moto de lado, mirando hacia la izquierda. */
const MOTO: Figura = {
  titulo: "Moto (vista de lado)",
  lienzo: { ancho: 320, alto: 200 },
  silueta: [circulo(52, 144, 30), circulo(236, 144, 30)],
  orientacion: [
    { texto: "◀ Adelante", x: 6, y: 14, ancla: "start" },
    { texto: "Atrás ▶", x: 314, y: 14, ancla: "end" },
  ],
  zonas: [
    zona("FRENTE", "Frente", [[24, 60, 30, 56]], { rotulo: "Frente", detalle: "farola y guardabarros" }),
    zona("MANUBRIO", "Manubrio", [[58, 28, 62, 14]], { rotulo: "Manubrio" }),
    zona("ESPEJO_IZQUIERDO", "Espejo izquierdo", [[104, 6, 18, 14]]),
    zona("ESPEJO_DERECHO", "Espejo derecho", [[128, 6, 18, 14]]),
    zona("TANQUE", "Tanque", [[96, 44, 72, 34]], { rotulo: "Tanque" }),
    zona("ASIENTO", "Asiento", [[170, 44, 62, 24]], { rotulo: "Asiento" }),
    zona("LATERAL_IZQUIERDO", "Lateral izquierdo", [[96, 80, 134, 22]], { rotulo: "Lateral izq." }),
    zona("LATERAL_DERECHO", "Lateral derecho", [[234, 60, 22, 42]], { detalle: "cola" }),
    zona(
      "RINES",
      "Rines",
      [
        [30, 122, 44, 44],
        [214, 122, 44, 44],
      ],
      { detalle: "las dos ruedas" },
    ),
  ],
};

export const FIGURAS: Record<TipoFigura, Figura> = { CARRO, MOTO };

/** Moto solo para las motos; camioneta y camión se marcan sobre la figura del carro. */
export function figuraDe(tipoVehiculo: string): TipoFigura {
  return tipoVehiculo === "MOTO" ? "MOTO" : "CARRO";
}

export function zonasDe(tipoVehiculo: string): ZonaFigura[] {
  return FIGURAS[figuraDe(tipoVehiculo)].zonas;
}

/** Centro de la primera caja de la zona: donde van su rótulo y su contador de daños. */
export function centroDe(zonaFigura: ZonaFigura): { x: number; y: number } {
  const [x, y, ancho, alto] = zonaFigura.cajas[0]!;
  return { x: x + ancho / 2, y: y + alto / 2 };
}

/** Etiquetas en español, compartidas por la orden y el acta impresa. */
export const ETIQUETA_DANIO: Record<TipoDanio, string> = {
  GOLPE: "Golpe",
  RAYON: "Rayón",
  ROTURA: "Rotura",
  FALTANTE: "Faltante",
  OXIDO: "Óxido",
};

export function etiquetaZona(zonaVehiculo: ZonaVehiculo): string {
  if (zonaVehiculo === "OTRO") return "Otra zona";
  for (const figura of Object.values(FIGURAS)) {
    const encontrada = figura.zonas.find((candidata) => candidata.zona === zonaVehiculo);
    if (encontrada) return encontrada.etiqueta;
  }
  return zonaVehiculo;
}
