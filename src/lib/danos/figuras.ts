import type { TipoDanio, ZonaVehiculo } from "@/generated/prisma-tenant";

/**
 * Silueta del diagrama de daños (Fase 21, D2; redibujada para que se entienda):
 * cada figura ofrece sus zonas como cajas sobre su propio lienzo, así que la
 * zona que se marca es un dato y no un dibujo libre. Las cajas son la verdad
 * (los tests comprueban que no se pisen ni se salgan); el trazo con esquinas
 * redondeadas se calcula de ellas. La silueta (dibujada a mano por trazos con
 * tipo: carrocería, vidrios, llantas…) y la orientación son decorado: no se
 * tocan, solo ayudan a ubicarse. Módulo puro: el componente pinta lo de aquí.
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

export type TipoTrazo = "carroceria" | "vidrio" | "llanta" | "rin" | "espejo" | "linea" | "farola" | "stop";

/** Un trazo del dibujo: el componente decide el color según su tipo. */
export interface Trazo {
  d: string;
  tipo: TipoTrazo;
}

export interface Figura {
  titulo: string;
  lienzo: { ancho: number; alto: number };
  zonas: ZonaFigura[];
  /** Dibujo decorativo (carrocería, vidrios, llantas) bajo las zonas: no se toca ni se lee. */
  silueta: Trazo[];
  orientacion: RotuloOrientacion[];
  /**
   * Daños viejos cuya zona ya no está en esta figura (el carro marcaba «Lateral»
   * antes de separar los guardabarros): dónde va su número, fuera del dibujo, y qué aclarar.
   */
  fueraDelDibujo?: Partial<Record<ZonaVehiculo, { x: number; y: number; aviso: string }>>;
}

const t = (tipo: TipoTrazo, d: string): Trazo => ({ d, tipo });

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
 * atrás, parachoques, capó, parabrisas, techo y baúl; a cada lado, los
 * guardabarros delantero y trasero (cada uno su zona) antes y después de la
 * puerta; afuera, espejos y llantas. Los daños viejos marcados como
 * `LATERAL_*` en un carro se listan con su número fuera del dibujo y un aviso.
 */
const AVISO_LATERAL = "Marcado antes de separar los guardabarros: no dice si es delantero o trasero.";

const CARRO: Figura = {
  titulo: "Carro (visto desde arriba)",
  lienzo: { ancho: 260, alto: 440 },
  silueta: [
    t("llanta", contorno(28, 70, 18, 58, 6)),
    t("llanta", contorno(214, 70, 18, 58, 6)),
    t("llanta", contorno(28, 306, 18, 60, 6)),
    t("llanta", contorno(214, 306, 18, 60, 6)),
    t(
      "carroceria",
      "M 130 26 C 178 26 212 40 214 82 L 216 150 C 217 170 212 180 212 200 L 212 300 C 212 320 217 330 216 350 L 214 384 C 212 410 182 416 130 416 C 78 416 48 410 46 384 L 44 350 C 43 330 48 320 48 300 L 48 200 C 48 180 43 170 44 150 L 46 82 C 48 40 82 26 130 26 Z",
    ),
    t("linea", "M 92 50 Q 130 42 168 50"),
    t("linea", "M 100 66 L 100 128 M 160 66 L 160 128"),
    t("vidrio", "M 76 138 Q 130 126 184 138 L 172 172 Q 130 166 88 172 Z"),
    t("vidrio", contorno(90, 178, 80, 112, 10)),
    t("vidrio", "M 88 296 Q 130 302 172 296 L 180 322 Q 130 332 80 322 Z"),
    t("linea", "M 50 210 L 86 210 M 174 210 L 210 210"),
    t("espejo", "M 44 146 C 30 144 22 148 22 154 C 22 158 32 160 44 158 Z"),
    t("espejo", "M 216 146 C 230 144 238 148 238 154 C 238 158 228 160 216 158 Z"),
    t("farola", "M 60 40 Q 70 32 84 30 M 200 40 Q 190 32 176 30"),
    t("stop", "M 60 404 Q 70 412 86 413 M 200 404 Q 190 412 174 413"),
  ],
  orientacion: [
    { texto: "▲ Adelante", x: 130, y: 15, ancla: "middle" },
    { texto: "Atrás", x: 130, y: 433, ancla: "middle" },
    { texto: "Izq.", x: 4, y: 230, ancla: "start" },
    { texto: "Der.", x: 256, y: 230, ancla: "end" },
  ],
  fueraDelDibujo: {
    LATERAL_IZQUIERDO: { x: 14, y: 262, aviso: AVISO_LATERAL },
    LATERAL_DERECHO: { x: 246, y: 262, aviso: AVISO_LATERAL },
  },
  zonas: [
    zona("FRENTE", "Frente", [[84, 28, 92, 18]], { rotulo: "Frente", detalle: "parachoques delantero" }),
    zona("CAPO", "Capó", [[84, 48, 92, 84]], { rotulo: "Capó" }),
    zona("PARABRISAS", "Parabrisas", [[88, 134, 84, 36]], { rotulo: "Parabrisas" }),
    zona("TECHO", "Techo", [[88, 172, 84, 120]], { rotulo: "Techo" }),
    zona("COMPUERTA", "Baúl", [[84, 294, 92, 112]], { rotulo: "Baúl", detalle: "vidrio y parachoques trasero" }),
    zona("PUERTA_IZQUIERDA", "Puerta izquierda", [[48, 136, 36, 152]], { rotulo: "Puerta" }),
    zona("PUERTA_DERECHA", "Puerta derecha", [[176, 136, 36, 152]], { rotulo: "Puerta" }),
    zona("GUARDABARROS_DELANTERO_IZQUIERDO", "Guardabarros delantero izquierdo", [[48, 60, 36, 74]]),
    zona("GUARDABARROS_TRASERO_IZQUIERDO", "Guardabarros trasero izquierdo", [[48, 290, 36, 100]]),
    zona("GUARDABARROS_DELANTERO_DERECHO", "Guardabarros delantero derecho", [[176, 60, 36, 74]]),
    zona("GUARDABARROS_TRASERO_DERECHO", "Guardabarros trasero derecho", [[176, 290, 36, 100]]),
    zona("ESPEJO_IZQUIERDO", "Espejo izquierdo", [[16, 140, 30, 22]]),
    zona("ESPEJO_DERECHO", "Espejo derecho", [[214, 140, 30, 22]]),
    zona("RINES", "Rines", [
      [26, 70, 20, 58],
      [214, 70, 20, 58],
      [26, 306, 20, 60],
      [214, 306, 20, 60],
    ], { detalle: "las cuatro llantas" }),
  ],
};

/** Moto de lado, mirando hacia la izquierda. */
const MOTO: Figura = {
  titulo: "Moto (vista de lado)",
  lienzo: { ancho: 320, alto: 200 },
  silueta: [
    t("llanta", circulo(52, 144, 30)),
    t("llanta", circulo(236, 144, 30)),
    t("rin", circulo(52, 144, 13)),
    t("rin", circulo(236, 144, 13)),
    t("linea", "M 52 144 L 80 40 M 64 34 L 120 34 M 200 110 L 236 144"),
    t(
      "carroceria",
      "M 92 80 C 92 52 110 42 140 42 L 170 44 L 232 46 C 248 48 258 56 258 66 L 252 84 L 230 102 L 120 104 C 104 104 92 96 92 80 Z",
    ),
    t("linea", "M 120 104 L 120 128 L 200 128 M 170 118 L 262 112"),
    t("farola", "M 30 72 L 30 100"),
    t("stop", "M 256 62 L 256 72"),
  ],
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

/** Punto de color de cada tipo de daño (chips y tarjetas). */
export const COLOR_DANIO: Record<TipoDanio, string> = {
  GOLPE: "var(--destructive)",
  RAYON: "oklch(0.7 0.15 60)",
  ROTURA: "oklch(0.5 0.2 300)",
  FALTANTE: "oklch(0.44 0.12 250)",
  OXIDO: "oklch(0.5 0.1 50)",
};

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
