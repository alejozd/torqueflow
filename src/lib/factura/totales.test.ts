import { describe, expect, it } from "vitest";
import { computeFacturaTotales } from "./totales";

describe("computeFacturaTotales", () => {
  it("el total es la suma (IVA incluido) y el IVA se separa por dentro", () => {
    const result = computeFacturaTotales({
      items: [{ cantidad: 4, precioUnitario: 15 }],
      manoDeObra: [{ valor: 30 }],
      descuento: 0,
    });

    // 90 / 1,19 = 75,63 de base: 14,37 de IVA dentro del total.
    expect(result).toMatchObject({ subtotal: 90, descuento: 0, iva: 14.37, total: 90 });
  });

  it("el descuento baja el total y el IVA se separa de lo que queda", () => {
    const result = computeFacturaTotales({
      items: [
        { cantidad: 4, precioUnitario: 15 },
        { cantidad: 2, precioUnitario: 18.9 },
      ],
      manoDeObra: [{ valor: 30 }],
      descuento: 10,
    });

    // 117,8 / 1,19 = 98,99 de base.
    expect(result).toMatchObject({ subtotal: 127.8, descuento: 10, iva: 18.81, total: 117.8 });
  });

  it("sin ivaPct las líneas llevan 19 %, como antes de las tarifas", () => {
    const result = computeFacturaTotales({ items: [{ cantidad: 1, precioUnitario: 119 }], manoDeObra: [], descuento: 0 });
    expect(result.desgloseIva).toEqual([{ ivaPct: 19, base: 100, iva: 19 }]);
  });

  it("cada línea separa el IVA de su tarifa y el descuento se reparte entre ellas", () => {
    const result = computeFacturaTotales({
      items: [
        { cantidad: 1, precioUnitario: 119_000, ivaPct: 19 },
        { cantidad: 2, precioUnitario: 52_500, ivaPct: 5 },
      ],
      manoDeObra: [{ valor: 50_000, ivaPct: 0 }],
      descuento: 27_400,
    });
    expect(result.desgloseIva).toEqual([
      { ivaPct: 19, base: 90_000, iva: 17_100 },
      { ivaPct: 5, base: 90_000, iva: 4_500 },
      { ivaPct: 0, base: 45_000, iva: 0 },
    ]);
    expect(result).toMatchObject({ subtotal: 274_000, iva: 21_600, total: 246_600 });
  });

  it("returns zero totals for an order with no items and no mano de obra", () => {
    const result = computeFacturaTotales({ items: [], manoDeObra: [], descuento: 0 });

    expect(result).toEqual({ subtotal: 0, descuento: 0, iva: 0, desgloseIva: [], total: 0 });
  });
});
