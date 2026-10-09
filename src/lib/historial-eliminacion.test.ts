import { describe, expect, it } from "vitest";
import { describirHistorial, sumarConteos } from "./historial-eliminacion";

describe("describirHistorial", () => {
  it("returns null when there is no history, so the record can be deleted", () => {
    expect(describirHistorial({})).toBeNull();
    expect(describirHistorial({ ordenes: 0, citas: 0 })).toBeNull();
  });

  it("lists only what exists, with singular and plural", () => {
    expect(describirHistorial({ ordenes: 2, citas: 1, facturas: 0 })).toBe("2 órdenes, 1 cita");
    expect(describirHistorial({ historial: 1, cotizaciones: 3 })).toBe("3 cotizaciones, 1 registro en el historial");
  });
});

describe("sumarConteos", () => {
  it("adds a cliente's counts to those of its vehículos", () => {
    expect(sumarConteos([{ ordenes: 1 }, { historial: 2, ordenes: 1 }, {}])).toEqual({
      ordenes: 2,
      facturas: 0,
      citas: 0,
      cotizaciones: 0,
      historial: 2,
    });
  });
});
