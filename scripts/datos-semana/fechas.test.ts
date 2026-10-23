import { describe, expect, it } from "vitest";
import { acotarAlCierre, desfasar, diasDelRango, hoyBogota, instante, soloDia, sumarDias } from "./fechas";
import type { PlanDia } from "./tipos";

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
  it("desfasar suma minutos sin pasar del presente", () => {
    expect(desfasar(new Date("2026-10-20T12:30:00Z"), 5).toISOString()).toBe("2026-10-20T12:35:00.000Z");
    expect(desfasar(new Date(Date.now() + 3_600_000), 5).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("acotarAlCierre", () => {
  const dia = (...eventos: PlanDia["eventos"]): PlanDia => ({ fecha: "2026-10-20", sedeId: "s1", eventos });
  const cierre = { tipo: "cerrarCaja", hora: "18:00", diferencia: 0 } as const;

  it("deja pasar un instante anterior al cierre", () => {
    const t = instante("2026-10-20", "17:00");
    expect(acotarAlCierre(t, dia(cierre))).toEqual(t);
  });
  it("un instante posterior o igual al cierre queda estrictamente antes", () => {
    for (const hora of ["18:00", "19:30"]) {
      const r = acotarAlCierre(instante("2026-10-20", hora), dia(cierre));
      expect(r.getTime()).toBeLessThan(instante("2026-10-20", "18:00").getTime());
      expect(r.getTime()).toBeGreaterThan(instante("2026-10-20", "17:59").getTime());
    }
  });
  it("sin cierre en el día solo respeta el presente", () => {
    const futuro = new Date(Date.now() + 3_600_000);
    expect(acotarAlCierre(futuro, dia()).getTime()).toBeLessThanOrEqual(Date.now());
    const pasado = instante("2026-10-20", "23:00");
    expect(acotarAlCierre(pasado, dia())).toEqual(pasado);
  });
});
