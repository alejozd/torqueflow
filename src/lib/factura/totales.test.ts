import { describe, expect, it } from "vitest";
import { computeFacturaTotales, IVA_RATE } from "./totales";

describe("computeFacturaTotales", () => {
  it("computes subtotal, IVA at the fixed rate, and total with no discount", () => {
    const result = computeFacturaTotales({
      items: [{ cantidad: 4, precioUnitario: 15 }],
      manoDeObra: [{ valor: 30 }],
      descuento: 0,
    });

    expect(result).toEqual({ subtotal: 90, descuento: 0, iva: 17.1, total: 107.1 });
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

    expect(result).toEqual({ subtotal: 127.8, descuento: 10, iva: 22.38, total: 140.18 });
  });

  it("uses a fixed 19% IVA rate", () => {
    expect(IVA_RATE).toBe(0.19);
  });

  it("returns zero totals for an order with no items and no mano de obra", () => {
    const result = computeFacturaTotales({ items: [], manoDeObra: [], descuento: 0 });

    expect(result).toEqual({ subtotal: 0, descuento: 0, iva: 0, total: 0 });
  });
});
