import { describe, expect, it } from "vitest";
import { agruparFacturacionPorDia, ordenarPorCriticidad, totalOrden, ultimosNDiasIso } from "./calculos";

describe("totalOrden", () => {
  it("sums items (cantidad x precioUnitario) plus mano de obra (flat valor per línea)", () => {
    const total = totalOrden({
      items: [
        { cantidad: 2, precioUnitario: 10 },
        { cantidad: 1, precioUnitario: 50 },
      ],
      manoDeObra: [{ valor: 60 }],
    });

    expect(total).toBe(2 * 10 + 1 * 50 + 60);
  });

  it("returns 0 for an orden with no items and no mano de obra", () => {
    expect(totalOrden({ items: [], manoDeObra: [] })).toBe(0);
  });
});

describe("ultimosNDiasIso", () => {
  it("returns n ISO dates (UTC) ending on the given day, oldest first", () => {
    const hoy = new Date("2026-08-25T15:00:00.000Z");
    expect(ultimosNDiasIso(hoy, 7)).toEqual([
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
  });
});

describe("agruparFacturacionPorDia", () => {
  it("sums Factura.total per UTC day and fills days with no facturas as 0", () => {
    const dias = ["2026-08-24", "2026-08-25"];
    const facturas = [
      { createdAt: new Date("2026-08-25T10:00:00.000Z"), total: 100 },
      { createdAt: new Date("2026-08-25T22:00:00.000Z"), total: 50 },
    ];

    expect(agruparFacturacionPorDia(facturas, dias)).toEqual([
      { fecha: "2026-08-24", total: 0 },
      { fecha: "2026-08-25", total: 150 },
    ]);
  });

  it("ignores facturas outside the requested day list", () => {
    const dias = ["2026-08-25"];
    const facturas = [{ createdAt: new Date("2026-01-01T00:00:00.000Z"), total: 999 }];

    expect(agruparFacturacionPorDia(facturas, dias)).toEqual([{ fecha: "2026-08-25", total: 0 }]);
  });
});

describe("ordenarPorCriticidad", () => {
  it("sorts repuestos by biggest deficit (stockActual - stockMinimo) first", () => {
    const repuestos = [
      { id: "a", stockActual: 3, stockMinimo: 5 }, // deficit -2
      { id: "b", stockActual: 0, stockMinimo: 4 }, // deficit -4
      { id: "c", stockActual: 4, stockMinimo: 5 }, // deficit -1
    ];

    expect(ordenarPorCriticidad(repuestos).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});
