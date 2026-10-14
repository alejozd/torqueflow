import { describe, expect, it } from "vitest";
import { zonaVehiculoSchema } from "@/lib/validation/recepcion";
import { FIGURAS, etiquetaZona, figuraDe, zonasDe } from "./figuras";

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

  it("el carro también puede marcar sus laterales", () => {
    const carro = zonasDe("CARRO").map((zona) => zona.zona);

    expect(carro).toContain("LATERAL_IZQUIERDO");
    expect(carro).toContain("LATERAL_DERECHO");
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

  it("la parte trasera del carro se llama Baúl, como se dice en Colombia", () => {
    expect(etiquetaZona("COMPUERTA")).toBe("Baúl");
    expect(FIGURAS.CARRO.zonas.find((zona) => zona.zona === "COMPUERTA")?.rotulo).toBe("Baúl");
  });
});
