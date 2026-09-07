import { describe, expect, it } from "vitest";
import { assertCotizacionMutable, esCotizacionMutable } from "./mutable-guard";

describe("esCotizacionMutable", () => {
  it("allows BORRADOR", () => {
    expect(esCotizacionMutable("BORRADOR")).toBe(true);
  });

  it("allows ENVIADA", () => {
    expect(esCotizacionMutable("ENVIADA")).toBe(true);
  });

  it("rejects APROBADA, RECHAZADA and VENCIDA", () => {
    expect(esCotizacionMutable("APROBADA")).toBe(false);
    expect(esCotizacionMutable("RECHAZADA")).toBe(false);
    expect(esCotizacionMutable("VENCIDA")).toBe(false);
  });
});

describe("assertCotizacionMutable", () => {
  it("does not throw for BORRADOR or ENVIADA", () => {
    expect(() => assertCotizacionMutable({ estado: "BORRADOR" })).not.toThrow();
    expect(() => assertCotizacionMutable({ estado: "ENVIADA" })).not.toThrow();
  });

  it("throws a descriptive error for a decided or expired cotización", () => {
    expect(() => assertCotizacionMutable({ estado: "APROBADA" })).toThrow(
      "No se puede modificar una cotización en estado APROBADA.",
    );
  });
});
