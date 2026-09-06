import { describe, expect, it } from "vitest";
import { esCotizacionPendienteDeSeguimiento } from "./seguimiento-pendiente";

// 2026-09-05T15:00:00Z = 2026-09-05 10:00am America/Bogota (UTC-5), so
// inicioDiaBogota(AHORA) = 2026-09-05T05:00:00Z.
const AHORA = new Date("2026-09-05T15:00:00Z");

describe("esCotizacionPendienteDeSeguimiento", () => {
  it("is false when there is no seguimiento at all", () => {
    expect(esCotizacionPendienteDeSeguimiento({ estado: "ENVIADA" }, undefined, AHORA)).toBe(false);
    expect(esCotizacionPendienteDeSeguimiento({ estado: "ENVIADA" }, null, AHORA)).toBe(false);
  });

  it("is false when the latest seguimiento has no proximoSeguimiento scheduled", () => {
    expect(
      esCotizacionPendienteDeSeguimiento({ estado: "ENVIADA" }, { proximoSeguimiento: null }, AHORA),
    ).toBe(false);
  });

  it("is true when proximoSeguimiento is in the past and the cotización is still open", () => {
    expect(
      esCotizacionPendienteDeSeguimiento(
        { estado: "ENVIADA" },
        { proximoSeguimiento: new Date("2026-09-01T00:00:00Z") },
        AHORA,
      ),
    ).toBe(true);
  });

  it("is true when proximoSeguimiento is due today (Bogota)", () => {
    expect(
      esCotizacionPendienteDeSeguimiento(
        { estado: "BORRADOR" },
        { proximoSeguimiento: new Date("2026-09-05T00:00:00Z") },
        AHORA,
      ),
    ).toBe(true);
  });

  it("is false when proximoSeguimiento is still in the future", () => {
    expect(
      esCotizacionPendienteDeSeguimiento(
        { estado: "ENVIADA" },
        { proximoSeguimiento: new Date("2026-09-06T00:00:00Z") },
        AHORA,
      ),
    ).toBe(false);
  });

  it.each(["APROBADA", "RECHAZADA", "VENCIDA"] as const)(
    "is false for a resolved cotización (%s) even with an overdue proximoSeguimiento",
    (estado) => {
      expect(
        esCotizacionPendienteDeSeguimiento(
          { estado },
          { proximoSeguimiento: new Date("2026-09-01T00:00:00Z") },
          AHORA,
        ),
      ).toBe(false);
    },
  );
});
