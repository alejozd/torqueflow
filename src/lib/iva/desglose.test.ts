import { describe, expect, it } from "vitest";
import { desglosarIva, etiquetaTramoIva } from "./desglose";

describe("desglosarIva", () => {
  it("con una sola tarifa da lo mismo que (subtotal − descuento) × 19 %", () => {
    const r = desglosarIva([{ importe: 123_457, ivaPct: 19 }, { importe: 76_543 }], 33_333);
    expect(r.tramos).toEqual([{ ivaPct: 19, base: 166_667, iva: 31_666.73 }]);
    expect(r.iva).toBe(31_666.73);
  });

  it("la suma de las bases es exacta aunque el reparto no sea redondo", () => {
    const r = desglosarIva(
      [
        { importe: 100_000, ivaPct: 19 },
        { importe: 100_000, ivaPct: 5 },
        { importe: 100_000, ivaPct: 0 },
      ],
      100,
    );
    expect(r.tramos.reduce((s, t) => s + t.base, 0)).toBeCloseTo(299_900, 2);
    expect(r.tramos.map((t) => t.ivaPct)).toEqual([19, 5, 0]);
  });

  it("omite las tarifas sin base y limita el descuento al subtotal", () => {
    expect(desglosarIva([{ importe: 0, ivaPct: 5 }, { importe: 10_000, ivaPct: 19 }], 0).tramos).toEqual([
      { ivaPct: 19, base: 10_000, iva: 1_900 },
    ]);
    expect(desglosarIva([{ importe: 10_000, ivaPct: 19 }], 50_000)).toEqual({ tramos: [], iva: 0 });
    expect(desglosarIva([], 0)).toEqual({ tramos: [], iva: 0 });
  });
});

describe("etiquetaTramoIva", () => {
  it("nombra el porcentaje o Exento", () => {
    expect(etiquetaTramoIva({ ivaPct: 19 })).toBe("IVA 19 %");
    expect(etiquetaTramoIva({ ivaPct: 0 })).toBe("Exento");
  });
});
