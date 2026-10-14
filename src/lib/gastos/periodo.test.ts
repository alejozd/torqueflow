import { describe, expect, it } from "vitest";
import {
  ETIQUETA_MES,
  fechaEnPeriodo,
  periodoActualBogota,
  periodoAnterior,
  periodoDeFechaDb,
  periodosEntre,
  rangoDelPeriodo,
  rangoInstantesDelPeriodo,
} from "./periodo";

describe("periodo", () => {
  it("periodoActualBogota usa el calendario de Bogotá", () => {
    // 1 nov 2026 02:00Z = 31 oct 2026 21:00 en Bogotá
    expect(periodoActualBogota(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
  });

  it("periodoDeFechaDb lee la fecha calendario de una columna @db.Date", () => {
    expect(periodoDeFechaDb(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
  });

  it("periodoAnterior cruza el año", () => {
    expect(periodoAnterior("2026-01")).toBe("2025-12");
    expect(periodoAnterior("2026-10")).toBe("2026-09");
  });

  it("periodosEntre se detiene tras 600 periodos", () => {
    expect(periodosEntre("1000-01", "9999-12")).toHaveLength(600);
  });

  it("periodosEntre es inclusivo y vacío si desde > hasta", () => {
    expect(periodosEntre("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(periodosEntre("2026-03", "2026-02")).toEqual([]);
  });

  it("rangoInstantesDelPeriodo corta el mes a medianoche de Bogotá (para instantes como abiertaAt)", () => {
    const r = rangoInstantesDelPeriodo("2026-12");
    expect(r.gte.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(r.lt.toISOString()).toBe("2027-01-01T05:00:00.000Z");
    // Una caja abierta el 31 de diciembre a las 8 p. m. en Bogotá es de diciembre.
    const noche = new Date("2027-01-01T01:00:00.000Z");
    expect(noche >= r.gte && noche < r.lt).toBe(true);
  });

  it("rangoDelPeriodo devuelve medianoches UTC semiabiertas", () => {
    const r = rangoDelPeriodo("2026-12");
    expect(r.gte.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r.lt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("fechaEnPeriodo arma la fecha del día dado", () => {
    expect(fechaEnPeriodo("2026-02", 28).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("ETIQUETA_MES en español", () => {
    expect(ETIQUETA_MES("2026-10")).toBe("octubre de 2026");
  });
});
