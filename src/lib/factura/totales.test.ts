import { describe, expect, it } from "vitest";
import { computeFacturaTotales } from "./totales";

describe("computeFacturaTotales", () => {
  it("computes subtotal, IVA at the fixed rate, and total with no discount", () => {
    const result = computeFacturaTotales({
      items: [{ cantidad: 4, precioUnitario: 15 }],
      manoDeObra: [{ valor: 30 }],
      descuento: 0,
    });

    expect(result).toMatchObject({ subtotal: 90, descuento: 0, iva: 17.1, total: 107.1 });
  });

  it("applies the discount before computing IVA", () => {
    const result = computeFacturaTotales({
      items: [
        { cantidad: 4, precioUnitario: 15 },
        { cantidad: 2, precioUnitario: 18.9 },
      ],
      manoDeObra: [{ valor: 30 }],
      descuento: 10,
    });

    expect(result).toMatchObject({ subtotal: 127.8, descuento: 10, iva: 22.38, total: 140.18 });
  });

  it("sin ivaPct las líneas pagan 19 %, como antes de las tarifas", () => {
    const result = computeFacturaTotales({ items: [{ cantidad: 1, precioUnitario: 100 }], manoDeObra: [], descuento: 0 });
    expect(result.desgloseIva).toEqual([{ ivaPct: 19, base: 100, iva: 19 }]);
  });

  it("cada línea paga su tarifa y el descuento se reparte entre ellas", () => {
    const result = computeFacturaTotales({
      items: [
        { cantidad: 1, precioUnitario: 100_000, ivaPct: 19 },
        { cantidad: 2, precioUnitario: 25_000, ivaPct: 5 },
      ],
      manoDeObra: [{ valor: 50_000, ivaPct: 0 }],
      descuento: 20_000,
    });
    expect(result.desgloseIva).toEqual([
      { ivaPct: 19, base: 90_000, iva: 17_100 },
      { ivaPct: 5, base: 45_000, iva: 2_250 },
      { ivaPct: 0, base: 45_000, iva: 0 },
    ]);
    expect(result).toMatchObject({ subtotal: 200_000, iva: 19_350, total: 199_350 });
  });

  it("returns zero totals for an order with no items and no mano de obra", () => {
    const result = computeFacturaTotales({ items: [], manoDeObra: [], descuento: 0 });

    expect(result).toEqual({ subtotal: 0, descuento: 0, iva: 0, desgloseIva: [], total: 0 });
  });
});
