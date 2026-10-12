import { describe, expect, it } from "vitest";
import {
  calcularMontoLiquidacion,
  hayCambiosSinReflejar,
  montoPorTrabajo,
  totalLiquidacion,
} from "./calculo";

describe("calcularMontoLiquidacion", () => {
  it("porcentaje: aplica el porcentaje sobre la mano de obra producida", () => {
    expect(calcularMontoLiquidacion({ tipo: "PORCENTAJE", porcentaje: 40, montoFijo: null }, 45000)).toBe(18000);
    expect(calcularMontoLiquidacion({ tipo: "PORCENTAJE", porcentaje: 33.33, montoFijo: null }, 45000)).toBe(14998.5);
  });

  it("fijo: paga la base sin mirar lo producido", () => {
    expect(calcularMontoLiquidacion({ tipo: "FIJO", porcentaje: null, montoFijo: 1500000 }, 45000)).toBe(1500000);
    expect(calcularMontoLiquidacion({ tipo: "FIJO", porcentaje: null, montoFijo: 1500000 }, 0)).toBe(1500000);
  });

  it("mixto: base más porcentaje", () => {
    expect(calcularMontoLiquidacion({ tipo: "MIXTO", porcentaje: 10, montoFijo: 800000 }, 45000)).toBe(804500);
  });

  it("sin producción, el porcentaje paga cero", () => {
    expect(calcularMontoLiquidacion({ tipo: "PORCENTAJE", porcentaje: 40, montoFijo: null }, 0)).toBe(0);
  });

  it("redondea a dos decimales", () => {
    expect(calcularMontoLiquidacion({ tipo: "MIXTO", porcentaje: 12.5, montoFijo: 0.01 }, 0.07)).toBe(0.02);
  });
});

describe("totalLiquidacion", () => {
  it("suma el ajuste al monto calculado", () => {
    expect(totalLiquidacion(18000, 0)).toBe(18000);
    expect(totalLiquidacion(18000, 25000)).toBe(43000);
    expect(totalLiquidacion(18000, -5000)).toBe(13000);
  });

  it("redondea la suma", () => {
    expect(totalLiquidacion(0.1, 0.2)).toBe(0.3);
  });
});

describe("hayCambiosSinReflejar", () => {
  const congelado = { ordenes: 3, trabajos: 5, montoManoObra: 150000, montoCalculado: 60000 };

  it("no avisa cuando el documento coincide con lo producido", () => {
    expect(hayCambiosSinReflejar(congelado, { ...congelado })).toBe(false);
  });

  it("avisa cuando entró trabajo nuevo al periodo", () => {
    expect(hayCambiosSinReflejar(congelado, { ...congelado, trabajos: 6, montoManoObra: 170000, montoCalculado: 68000 })).toBe(true);
    expect(hayCambiosSinReflejar(congelado, { ...congelado, ordenes: 4 })).toBe(true);
  });

  it("avisa cuando cambió el esquema aunque lo producido sea igual", () => {
    expect(hayCambiosSinReflejar(congelado, { ...congelado, montoCalculado: 75000 })).toBe(true);
  });
});

describe("montoPorTrabajo", () => {
  it("promedia la mano de obra entre los trabajos", () => {
    expect(montoPorTrabajo(45000, 2)).toBe(22500);
    expect(montoPorTrabajo(45000, 3)).toBe(15000);
  });

  it("sin trabajos no hay promedio", () => {
    expect(montoPorTrabajo(45000, 0)).toBeNull();
    expect(montoPorTrabajo(0, 0)).toBeNull();
  });
});
