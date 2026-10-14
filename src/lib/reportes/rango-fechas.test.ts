import { describe, expect, it } from "vitest";
import { buildRangoDias, buildRangoFechas, rangoMesActual } from "./rango-fechas";

describe("buildRangoFechas (instantes: createdAt, entregadaAt, fechaHora)", () => {
  it("empieza a medianoche de Bogotá del día 'desde'", () => {
    const { gte } = buildRangoFechas("2026-08-01", "2026-08-21");

    expect(gte.toISOString()).toBe("2026-08-01T05:00:00.000Z");
  });

  it("termina (exclusivo) a medianoche de Bogotá del día siguiente a 'hasta': 'hasta' entra completo", () => {
    const { lt } = buildRangoFechas("2026-08-01", "2026-08-21");

    expect(lt.toISOString()).toBe("2026-08-22T05:00:00.000Z");
  });

  it("algo ocurrido a las 8 p. m. de Bogotá del día 'hasta' entra en el rango", () => {
    // 21 de agosto, 8 p. m. en Bogotá = 22 de agosto, 1 a. m. UTC.
    const noche = new Date("2026-08-22T01:00:00.000Z");
    const { gte, lt } = buildRangoFechas("2026-08-21", "2026-08-21");

    expect(noche >= gte && noche < lt).toBe(true);
  });

  it("cruza meses y años", () => {
    expect(buildRangoFechas("2026-12-31", "2026-12-31").lt.toISOString()).toBe("2027-01-01T05:00:00.000Z");
    expect(buildRangoFechas("2028-02-28", "2028-02-29").lt.toISOString()).toBe("2028-03-01T05:00:00.000Z");
  });
});

describe("buildRangoDias (columnas de solo fecha, @db.Date)", () => {
  it("usa medianoches UTC, que es como Prisma lee y escribe un @db.Date", () => {
    expect(buildRangoDias("2026-08-01", "2026-08-21")).toEqual({
      gte: new Date("2026-08-01T00:00:00.000Z"),
      lt: new Date("2026-08-22T00:00:00.000Z"),
    });
  });
});

describe("rangoMesActual", () => {
  it("es el mes en curso en Bogotá, del día 1 hasta hoy", () => {
    expect(rangoMesActual(new Date("2026-08-21T18:30:00.000Z"))).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-21",
    });
  });

  it("a las 8 p. m. del último día del mes, en Bogotá todavía es ese mes", () => {
    // 31 de agosto, 8 p. m. en Bogotá = 1 de septiembre, 1 a. m. UTC.
    expect(rangoMesActual(new Date("2026-09-01T01:00:00.000Z"))).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-31",
    });
  });
});
