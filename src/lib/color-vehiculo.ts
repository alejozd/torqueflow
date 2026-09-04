/**
 * Infers a chip tone from the vehicle's free-text `color` field ("Rojo",
 * "Gris plata", "Azul oscuro", ...). Users type this in Spanish with no
 * fixed vocabulary, so matching is keyword-based on a normalized (lowercase,
 * accent-stripped) string rather than an exact lookup -- "gris oscuro" and
 * "plateado" both need to land on the same family.
 *
 * Same bg/text technique as every other status chip in the app (e.g.
 * facturas' PAGADA badge): identical oklch literal for both, bg at low alpha
 * for the tint, text opaque. No dark: variant needed -- the alpha tint reads
 * fine against either theme, matching that established convention. Light
 * families (amarillo, beige) break the "same value" rule and use a darker
 * text tone than the bg, since a same-lightness pair would be illegible.
 */

interface ColorTono {
  bg: string;
  text: string;
}

interface ColorFamilia {
  keywords: string[];
  tono: ColorTono;
}

const FAMILIAS: ColorFamilia[] = [
  { keywords: ["negro", "azabache"], tono: { bg: "bg-[oklch(0.2_0_0/0.12)]", text: "text-[oklch(0.2_0_0)]" } },
  {
    keywords: ["blanco", "perla", "marfil"],
    tono: { bg: "bg-[oklch(0.55_0_0/0.12)]", text: "text-[oklch(0.4_0_0)]" },
  },
  {
    keywords: ["gris", "plata", "plateado", "plomo", "grafito"],
    tono: { bg: "bg-[oklch(0.45_0_0/0.12)]", text: "text-[oklch(0.45_0_0)]" },
  },
  {
    keywords: ["vino", "vinotinto", "granate", "borgoña", "borgona"],
    tono: { bg: "bg-[oklch(0.35_0.15_20/0.12)]", text: "text-[oklch(0.35_0.15_20)]" },
  },
  {
    keywords: ["rojo", "carmesi", "carmesí", "cereza"],
    tono: { bg: "bg-[oklch(0.55_0.22_27/0.12)]", text: "text-[oklch(0.55_0.22_27)]" },
  },
  {
    keywords: ["rosado", "rosa", "fucsia"],
    tono: { bg: "bg-[oklch(0.65_0.15_10/0.12)]", text: "text-[oklch(0.55_0.15_10)]" },
  },
  {
    keywords: ["naranja", "ocre"],
    tono: { bg: "bg-[oklch(0.6_0.18_45/0.12)]", text: "text-[oklch(0.55_0.18_45)]" },
  },
  {
    keywords: ["dorado", "oro"],
    tono: { bg: "bg-[oklch(0.75_0.1_85/0.15)]", text: "text-[oklch(0.5_0.1_85)]" },
  },
  {
    keywords: ["amarillo", "mostaza"],
    tono: { bg: "bg-[oklch(0.75_0.15_95/0.15)]", text: "text-[oklch(0.45_0.12_90)]" },
  },
  {
    keywords: ["beige", "arena", "champagne", "champaña", "crema", "hueso"],
    tono: { bg: "bg-[oklch(0.75_0.04_80/0.15)]", text: "text-[oklch(0.45_0.05_80)]" },
  },
  {
    keywords: ["cafe", "café", "marron", "marrón", "chocolate", "tabaco"],
    tono: { bg: "bg-[oklch(0.4_0.08_50/0.12)]", text: "text-[oklch(0.4_0.08_50)]" },
  },
  {
    keywords: ["verde", "oliva", "esmeralda", "menta"],
    tono: { bg: "bg-[oklch(0.5_0.13_150/0.12)]", text: "text-[oklch(0.4_0.1_150)]" },
  },
  {
    keywords: ["turquesa", "cian", "aqua"],
    tono: { bg: "bg-[oklch(0.6_0.1_200/0.12)]", text: "text-[oklch(0.5_0.1_200)]" },
  },
  {
    keywords: ["azul", "celeste", "marino", "marino"],
    tono: { bg: "bg-[oklch(0.5_0.15_250/0.12)]", text: "text-[oklch(0.44_0.12_250)]" },
  },
  {
    keywords: ["morado", "purpura", "púrpura", "violeta", "lila"],
    tono: { bg: "bg-[oklch(0.5_0.15_300/0.12)]", text: "text-[oklch(0.5_0.15_300)]" },
  },
];

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(DIACRITICOS, "").toLowerCase();
}

/** Returns null when color is absent or matches no known family -- caller keeps the neutral chip. */
export function inferirColorVehiculo(color: string | null | undefined): ColorTono | null {
  if (!color) return null;
  const normalizado = normalizar(color);
  const familia = FAMILIAS.find((familia) => familia.keywords.some((keyword) => normalizado.includes(keyword)));
  return familia?.tono ?? null;
}
