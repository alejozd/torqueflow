import { describe, expect, it } from "vitest";
import { computeRentabilidadNeta } from "./rentabilidad-neta";
import type { RentabilidadTotales } from "@/lib/reportes/rentabilidad";

function totales(overrides: Partial<RentabilidadTotales> = {}): RentabilidadTotales {
  return {
    facturasCount: 20, totalFacturado: 11900000, baseFacturada: 10000000, costoRepuestos: 6000000,
    margen: 4000000, margenPorcentaje: 40, manoDeObraFacturada: 3000000, ...overrides,
  };
}

describe("computeRentabilidadNeta", () => {
  it("calcula utilidad neta, margen neto y punto de equilibrio", () => {
    expect(computeRentabilidadNeta(totales(), 3000000)).toEqual({
      gastosTotal: 3000000,
      utilidadNeta: 1000000,
      margenNetoPorcentaje: 10,
      ticketPromedioBase: 500000,
      puntoEquilibrioVentas: 7500000,
      puntoEquilibrioFacturas: 15,
      diferenciaEquilibrio: 2500000,
    });
  });

  it("punto de equilibrio no alcanzable si el margen es 0 o negativo", () => {
    const r = computeRentabilidadNeta(totales({ margen: -100000, margenPorcentaje: -1 }), 500000);
    expect(r.puntoEquilibrioVentas).toBeNull();
    expect(r.puntoEquilibrioFacturas).toBeNull();
    expect(r.diferenciaEquilibrio).toBeNull();
    expect(r.utilidadNeta).toBe(-600000);
  });

  it("sin facturas: margen neto 0, ticket 0, sin punto de equilibrio en facturas", () => {
    const r = computeRentabilidadNeta(
      totales({ facturasCount: 0, totalFacturado: 0, baseFacturada: 0, costoRepuestos: 0, margen: 0, margenPorcentaje: 0 }),
      200000,
    );
    expect(r).toMatchObject({ utilidadNeta: -200000, margenNetoPorcentaje: 0, ticketPromedioBase: 0, puntoEquilibrioVentas: null });
  });

  it("redondea el punto de equilibrio en facturas hacia arriba", () => {
    // base 1.000.000 / 3 facturas => ticket 333.333,33; PE 500.000 => 1,5 => 2
    const r = computeRentabilidadNeta(totales({ facturasCount: 3, baseFacturada: 1000000, margen: 400000, margenPorcentaje: 40 }), 200000);
    expect(r.puntoEquilibrioFacturas).toBe(2);
  });
});
