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
    const totales = computeRentabilidad([
      {
        total: 140.18,
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
      margen: 124.18,
      margenPorcentaje: 88.59,
      manoDeObraFacturada: 30,
    });
  });

  it("sums across several facturas", () => {
    const totales = computeRentabilidad([
      { total: 100, items: [{ cantidad: 1, precioCompra: 10 }], manoDeObra: [] },
      {
        total: 200,
        items: [{ cantidad: 2, precioCompra: 20 }],
        manoDeObra: [{ horas: 2, precioHora: 25 }],
      },
    ]);

    expect(totales).toEqual({
      facturasCount: 2,
      totalFacturado: 300,
      costoRepuestos: 50,
      margen: 250,
      margenPorcentaje: 83.33,
      manoDeObraFacturada: 50,
    });
  });

  it("reports a negative margin when parts cost more than the invoice total", () => {
    const totales = computeRentabilidad([
      { total: 50, items: [{ cantidad: 1, precioCompra: 80 }], manoDeObra: [] },
    ]);

    expect(totales.costoRepuestos).toBe(80);
    expect(totales.margen).toBe(-30);
    expect(totales.margenPorcentaje).toBe(-60);
  });

  it("rounds each aggregate to two decimals", () => {
    const totales = computeRentabilidad([
      { total: 10.005, items: [{ cantidad: 3, precioCompra: 0.335 }], manoDeObra: [{ horas: 0.333, precioHora: 3 }] },
    ]);

    expect(totales.totalFacturado).toBe(10.01);
    expect(totales.costoRepuestos).toBe(1.01);
    expect(totales.manoDeObraFacturada).toBe(1);
  });
});
