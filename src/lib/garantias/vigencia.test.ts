import { describe, expect, it } from "vitest";
import { estadoGarantia } from "./vigencia";

const HOY = new Date("2026-10-12T15:00:00.000Z");

describe("estadoGarantia", () => {
  it("vence por fecha al día siguiente del límite, no el mismo día", () => {
    expect(estadoGarantia({ cubreHasta: new Date("2026-10-12T00:00:00.000Z"), cubreHastaKm: null }, { hoy: HOY, kilometraje: null })).toBe(
      "VIGENTE",
    );
    expect(estadoGarantia({ cubreHasta: new Date("2026-10-11T00:00:00.000Z"), cubreHastaKm: null }, { hoy: HOY, kilometraje: null })).toBe(
      "VENCIDA",
    );
    expect(estadoGarantia({ cubreHasta: new Date("2027-03-15T00:00:00.000Z"), cubreHastaKm: null }, { hoy: HOY, kilometraje: null })).toBe(
      "VIGENTE",
    );
  });

  it("el último día de cobertura sigue vigente toda la noche en Bogotá", () => {
    // 12 de octubre, 8 p. m. en Bogotá = 13 de octubre, 1 a. m. UTC.
    const noche = new Date("2026-10-13T01:00:00.000Z");
    expect(
      estadoGarantia({ cubreHasta: new Date("2026-10-12T00:00:00.000Z"), cubreHastaKm: null }, { hoy: noche, kilometraje: null }),
    ).toBe("VIGENTE");
  });

  it("vence por kilometraje cuando el vehículo ya lo pasó", () => {
    expect(estadoGarantia({ cubreHasta: null, cubreHastaKm: 95_000 }, { hoy: HOY, kilometraje: 95_000 })).toBe("VIGENTE");
    expect(estadoGarantia({ cubreHasta: null, cubreHastaKm: 95_000 }, { hoy: HOY, kilometraje: 95_001 })).toBe("VENCIDA");
  });

  it("sin kilometraje del vehículo no puede declararla vencida por km", () => {
    expect(estadoGarantia({ cubreHasta: null, cubreHastaKm: 95_000 }, { hoy: HOY, kilometraje: null })).toBe("VIGENTE");
  });

  it("vence lo primero que llega con las dos coberturas", () => {
    const cobertura = { cubreHasta: new Date("2027-03-15T00:00:00.000Z"), cubreHastaKm: 95_000 };

    expect(estadoGarantia(cobertura, { hoy: HOY, kilometraje: 90_000 })).toBe("VIGENTE");
    expect(estadoGarantia(cobertura, { hoy: HOY, kilometraje: 120_000 })).toBe("VENCIDA");
    expect(
      estadoGarantia({ ...cobertura, cubreHasta: new Date("2026-01-01T00:00:00.000Z") }, { hoy: HOY, kilometraje: 90_000 }),
    ).toBe("VENCIDA");
  });

  it("sin cobertura es informativa", () => {
    expect(estadoGarantia({ cubreHasta: null, cubreHastaKm: null }, { hoy: HOY, kilometraje: 10 })).toBe("SIN_COBERTURA");
  });
});
