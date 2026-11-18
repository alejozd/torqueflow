import { describe, expect, it } from "vitest";
import { descuentoHeredado } from "./descuento-cotizacion";

const cotizacion = (cambios: Partial<Parameters<typeof descuentoHeredado>[0] & object> = {}) => ({
  numero: 45,
  descuentoTipo: "PORCENTAJE" as const,
  descuentoPct: 10,
  descuentoMonto: 0,
  ...cambios,
});

describe("descuentoHeredado", () => {
  it("sin cotización no hereda nada", () => {
    expect(descuentoHeredado(null, 100000)).toBeNull();
  });

  it("un porcentaje se aplica al total de hoy de la orden", () => {
    expect(descuentoHeredado(cotizacion(), 333381)).toEqual({
      descuento: 33338,
      etiqueta: "Descuento de la cotización #45 (10 %)",
    });
  });

  it("un monto fijo pasa igual, sin superar el total de la orden", () => {
    expect(descuentoHeredado(cotizacion({ descuentoTipo: "MONTO", descuentoMonto: 20000 }), 300000)).toEqual({
      descuento: 20000,
      etiqueta: "Descuento de la cotización #45",
    });
    expect(descuentoHeredado(cotizacion({ descuentoTipo: "MONTO", descuentoMonto: 50000 }), 30000)?.descuento).toBe(30000);
  });

  it("una cotización sin descuento no hereda nada", () => {
    expect(descuentoHeredado(cotizacion({ descuentoPct: 0 }), 100000)).toBeNull();
  });
});
