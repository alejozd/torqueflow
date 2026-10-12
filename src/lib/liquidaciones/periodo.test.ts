import { describe, expect, it } from "vitest";
import {
  etiquetaPeriodo,
  periodoActual,
  periodoAnterior,
  periodoSiguiente,
  rangoDelPeriodo,
  ventanasSolapan,
} from "./periodo";

const UTC = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("periodoActual", () => {
  it("lee el periodo del calendario de Bogotá, no del UTC", () => {
    // 2026-11-01T02:00Z es el 31 de octubre a las 21:00 en Bogotá.
    const ultimoDiaOctubre = new Date("2026-11-01T02:00:00.000Z");
    expect(periodoActual("MENSUAL", ultimoDiaOctubre)).toBe("2026-10");
    expect(periodoActual("QUINCENAL", ultimoDiaOctubre)).toBe("2026-10-Q2");
  });

  it("parte la quincena el día 15/16 en hora de Bogotá", () => {
    expect(periodoActual("QUINCENAL", new Date("2026-10-11T12:00:00.000Z"))).toBe("2026-10-Q1");
    expect(periodoActual("QUINCENAL", new Date("2026-10-16T12:00:00.000Z"))).toBe("2026-10-Q2");
    // 2026-10-16T04:00Z sigue siendo el 15 de octubre en Bogotá.
    expect(periodoActual("QUINCENAL", new Date("2026-10-16T04:00:00.000Z"))).toBe("2026-10-Q1");
    expect(periodoActual("QUINCENAL", new Date("2026-10-31T12:00:00.000Z"))).toBe("2026-10-Q2");
  });

  it("usa semanas ISO de lunes a domingo", () => {
    expect(periodoActual("SEMANAL", new Date("2026-10-05T12:00:00.000Z"))).toBe("2026-W41");
    expect(periodoActual("SEMANAL", new Date("2026-10-11T12:00:00.000Z"))).toBe("2026-W41");
    expect(periodoActual("SEMANAL", new Date("2026-10-12T12:00:00.000Z"))).toBe("2026-W42");
    // El domingo 3 de enero de 2027 pertenece a la semana 53 de 2026.
    expect(periodoActual("SEMANAL", new Date("2027-01-03T12:00:00.000Z"))).toBe("2026-W53");
    expect(periodoActual("SEMANAL", new Date("2027-01-04T12:00:00.000Z"))).toBe("2027-W01");
  });

  it("devuelve el mes en curso para la frecuencia mensual", () => {
    expect(periodoActual("MENSUAL", new Date("2026-10-11T12:00:00.000Z"))).toBe("2026-10");
    expect(periodoActual("MENSUAL", new Date("2026-01-01T05:00:00.000Z"))).toBe("2026-01");
  });
});

describe("rangoDelPeriodo", () => {
  it("mensual: del día 1 al 1 del mes siguiente, medianoche UTC", () => {
    expect(rangoDelPeriodo("MENSUAL", "2026-10")).toEqual({
      gte: UTC("2026-10-01"),
      lt: UTC("2026-11-01"),
    });
    expect(rangoDelPeriodo("MENSUAL", "2026-12")).toEqual({
      gte: UTC("2026-12-01"),
      lt: UTC("2027-01-01"),
    });
  });

  it("quincenal: 1–15 y 16–fin de mes, con febrero incluido", () => {
    expect(rangoDelPeriodo("QUINCENAL", "2026-10-Q1")).toEqual({ gte: UTC("2026-10-01"), lt: UTC("2026-10-16") });
    expect(rangoDelPeriodo("QUINCENAL", "2026-10-Q2")).toEqual({ gte: UTC("2026-10-16"), lt: UTC("2026-11-01") });
    expect(rangoDelPeriodo("QUINCENAL", "2026-02-Q2")).toEqual({ gte: UTC("2026-02-16"), lt: UTC("2026-03-01") });
  });

  it("semanal: lunes a lunes", () => {
    expect(rangoDelPeriodo("SEMANAL", "2026-W41")).toEqual({ gte: UTC("2026-10-05"), lt: UTC("2026-10-12") });
    // La semana 1 puede empezar en el año anterior.
    expect(rangoDelPeriodo("SEMANAL", "2026-W01")).toEqual({ gte: UTC("2025-12-29"), lt: UTC("2026-01-05") });
    expect(rangoDelPeriodo("SEMANAL", "2026-W53")).toEqual({ gte: UTC("2026-12-28"), lt: UTC("2027-01-04") });
  });
});

describe("navegación entre periodos", () => {
  it("mensual cruza el año", () => {
    expect(periodoAnterior("MENSUAL", "2026-01")).toBe("2025-12");
    expect(periodoSiguiente("MENSUAL", "2026-12")).toBe("2027-01");
    expect(periodoAnterior("MENSUAL", "2026-10")).toBe("2026-09");
  });

  it("quincenal encadena las dos quincenas del mes", () => {
    expect(periodoAnterior("QUINCENAL", "2026-10-Q2")).toBe("2026-10-Q1");
    expect(periodoAnterior("QUINCENAL", "2026-10-Q1")).toBe("2026-09-Q2");
    expect(periodoSiguiente("QUINCENAL", "2026-10-Q1")).toBe("2026-10-Q2");
    expect(periodoSiguiente("QUINCENAL", "2026-12-Q2")).toBe("2027-01-Q1");
  });

  it("semanal respeta las semanas de 53 y el cambio de año", () => {
    expect(periodoSiguiente("SEMANAL", "2026-W52")).toBe("2026-W53");
    expect(periodoSiguiente("SEMANAL", "2026-W53")).toBe("2027-W01");
    expect(periodoAnterior("SEMANAL", "2026-W01")).toBe("2025-W52");
  });
});

describe("etiquetaPeriodo", () => {
  it("etiqueta cada frecuencia en español", () => {
    expect(etiquetaPeriodo("MENSUAL", "2026-10")).toBe("octubre de 2026");
    expect(etiquetaPeriodo("QUINCENAL", "2026-10-Q1")).toBe("1ª quincena de octubre de 2026");
    expect(etiquetaPeriodo("QUINCENAL", "2026-10-Q2")).toBe("2ª quincena de octubre de 2026");
    expect(etiquetaPeriodo("SEMANAL", "2026-W41")).toBe("semana del 5 al 11 de octubre de 2026");
  });

  it("etiqueta una semana que cruza de mes y de año", () => {
    expect(etiquetaPeriodo("SEMANAL", "2026-W40")).toBe("semana del 28 de septiembre al 4 de octubre de 2026");
    expect(etiquetaPeriodo("SEMANAL", "2026-W53")).toBe("semana del 28 de diciembre de 2026 al 3 de enero de 2027");
  });
});

describe("ventanasSolapan", () => {
  it("detecta el solapamiento entre frecuencias distintas", () => {
    // Un mes solapa con sus dos quincenas y con sus semanas.
    expect(ventanasSolapan("MENSUAL", "2026-10", "QUINCENAL", "2026-10-Q1")).toBe(true);
    expect(ventanasSolapan("MENSUAL", "2026-10", "QUINCENAL", "2026-10-Q2")).toBe(true);
    expect(ventanasSolapan("MENSUAL", "2026-10", "SEMANAL", "2026-W41")).toBe(true);
    // Periodos contiguos no solapan.
    expect(ventanasSolapan("QUINCENAL", "2026-10-Q1", "QUINCENAL", "2026-10-Q2")).toBe(false);
    expect(ventanasSolapan("MENSUAL", "2026-10", "MENSUAL", "2026-09")).toBe(false);
    expect(ventanasSolapan("SEMANAL", "2026-W41", "SEMANAL", "2026-W42")).toBe(false);
    // Una semana del mes siguiente tampoco solapa.
    expect(ventanasSolapan("MENSUAL", "2026-10", "SEMANAL", "2026-W45")).toBe(false);
  });

  it("una quincena solapa con la semana que la contiene", () => {
    expect(ventanasSolapan("QUINCENAL", "2026-10-Q2", "SEMANAL", "2026-W42")).toBe(true);
  });
});
