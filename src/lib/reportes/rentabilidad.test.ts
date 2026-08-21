import { describe, expect, it } from "vitest";
import { computeRentabilidad } from "./rentabilidad";

describe("computeRentabilidad", () => {
  it("returns zeroed totals for an empty range without dividing by zero", () => {
    expect(computeRentabilidad([])).toEqual({
      facturasCount: 0,
      totalFacturado: 0,
      costoRepuestos: 0,
      margen: 0,
      margenPorcentaje: 0,
      manoDeObraFacturada: 0,
    });
  });

  it("counts cost only for items linked to a catalog Repuesto", () => {
    // subtotal 127.80 - descuento 10 = base 117.80 (matches the e2e fixture).
    const totales = computeRentabilidad([
      {
        total: 140.18,
        base: 117.8,
        items: [
          { cantidad: 4, precioCompra: null },
          { cantidad: 2, precioCompra: 8 },
        ],
        manoDeObra: [{ horas: 1.5, precioHora: 20 }],
      },
    ]);

    expect(totales).toEqual({
      facturasCount: 1,
      totalFacturado: 140.18,
      costoRepuestos: 16,
      margen: 101.8,
      margenPorcentaje: 86.42,
      manoDeObraFacturada: 30,
    });
  });

  it("sums across several facturas", () => {
    const totales = computeRentabilidad([
      { total: 100, base: 80, items: [{ cantidad: 1, precioCompra: 10 }], manoDeObra: [] },
      {
        total: 200,
        base: 160,
        items: [{ cantidad: 2, precioCompra: 20 }],
        manoDeObra: [{ horas: 2, precioHora: 25 }],
      },
    ]);

    expect(totales).toEqual({
      facturasCount: 2,
      totalFacturado: 300,
      costoRepuestos: 50,
      margen: 190,
      margenPorcentaje: 79.17,
      manoDeObraFacturada: 50,
    });
  });

  it("reports a negative margin when parts cost more than the invoice base", () => {
    const totales = computeRentabilidad([
      { total: 50, base: 40, items: [{ cantidad: 1, precioCompra: 80 }], manoDeObra: [] },
    ]);

    expect(totales.costoRepuestos).toBe(80);
    expect(totales.margen).toBe(-40);
    expect(totales.margenPorcentaje).toBe(-100);
  });

  it("rounds each aggregate to two decimals", () => {
    const totales = computeRentabilidad([
      {
        total: 10.005,
        base: 10.005,
        items: [{ cantidad: 3, precioCompra: 0.335 }],
        manoDeObra: [{ horas: 0.333, precioHora: 3 }],
      },
    ]);

    expect(totales.totalFacturado).toBe(10.01);
    expect(totales.costoRepuestos).toBe(1.01);
    expect(totales.manoDeObraFacturada).toBe(1);
  });
});
