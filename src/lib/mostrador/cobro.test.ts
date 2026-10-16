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

  it("rechaza que la suma supere el total, sea cual sea el método", () => {
    expect(resumirPagos(100000, [{ metodoPago: "TARJETA", monto: 120000 }], null).error).toBe(
      "Los pagos suman más que el total",
    );
    expect(resumirPagos(100000, [{ metodoPago: "EFECTIVO", monto: 120000 }], null).error).toBe(
      "Los pagos suman más que el total",
    );
  });

  it("sin efectivo recibido no hay vueltas", () => {
    expect(resumirPagos(100000, [{ metodoPago: "EFECTIVO", monto: 100000 }], null).vueltas).toBe(0);
  });

  it("las vueltas son lo recibido menos el pago en efectivo", () => {
    const r = resumirPagos(100000, [
      { metodoPago: "TARJETA", monto: 60000 },
      { metodoPago: "EFECTIVO", monto: 40000 },
    ], 50000);
    expect(r).toEqual({ pagado: 100000, saldo: 0, vueltas: 10000, error: null });
  });

  it("lo recibido menor que el pago en efectivo es un error", () => {
    const r = resumirPagos(100000, [{ metodoPago: "EFECTIVO", monto: 100000 }], 90000);
    expect(r.error).toBe("Lo recibido en efectivo es menor que el pago en efectivo");
  });

  it("lo recibido sin pago en efectivo se devuelve entero como vueltas", () => {
    expect(resumirPagos(100000, [{ metodoPago: "TARJETA", monto: 100000 }], 50000).vueltas).toBe(50000);
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
  it.each([7, 14, 28])("tope %i %%: el descuento exacto pasa y un peso más no", (tope) => {
    const exacto = (100000 * tope) / 100;
    expect(descuentoPermitido("RECEPCION", porcentajeDescuento(100000, exacto), tope)).toBe(true);
    expect(descuentoPermitido("RECEPCION", porcentajeDescuento(100000, exacto + 1), tope)).toBe(false);
  });
  it("RECEPCION puede hasta el tope inclusive", () => {
    expect(descuentoPermitido("RECEPCION", 10, 10)).toBe(true);
    expect(descuentoPermitido("RECEPCION", 10.01, 10)).toBe(false);
  });
});
