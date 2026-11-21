// @vitest-environment node
import { describe, expect, it } from "vitest";
import { calcularLinea, calcularTotales } from "./calculo";
import type { Linea } from "./modelo";

const linea = (p: Partial<Linea>): Linea => ({
  codigo: "X",
  descripcion: "Concepto",
  cantidad: 1,
  unidad: "94",
  precioUnitario: 0,
  descuento: 0,
  iva: { tarifa: 19 },
  ...p,
});

describe("calcularLinea", () => {
  it("multiplica precio por cantidad y aplica IVA", () => {
    expect(calcularLinea(linea({ precioUnitario: 100000, cantidad: 2 }))).toEqual({
      bruto: 200000,
      descuento: 0,
      neto: 200000,
      iva: 38000,
    });
  });
  it("aplica el IVA sobre el valor con descuento", () => {
    expect(calcularLinea(linea({ precioUnitario: 100000, descuento: 10000 }))).toEqual({
      bruto: 100000,
      descuento: 10000,
      neto: 90000,
      iva: 17100,
    });
  });
  it("redondea a centavos", () => {
    // 3333 × 3 = 9999; IVA 19 % = 1899,81 → 1900
    expect(calcularLinea(linea({ precioUnitario: 3333, cantidad: 3 })).iva).toBe(1900);
    // 3333 × 1,5 = 4999,5 → 5000
    expect(calcularLinea(linea({ precioUnitario: 3333, cantidad: 1.5 })).bruto).toBe(5000);
  });
  it("una línea excluida no lleva IVA", () => {
    expect(calcularLinea(linea({ precioUnitario: 20000, iva: null })).iva).toBe(0);
  });
});

describe("calcularTotales", () => {
  it("consolida tarifas mezcladas; la excluida no entra en la base gravable", () => {
    const t = calcularTotales([
      linea({ precioUnitario: 1000000 }), // 19 %
      linea({ precioUnitario: 50000, iva: { tarifa: 5 } }),
      linea({ precioUnitario: 30000, iva: { tarifa: 0 } }), // exenta
      linea({ precioUnitario: 20000, iva: null }), // excluida
      linea({ precioUnitario: 500000 }), // 19 %
    ]);
    expect(t.bruto).toBe(1600000);
    expect(t.baseGravable).toBe(1580000);
    expect(t.impuestos).toEqual([
      { tarifa: 19, base: 1500000, valor: 285000 },
      { tarifa: 5, base: 50000, valor: 2500 },
      { tarifa: 0, base: 30000, valor: 0 },
    ]);
    expect(t.totalImpuestos).toBe(287500);
    expect(t.totalConImpuestos).toBe(1887500);
    expect(t.totalAPagar).toBe(1887500);
    expect(t.lineas).toHaveLength(5);
  });
  it("sin líneas todo es cero", () => {
    const t = calcularTotales([]);
    expect(t).toEqual({
      lineas: [],
      bruto: 0,
      baseGravable: 0,
      impuestos: [],
      totalImpuestos: 0,
      totalConImpuestos: 0,
      totalAPagar: 0,
    });
  });
});
