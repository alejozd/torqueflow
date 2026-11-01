import { describe, expect, it } from "vitest";
import { crearAzar } from "./azar";
import { franjasDelDia, planCitasFuturas, validarRangoFuturo } from "./citas-futuras";

describe("validarRangoFuturo", () => {
  it("acepta de hoy a una semana", () => {
    expect(validarRangoFuturo("2026-11-01", "2026-11-07", "2026-11-01")).toBeNull();
  });

  it("rechaza fechas pasadas, rangos invertidos y de más de 31 días", () => {
    expect(validarRangoFuturo("2026-10-31", "2026-11-07", "2026-11-01")).toMatch(/hoy o después/);
    expect(validarRangoFuturo("2026-11-07", "2026-11-02", "2026-11-01")).toMatch(/posterior/);
    expect(validarRangoFuturo("2026-11-01", "2026-12-02", "2026-11-01")).toMatch(/31 días/);
    expect(validarRangoFuturo("2026-11-1", "2026-11-07", "2026-11-01")).toMatch(/AAAA-MM-DD/);
  });
});

describe("franjasDelDia", () => {
  it("un día futuro tiene la grilla completa de 7:00 a 17:30", () => {
    const f = franjasDelDia("2026-11-02", "2026-11-01", "10:00");
    expect(f[0]).toBe("07:00");
    expect(f.at(-1)).toBe("17:30");
    expect(f).toHaveLength(22);
  });

  it("hoy solo deja las franjas que aún no pasaron", () => {
    expect(franjasDelDia("2026-11-01", "2026-11-01", "16:30")).toEqual(["17:00", "17:30"]);
  });
});

describe("planCitasFuturas", () => {
  it("salta domingos, no repite franja por sede y día, y todo queda en el futuro", () => {
    // 2026-11-01 es domingo.
    const plan = planCitasFuturas("2026-11-01", "2026-11-07", ["s1", "s2"], 4, "2026-11-01", "09:00", crearAzar(7));
    expect(plan).toHaveLength(6 * 2 * 4);
    expect(plan.some((c) => c.fecha === "2026-11-01")).toBe(false);
    const claves = plan.map((c) => `${c.sedeId}|${c.fecha}|${c.hora}`);
    expect(new Set(claves).size).toBe(claves.length);
    expect(plan.every((c) => c.estado === "PROGRAMADA" || c.estado === "CONFIRMADA")).toBe(true);
  });

  it("si hoy quedan pocas franjas, crea solo esas", () => {
    const plan = planCitasFuturas("2026-11-02", "2026-11-02", ["s1"], 5, "2026-11-02", "17:10", crearAzar(1));
    expect(plan.map((c) => c.hora)).toEqual(["17:30"]);
  });
});
