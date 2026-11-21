// src/modulos/factura-electronica/iva-incluido.test.ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calcularTotales } from "./calculo";
import { lineasDesdePreciosConIva, type LineaConIva } from "./iva-incluido";

const linea = (p: Partial<LineaConIva>): LineaConIva => ({
  codigo: "X",
  descripcion: "Concepto",
  cantidad: 1,
  unidad: "94",
  precioFinalUnitario: 0,
  tarifa: 19,
  ...p,
});

describe("lineasDesdePreciosConIva", () => {
  it("una línea al 19 %: $119.000 con IVA → $100.000 sin IVA, exacto", () => {
    const r = lineasDesdePreciosConIva([linea({ precioFinalUnitario: 11900000 })], 0);
    expect(r.lineas).toEqual([
      { codigo: "X", descripcion: "Concepto", cantidad: 1, unidad: "94", precioUnitario: 10000000, descuento: 0, iva: { tarifa: 19 } },
    ]);
    expect(r).toMatchObject({ totalEsperado: 11900000, totalElectronico: 11900000, diferencia: 0 });
  });

  it("tarifas mezcladas 19 %, 5 % y exento", () => {
    const r = lineasDesdePreciosConIva(
      [
        linea({ codigo: "A", precioFinalUnitario: 11900000, tarifa: 19 }),
        linea({ codigo: "B", precioFinalUnitario: 1050000, tarifa: 5 }),
        linea({ codigo: "C", precioFinalUnitario: 2000000, tarifa: 0 }),
      ],
      0,
    );
    expect(r.lineas.map((l) => l.precioUnitario)).toEqual([10000000, 1000000, 2000000]);
    expect(r.diferencia).toBe(0);
    expect(calcularTotales(r.lineas).impuestos).toEqual([
      { tarifa: 19, base: 10000000, valor: 1900000 },
      { tarifa: 5, base: 1000000, valor: 50000 },
      { tarifa: 0, base: 2000000, valor: 0 },
    ]);
  });

  it("con cantidad mayor que uno el precio unitario sale sin IVA", () => {
    const r = lineasDesdePreciosConIva([linea({ precioFinalUnitario: 1190000, cantidad: 3 })], 0);
    expect(r.lineas[0]).toMatchObject({ cantidad: 3, precioUnitario: 1000000, descuento: 0 });
    expect(r.diferencia).toBe(0);
  });

  it("reparte el descuento en proporción y lo resta del precio (sin descuento de línea)", () => {
    const r = lineasDesdePreciosConIva([linea({ precioFinalUnitario: 11900000 }), linea({ precioFinalUnitario: 5950000 })], 1785000);
    expect(r.lineas.map((l) => [l.precioUnitario, l.descuento])).toEqual([
      [9000000, 0],
      [4500000, 0],
    ]);
    expect(r).toMatchObject({ totalEsperado: 16065000, totalElectronico: 16065000, diferencia: 0 });
  });

  it("si ningún precio da exacto usa el más cercano (el menor en empate) e informa la diferencia", () => {
    // b + round(b × 19 %) nunca da 1.190.003: 1.000.002 → 1.190.002 y 1.000.003 → 1.190.004.
    const r = lineasDesdePreciosConIva([linea({ precioFinalUnitario: 1190003 })], 0);
    expect(r.lineas[0].precioUnitario).toBe(1000002);
    expect(r).toMatchObject({ totalEsperado: 1190003, totalElectronico: 1190002, diferencia: -1 });
  });

  it("el resto del descuento se reparte centavo a centavo sin dejar líneas negativas; excluido sin IVA", () => {
    const r = lineasDesdePreciosConIva(
      [
        linea({ precioFinalUnitario: 300, tarifa: null }),
        linea({ precioFinalUnitario: 300, tarifa: null }),
        linea({ precioFinalUnitario: 300, tarifa: null }),
        linea({ precioFinalUnitario: 100, tarifa: null }),
      ],
      5,
    );
    expect(r.lineas.map((l) => l.precioUnitario)).toEqual([299, 299, 298, 99]);
    expect(r.lineas.every((l) => l.iva === null)).toBe(true);
    expect(r).toMatchObject({ totalEsperado: 995, totalElectronico: 995, diferencia: 0 });
  });

  it("un descuento mayor que el valor de los conceptos lanza error", () => {
    expect(() => lineasDesdePreciosConIva([linea({ precioFinalUnitario: 1000 })], 1001)).toThrow(
      "El descuento no puede ser negativo ni mayor que el valor de los conceptos.",
    );
  });
});
