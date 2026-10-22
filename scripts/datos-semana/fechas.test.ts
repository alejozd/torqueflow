import { describe, expect, it } from "vitest";
import { diasDelRango, hoyBogota, instante, soloDia, sumarDias } from "./fechas";

describe("fechas", () => {
  it("diasDelRango excluye domingos e incluye los extremos", () => {
    // 2026-10-19 es lunes; 2026-10-25 es domingo
    expect(diasDelRango("2026-10-19", "2026-10-25")).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24",
    ]);
  });
  it("instante usa hora de Bogotá (UTC-5)", () => {
    expect(instante("2026-10-20", "07:30").toISOString()).toBe("2026-10-20T12:30:00.000Z");
  });
  it("soloDia es medianoche UTC", () => {
    expect(soloDia("2026-10-20").toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });
  it("hoyBogota corta a medianoche de Bogotá", () => {
    expect(hoyBogota(new Date("2026-10-21T03:00:00.000Z"))).toBe("2026-10-20");
  });
  it("sumarDias cruza meses", () => {
    expect(sumarDias("2026-10-30", 3)).toBe("2026-11-02");
  });
});
