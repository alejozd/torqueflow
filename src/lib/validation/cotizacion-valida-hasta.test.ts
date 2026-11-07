import { describe, expect, it } from "vitest";
import { crearCotizacionInputSchema } from "./cotizacion";

const base = { vehiculoId: "v1", motivo: "Frenos" };
const diaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

describe("crearCotizacionInputSchema.validaHasta", () => {
  it("el día elegido en el calendario vale hasta el final de ese día en Bogotá", () => {
    const { validaHasta } = crearCotizacionInputSchema.parse({ ...base, validaHasta: "2026-11-30" });
    expect(validaHasta?.toISOString()).toBe("2026-12-01T04:59:59.999Z");
    expect(diaBogota.format(validaHasta!)).toBe("2026-11-30");
  });

  it("una fecha completa (ISO) se respeta tal cual", () => {
    const { validaHasta } = crearCotizacionInputSchema.parse({ ...base, validaHasta: "2026-12-01T04:59:59.999Z" });
    expect(validaHasta?.toISOString()).toBe("2026-12-01T04:59:59.999Z");
  });

  it("sigue siendo opcional", () => {
    expect(crearCotizacionInputSchema.parse(base).validaHasta).toBeUndefined();
  });
});
