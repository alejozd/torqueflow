import { describe, expect, it } from "vitest";
import { zonaVehiculoSchema } from "@/lib/validation/recepcion";
import { COLOR_DANIO, FIGURAS, etiquetaZona, figuraDe, zonasDe } from "./figuras";

const TODAS = zonaVehiculoSchema.options;

describe("figuraDe y zonasDe", () => {
  it("la moto usa su figura y el resto la del carro", () => {
    expect(figuraDe("MOTO")).toBe("MOTO");
    expect(figuraDe("CARRO")).toBe("CARRO");
    expect(figuraDe("CAMIONETA")).toBe("CARRO");
    expect(figuraDe("CAMION")).toBe("CARRO");
    expect(zonasDe("MOTO").map((zona) => zona.zona)).toContain("MANUBRIO");
    expect(zonasDe("CARRO").map((zona) => zona.zona)).toContain("CAPO");
  });

  it("el carro marca cada guardabarros por separado", () => {
    const carro = zonasDe("CARRO");

    for (const nombre of [
      "GUARDABARROS_DELANTERO_IZQUIERDO",
      "GUARDABARROS_TRASERO_IZQUIERDO",
      "GUARDABARROS_DELANTERO_DERECHO",
      "GUARDABARROS_TRASERO_DERECHO",
    ] as const) {
      const guardabarros = carro.find((zona) => zona.zona === nombre);
      expect(guardabarros?.cajas, `${nombre} debe ser una sola caja`).toHaveLength(1);
    }
  });
});

describe("figuras del diagrama", () => {
  it("no hay zonas muertas: cada zona del catálogo se puede marcar en alguna figura", () => {
    const dibujadas = new Set([...FIGURAS.CARRO.zonas, ...FIGURAS.MOTO.zonas].map((zona) => zona.zona));

    for (const zona of TODAS) {
      if (zona === "OTRO") continue; // se elige en la lista, no se dibuja
      expect(dibujadas, `la zona ${zona} no está en ninguna figura`).toContain(zona);
    }
  });

  it("OTRO no se dibuja (se elige aparte) y ninguna figura repite zona", () => {
    for (const figura of Object.values(FIGURAS)) {
      const zonas = figura.zonas.map((zona) => zona.zona);
      expect(zonas).not.toContain("OTRO");
      expect(new Set(zonas).size).toBe(zonas.length);
    }
  });

  it("todas las zonas traen etiqueta en español, cajas dentro de su lienzo y un trazo cerrado", () => {
    for (const figura of Object.values(FIGURAS)) {
      for (const zona of figura.zonas) {
        expect(zona.etiqueta.length).toBeGreaterThan(2);
        expect(zona.cajas.length, `la zona ${zona.zona} no tiene cajas`).toBeGreaterThan(0);
        expect(zona.d.startsWith("M ")).toBe(true);
        expect(zona.d.endsWith("Z")).toBe(true);

        for (const [x, y, ancho, alto] of zona.cajas) {
          expect(ancho).toBeGreaterThan(0);
          expect(alto).toBeGreaterThan(0);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + ancho).toBeLessThanOrEqual(figura.lienzo.ancho);
          expect(y + alto).toBeLessThanOrEqual(figura.lienzo.alto);
        }
      }
    }
  });

  it("las zonas de una misma figura no se pisan", () => {
    for (const [nombre, figura] of Object.entries(FIGURAS)) {
      const todas = figura.zonas.flatMap((zona) =>
        zona.cajas.map(([x, y, ancho, alto]) => ({ zona: zona.zona, x1: x, y1: y, x2: x + ancho, y2: y + alto })),
      );

      for (let i = 0; i < todas.length; i += 1) {
        for (let j = i + 1; j < todas.length; j += 1) {
          const a = todas[i]!;
          const b = todas[j]!;
          const sePisan = a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
          expect(sePisan, `${nombre}: ${a.zona} se pisa con ${b.zona}`).toBe(false);
        }
      }
    }
  });

  it("cada figura dice hacia dónde mira (adelante, atrás, izquierda, derecha) y trae su silueta", () => {
    for (const figura of Object.values(FIGURAS)) {
      const textos = figura.orientacion.map((rotulo) => rotulo.texto.toLowerCase());
      expect(textos.some((texto) => texto.includes("adelante"))).toBe(true);
      expect(textos.some((texto) => texto.includes("atrás"))).toBe(true);
      expect(figura.silueta.length).toBeGreaterThan(0);
    }
  });

  it("el carro se ve desde arriba con el frente hacia arriba: el frente queda por encima del techo y del baúl", () => {
    const y = (zona: string) => FIGURAS.CARRO.zonas.find((candidata) => candidata.zona === zona)!.cajas[0]![1];
    expect(y("FRENTE")).toBeLessThan(y("CAPO"));
    expect(y("CAPO")).toBeLessThan(y("PARABRISAS"));
    expect(y("PARABRISAS")).toBeLessThan(y("TECHO"));
    expect(y("TECHO")).toBeLessThan(y("COMPUERTA"));
  });

  it("la silueta trae carrocería, vidrios y llantas para que se entienda el dibujo", () => {
    for (const figura of Object.values(FIGURAS)) {
      const tipos = new Set(figura.silueta.map((trazo) => trazo.tipo));
      expect(tipos.has("carroceria")).toBe(true);
      expect(tipos.has("llanta")).toBe(true);
      for (const trazo of figura.silueta) expect(trazo.d.startsWith("M ")).toBe(true);
    }
    expect(new Set(FIGURAS.CARRO.silueta.map((trazo) => trazo.tipo)).has("vidrio")).toBe(true);
  });

  it("los laterales viejos del carro tienen un sitio fuera del dibujo y un aviso", () => {
    const fuera = FIGURAS.CARRO.fueraDelDibujo!;
    for (const zona of ["LATERAL_IZQUIERDO", "LATERAL_DERECHO"] as const) {
      expect(fuera[zona]!.aviso).toMatch(/guardabarros/);
      expect(FIGURAS.CARRO.zonas.some((candidata) => candidata.zona === zona)).toBe(false);
    }
  });

  it("cada tipo de daño tiene su color", () => {
    expect(Object.keys(COLOR_DANIO).sort()).toEqual(["FALTANTE", "GOLPE", "OXIDO", "RAYON", "ROTURA"]);
  });

  it("la parte trasera del carro se llama Baúl, como se dice en Colombia", () => {
    expect(etiquetaZona("COMPUERTA")).toBe("Baúl");
    expect(FIGURAS.CARRO.zonas.find((zona) => zona.zona === "COMPUERTA")?.rotulo).toBe("Baúl");
  });
});
