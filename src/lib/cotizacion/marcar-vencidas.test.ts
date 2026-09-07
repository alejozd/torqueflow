import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  marcarCotizacionesVencidas,
  type CotizacionesVencidasGateway,
  type MarcarCotizacionesVencidasDeps,
} from "./marcar-vencidas";

const AHORA = new Date("2026-09-07T00:00:00Z");

let mockMarcarVencidas: Mock;

function construirDeps(tenants: { schemaName: string }[] = [{ schemaName: "taller_perez" }]): MarcarCotizacionesVencidasDeps {
  const gateway: CotizacionesVencidasGateway = {
    marcarVencidas: (schemaName: string, ahora: Date) => mockMarcarVencidas(schemaName, ahora),
  };

  return {
    listarTenants: async () => tenants,
    gateway,
    ahora: AHORA,
  };
}

beforeEach(() => {
  mockMarcarVencidas = vi.fn().mockResolvedValue(0);
});

describe("marcarCotizacionesVencidas", () => {
  it("sums the updated row count across tenants", async () => {
    mockMarcarVencidas.mockResolvedValueOnce(3).mockResolvedValueOnce(2);

    const resumen = await marcarCotizacionesVencidas(
      construirDeps([{ schemaName: "taller_perez" }, { schemaName: "taller_otro" }]),
    );

    expect(resumen.cotizacionesVencidas).toBe(5);
    expect(resumen.tenantsProcesados).toBe(2);
    expect(resumen.errores).toEqual([]);
    expect(mockMarcarVencidas).toHaveBeenNthCalledWith(1, "taller_perez", AHORA);
    expect(mockMarcarVencidas).toHaveBeenNthCalledWith(2, "taller_otro", AHORA);
  });

  it("isolates one tenant's failure from the rest", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockMarcarVencidas.mockImplementation(async (schema: string) => {
      if (schema === "taller_roto") throw new Error("schema no existe");
      return 4;
    });

    const resumen = await marcarCotizacionesVencidas(
      construirDeps([{ schemaName: "taller_roto" }, { schemaName: "taller_perez" }]),
    );

    expect(resumen.cotizacionesVencidas).toBe(4);
    expect(resumen.tenantsProcesados).toBe(1);
    expect(resumen.errores).toHaveLength(1);
    expect(resumen.errores[0]).toContain("taller_roto");
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("caps the number of reported errors", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockMarcarVencidas.mockRejectedValue(new Error("boom"));
    const tenants = Array.from({ length: 60 }, (_, i) => ({ schemaName: `taller_${i}` }));

    const resumen = await marcarCotizacionesVencidas(construirDeps(tenants));

    expect(resumen.errores.length).toBeLessThan(60);
    expect(resumen.tenantsProcesados).toBe(0);
    consoleErrorSpy.mockRestore();
  });

  it("returns zeroes and does not throw when there are no tenants at all", async () => {
    const resumen = await marcarCotizacionesVencidas(construirDeps([]));

    expect(resumen).toEqual({ tenantsProcesados: 0, cotizacionesVencidas: 0, errores: [] });
  });
});
