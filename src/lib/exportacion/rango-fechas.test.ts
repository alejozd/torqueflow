import { describe, expect, it } from "vitest";
import { MAX_DIAS_RANGO, rangoPorDefecto, resolverRangoExportacion, tieneRango } from "./rango-fechas";

// 17 de octubre de 2026, 22:30 en Bogotá (ya es el 18 en UTC).
const AHORA = new Date("2026-10-18T03:30:00Z");

describe("rangoPorDefecto", () => {
  it("es el mes en curso en Bogotá: del día 1 hasta hoy", () => {
    expect(rangoPorDefecto(AHORA)).toEqual({ desde: "2026-10-01", hasta: "2026-10-17" });
  });
});

describe("resolverRangoExportacion", () => {
  it("sin fechas usa el mes en curso", () => {
    const resultado = resolverRangoExportacion({}, AHORA);

    expect(resultado).toEqual({
      rango: {
        desde: "2026-10-01",
        hasta: "2026-10-17",
        gte: new Date("2026-10-01T00:00:00-05:00"),
        lt: new Date("2026-10-18T00:00:00-05:00"),
      },
    });
  });

  it("incluye el día 'hasta' completo (hora de Bogotá)", () => {
    const resultado = resolverRangoExportacion({ desde: "2026-01-31", hasta: "2026-02-28" }, AHORA);

    expect(resultado).toEqual({
      rango: {
        desde: "2026-01-31",
        hasta: "2026-02-28",
        gte: new Date("2026-01-31T05:00:00Z"),
        lt: new Date("2026-03-01T05:00:00Z"),
      },
    });
  });

  it("un solo día es un rango válido", () => {
    expect(resolverRangoExportacion({ desde: "2026-10-05", hasta: "2026-10-05" }, AHORA)).toHaveProperty("rango");
  });

  it.each([
    ["formato distinto", { desde: "05/10/2026", hasta: "2026-10-10" }],
    ["fecha que no existe", { desde: "2026-02-30", hasta: "2026-03-10" }],
    ["texto", { desde: "ayer", hasta: "hoy" }],
  ])("rechaza %s", (_caso, params) => {
    expect(resolverRangoExportacion(params, AHORA)).toEqual({ error: expect.stringMatching(/AAAA-MM-DD/) });
  });

  it("pide las dos fechas o ninguna", () => {
    expect(resolverRangoExportacion({ desde: "2026-10-01" }, AHORA)).toEqual({ error: expect.stringMatching(/ambas/) });
    expect(resolverRangoExportacion({ hasta: "2026-10-01" }, AHORA)).toEqual({ error: expect.stringMatching(/ambas/) });
  });

  it("rechaza 'desde' posterior a 'hasta'", () => {
    expect(resolverRangoExportacion({ desde: "2026-10-10", hasta: "2026-10-09" }, AHORA)).toEqual({
      error: expect.stringMatching(/posterior/),
    });
  });

  it(`acepta hasta ${MAX_DIAS_RANGO} días y rechaza uno más`, () => {
    // 2024 es bisiesto: del 1 de enero al 31 de diciembre son 366 días.
    expect(resolverRangoExportacion({ desde: "2024-01-01", hasta: "2024-12-31" }, AHORA)).toHaveProperty("rango");
    expect(resolverRangoExportacion({ desde: "2024-01-01", hasta: "2025-01-01" }, AHORA)).toEqual({
      error: expect.stringMatching(/366 días/),
    });
  });
});

describe("tieneRango", () => {
  it("solo ventas y arqueos llevan rango; cartera y cuentas por pagar son fotos del momento", () => {
    expect(tieneRango("ventas")).toBe(true);
    expect(tieneRango("arqueos")).toBe(true);
    expect(tieneRango("cartera")).toBe(false);
    expect(tieneRango("cuentas-por-pagar")).toBe(false);
  });
});
