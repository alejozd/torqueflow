import { describe, expect, it } from "vitest";
import { etiquetaTramoIva, leerDesgloseGuardado, separarIvaIncluido } from "./desglose";

describe("separarIvaIncluido", () => {
  it("con una tarifa separa base e IVA del total", () => {
    expect(separarIvaIncluido([{ importe: 119_000, ivaPct: 19 }], 0)).toEqual({
      tramos: [{ ivaPct: 19, base: 100_000, iva: 19_000 }],
      iva: 19_000,
      base: 100_000,
    });
  });

  it("reparte el descuento entre tarifas y base + IVA suma exactamente subtotal − descuento", () => {
    const r = separarIvaIncluido(
      [
        { importe: 119_000, ivaPct: 19 },
        { importe: 105_000, ivaPct: 5 },
        { importe: 50_000, ivaPct: 0 },
      ],
      27_400,
    );
    expect(r.tramos.map((t) => t.ivaPct)).toEqual([19, 5, 0]);
    expect(r.tramos.reduce((s, t) => s + t.base + t.iva, 0)).toBeCloseTo(274_000 - 27_400, 2);
    expect(r.tramos[0]).toEqual({ ivaPct: 19, base: 90_000, iva: 17_100 });
    expect(r.tramos[1]).toEqual({ ivaPct: 5, base: 90_000, iva: 4_500 });
    expect(r.tramos[2]).toEqual({ ivaPct: 0, base: 45_000, iva: 0 });
  });

  it("sin tarifa usa 19 %, omite tramos sin valor y limita el descuento", () => {
    expect(separarIvaIncluido([{ importe: 11_900 }, { importe: 0, ivaPct: 5 }], 0).tramos).toEqual([
      { ivaPct: 19, base: 10_000, iva: 1_900 },
    ]);
    expect(separarIvaIncluido([{ importe: 1_000, ivaPct: 19 }], 5_000)).toEqual({ tramos: [], iva: 0, base: 0 });
    expect(separarIvaIncluido([], 0)).toEqual({ tramos: [], iva: 0, base: 0 });
  });
});

describe("etiquetaTramoIva", () => {
  it("nombra el porcentaje o Exento", () => {
    expect(etiquetaTramoIva({ ivaPct: 19 })).toBe("IVA 19 %");
    expect(etiquetaTramoIva({ ivaPct: 0 })).toBe("Exento");
  });
});

describe("leerDesgloseGuardado", () => {
  it("convierte el JSON de la factura y descarta lo que no sirve", () => {
    expect(leerDesgloseGuardado([{ ivaPct: 19, base: "1000.00", iva: 190 }, { ivaPct: "x" }, null])).toEqual([
      { ivaPct: 19, base: 1000, iva: 190 },
    ]);
    expect(leerDesgloseGuardado("nada")).toEqual([]);
  });
});
