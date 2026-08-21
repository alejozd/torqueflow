import { describe, expect, it } from "vitest";
import { reporteFiltrosSchema } from "./reporte";

describe("reporteFiltrosSchema", () => {
  it("accepts a valid range with an explicit sedeId", () => {
    const result = reporteFiltrosSchema.safeParse({
      desde: "2026-08-01",
      hasta: "2026-08-21",
      sedeId: "sede-1",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ desde: "2026-08-01", hasta: "2026-08-21", sedeId: "sede-1" });
  });

  it("accepts an empty sedeId (the caller will fall back to the tenant's default sede)", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-08-01", hasta: "2026-08-21", sedeId: "" });

    expect(result.success).toBe(true);
  });

  it("accepts an omitted sedeId", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-08-01", hasta: "2026-08-21" });

    expect(result.success).toBe(true);
  });

  it("rejects a missing date", () => {
    const result = reporteFiltrosSchema.safeParse({ hasta: "2026-08-21" });

    expect(result.success).toBe(false);
  });

  it("rejects a malformed date string", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "01/08/2026", hasta: "2026-08-21" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("La fecha debe tener el formato AAAA-MM-DD");
  });

  it("rejects a well-formatted but non-existent calendar date", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-02-31", hasta: "2026-03-01" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("La fecha no existe en el calendario");
  });

  it("rejects a range whose start is after its end", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-08-22", hasta: "2026-08-21" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("La fecha inicial no puede ser posterior a la final");
  });

  it("accepts a single-day range where start equals end", () => {
    const result = reporteFiltrosSchema.safeParse({ desde: "2026-08-21", hasta: "2026-08-21" });

    expect(result.success).toBe(true);
  });
});
