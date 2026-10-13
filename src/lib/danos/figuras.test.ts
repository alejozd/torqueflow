import { describe, expect, it } from "vitest";
import { zonaVehiculoSchema } from "@/lib/validation/recepcion";
import { FIGURAS, LIENZO, figuraDe, zonasDe } from "./figuras";

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

  it("todas las zonas traen etiqueta en español y cajas dentro del lienzo", () => {
    // Cada zona se compone de cajas "M x y H x2 V y2 H x Z" (una o varias).
    const CAJA = /M (\d+) (\d+) H (\d+) V (\d+) H \d+ Z/g;

    for (const figura of Object.values(FIGURAS)) {
      for (const zona of figura.zonas) {
        expect(zona.etiqueta.length).toBeGreaterThan(2);
        expect(zona.d.startsWith("M ")).toBe(true);
        expect(zona.d.endsWith("Z")).toBe(true);

        const cajas = [...zona.d.matchAll(CAJA)];
        expect(cajas.length, `la zona ${zona.zona} no tiene cajas reconocibles`).toBeGreaterThan(0);

        for (const caja of cajas) {
          const [x, y, x2, y2] = [Number(caja[1]), Number(caja[2]), Number(caja[3]), Number(caja[4])];
          expect(x).toBeLessThan(x2);
          expect(y).toBeLessThan(y2);
          expect(x2).toBeLessThanOrEqual(LIENZO.ancho);
          expect(y2).toBeLessThanOrEqual(LIENZO.alto);
        }
      }
    }
  });

  it("las zonas de una misma figura no se pisan", () => {
    const CAJA = /M (\d+) (\d+) H (\d+) V (\d+) H \d+ Z/g;
    const rectangulos = (d: string) =>
      [...d.matchAll(CAJA)].map((caja) => ({
        x1: Number(caja[1]),
        y1: Number(caja[2]),
        x2: Number(caja[3]),
        y2: Number(caja[4]),
      }));

    for (const [nombre, figura] of Object.entries(FIGURAS)) {
      const todas = figura.zonas.flatMap((zona) => rectangulos(zona.d).map((rectangulo) => ({ zona: zona.zona, ...rectangulo })));

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
});
