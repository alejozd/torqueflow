import { describe, expect, it } from "vitest";
import { buildRangoFechas, rangoMesActual } from "./rango-fechas";

describe("buildRangoFechas", () => {
  it("starts at UTC midnight of 'desde'", () => {
    const { gte } = buildRangoFechas("2026-08-01", "2026-08-21");

    expect(gte.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("ends exclusively at UTC midnight of the day after 'hasta', so 'hasta' is fully included", () => {
    const { lt } = buildRangoFechas("2026-08-01", "2026-08-21");

    expect(lt.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  it("supports a single-day range", () => {
    const { gte, lt } = buildRangoFechas("2026-08-21", "2026-08-21");

    expect(gte.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-08-22T00:00:00.000Z");
  });

  it("rolls over month and year boundaries", () => {
    expect(buildRangoFechas("2026-12-31", "2026-12-31").lt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(buildRangoFechas("2028-02-28", "2028-02-29").lt.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });
});

describe("rangoMesActual", () => {
  it("returns the first day of the current UTC month through today", () => {
    expect(rangoMesActual(new Date("2026-08-21T18:30:00.000Z"))).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-21",
    });
  });

  it("zero-pads single-digit months and days", () => {
    expect(rangoMesActual(new Date("2026-01-05T00:00:00.000Z"))).toEqual({
      desde: "2026-01-01",
      hasta: "2026-01-05",
    });
  });
});
