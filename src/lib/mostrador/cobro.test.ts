import { describe, expect, it } from "vitest";
import { descuentoPermitido, porcentajeDescuento, resumirPagos } from "./cobro";

describe("resumirPagos", () => {
  it("un pago que cubre el total deja saldo 0", () => {
    expect(resumirPagos(100000, [{ metodoPago: "TARJETA", monto: 100000 }], null)).toEqual({
      pagado: 100000,
      saldo: 0,
      vueltas: 0,
      error: null,
    });
  });

  it("pago mixto: suma los métodos y deja el saldo restante", () => {
    const r = resumirPagos(100000, [
      { metodoPago: "EFECTIVO", monto: 40000 },
      { metodoPago: "TRANSFERENCIA", monto: 35000 },
    ], null);
    expect(r).toMatchObject({ pagado: 75000, saldo: 25000, error: null });
  });

  it("sin pagos todo queda como saldo (crédito)", () => {
    expect(resumirPagos(100000, [], null)).toMatchObject({ pagado: 0, saldo: 100000, vueltas: 0, error: null });
  });

  it("rechaza pagos con monto cero o negativo", () => {
    expect(resumirPagos(100000, [{ metodoPago: "EFECTIVO", monto: 0 }], null).error).toBe(
      "Cada pago debe ser mayor que cero",
    );
    expect(resumirPagos(100000, [{ metodoPago: "EFECTIVO", monto: -5 }], null).error).toBe(
      "Cada pago debe ser mayor que cero",
    );
  });

  it("rechaza que la suma supere el total cuando el exceso no sale del efectivo", () => {
    const r = resumirPagos(100000, [{ metodoPago: "TARJETA", monto: 120000 }], null);
    expect(r.error).toBe("Los pagos suman más que el total");
  });

  it("el exceso pagado en efectivo son las vueltas", () => {
    const r = resumirPagos(100000, [
      { metodoPago: "TARJETA", monto: 60000 },
      { metodoPago: "EFECTIVO", monto: 50000 },
    ], null);
    expect(r).toEqual({ pagado: 100000, saldo: 0, vueltas: 10000, error: null });
  });

  it("el exceso nunca puede salir de otro método que no sea efectivo", () => {
    const r = resumirPagos(100000, [
      { metodoPago: "TARJETA", monto: 90000 },
      { metodoPago: "EFECTIVO", monto: 5000 },
      { metodoPago: "OTRO", monto: 20000 },
    ], null);
    expect(r.error).toBe("Los pagos suman más que el total");
  });

  it("el efectivo recibido mayor que el pago en efectivo da vueltas", () => {
    const r = resumirPagos(100000, [{ metodoPago: "EFECTIVO", monto: 100000 }], 120000);
    expect(r).toEqual({ pagado: 100000, saldo: 0, vueltas: 20000, error: null });
  });

  it("el efectivo recibido sin pago en efectivo no genera vueltas", () => {
    const r = resumirPagos(100000, [{ metodoPago: "TARJETA", monto: 100000 }], 50000);
    expect(r.vueltas).toBe(0);
  });
});

describe("porcentajeDescuento", () => {
  it("calcula el porcentaje sobre el subtotal", () => {
    expect(porcentajeDescuento(200000, 20000)).toBe(10);
  });
  it("subtotal 0 o sin descuento da 0", () => {
    expect(porcentajeDescuento(0, 100)).toBe(0);
    expect(porcentajeDescuento(100000, 0)).toBe(0);
  });
});

describe("descuentoPermitido", () => {
  it("ADMIN no tiene tope", () => {
    expect(descuentoPermitido("ADMIN", 90, 10)).toBe(true);
  });
  it("RECEPCION puede hasta el tope inclusive", () => {
    expect(descuentoPermitido("RECEPCION", 10, 10)).toBe(true);
    expect(descuentoPermitido("RECEPCION", 10.01, 10)).toBe(false);
  });
});
