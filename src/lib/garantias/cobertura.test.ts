import { describe, expect, it } from "vitest";
import { coberturaDe } from "./cobertura";

describe("coberturaDe", () => {
  it("describe la cobertura por fecha", () => {
    const texto = coberturaDe({ cubreHasta: new Date("2027-03-15T00:00:00.000Z"), cubreHastaKm: null });

    expect(texto).toContain("hasta el");
    expect(texto).toContain("2027");
  });

  it("describe la cobertura por kilometraje", () => {
    expect(coberturaDe({ cubreHasta: null, cubreHastaKm: 95000 })).toBe("hasta 95.000 km");
  });

  it("con las dos coberturas las une con o (vence la primera)", () => {
    expect(coberturaDe({ cubreHasta: new Date("2027-03-15T00:00:00.000Z"), cubreHastaKm: 95000 })).toContain(" o ");
  });

  it("sin cobertura avisa que es informativa", () => {
    expect(coberturaDe({ cubreHasta: null, cubreHastaKm: null })).toBe("Sin cobertura (informativa)");
  });
});
