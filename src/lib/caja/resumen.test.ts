import { describe, expect, it } from "vitest";
import { calcularResumenCaja, diferenciaCierre } from "./resumen";

describe("calcularResumenCaja", () => {
  it("calcula el efectivo esperado del ejemplo", () => {
    const r = calcularResumenCaja(200000, {
      pagos: [
        { monto: 500000, metodo: "EFECTIVO" },
        { monto: 300000, metodo: "TARJETA" },
      ],
      ventasMostrador: [],
      anticipos: [{ monto: 100000, metodo: "EFECTIVO" }],
      devoluciones: [{ monto: 50000, metodo: "EFECTIVO" }],
      gastosEfectivo: [30000],
    });
    expect(r.efectivoEsperado).toBe(720000);
    expect(r.totalIngresos).toBe(900000);
    expect(r.ingresosPorMetodo).toEqual({ EFECTIVO: 600000, TARJETA: 300000, TRANSFERENCIA: 0, OTRO: 0 });
    expect(r.egresosEfectivo).toBe(80000);
    expect(r.devolucionesOtrosMetodos).toBe(0);
  });
  it("devoluciones no efectivo son informativas", () => {
    const r = calcularResumenCaja(0, {
      pagos: [],
      ventasMostrador: [],
      anticipos: [],
      devoluciones: [{ monto: 10000, metodo: "TRANSFERENCIA" }],
      gastosEfectivo: [],
    });
    expect(r.devolucionesOtrosMetodos).toBe(10000);
    expect(r.egresosEfectivo).toBe(0);
    expect(r.efectivoEsperado).toBe(0);
  });

  it("las ventas de mostrador son ingreso y sus devoluciones egreso (Fase 24)", () => {
    const r = calcularResumenCaja(100000, {
      pagos: [],
      ventasMostrador: [
        { monto: 80000, metodo: "EFECTIVO" },
        { monto: 50000, metodo: "TARJETA" },
      ],
      anticipos: [],
      devoluciones: [{ monto: 30000, metodo: "EFECTIVO" }],
      gastosEfectivo: [],
    });

    expect(r.totalIngresos).toBe(130000);
    expect(r.ingresosPorMetodo).toEqual({ EFECTIVO: 80000, TARJETA: 50000, TRANSFERENCIA: 0, OTRO: 0 });
    expect(r.egresosEfectivo).toBe(30000);
    expect(r.efectivoEsperado).toBe(150000);
  });
});

describe("diferenciaCierre", () => {
  it("clasifica cuadre, sobrante y faltante", () => {
    expect(diferenciaCierre(100, 100)).toEqual({ diferencia: 0, tipo: "CUADRA" });
    expect(diferenciaCierre(100000, 110000)).toEqual({ diferencia: 10000, tipo: "SOBRANTE" });
    expect(diferenciaCierre(100000, 95000)).toEqual({ diferencia: -5000, tipo: "FALTANTE" });
  });
});
