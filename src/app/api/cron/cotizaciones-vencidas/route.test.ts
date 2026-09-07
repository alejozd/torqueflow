import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockMarcar = vi.fn();
vi.mock("@/lib/cotizacion/marcar-vencidas", () => ({
  marcarCotizacionesVencidas: (...args: unknown[]) => mockMarcar(...args),
}));

vi.mock("@/lib/cotizacion/marcar-vencidas-gateway-prisma", () => ({ prismaCotizacionesVencidasGateway: {} }));

const mockTenantFindMany = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findMany: (...args: unknown[]) => mockTenantFindMany(...args) } },
}));

import { GET } from "./route";

const SECRETO = "s3cr3t0-de-cron";
const secretoOriginal = process.env.CRON_SECRET;

const RESUMEN = {
  tenantsProcesados: 2,
  cotizacionesVencidas: 5,
  errores: [],
};

function pedido(authorization?: string): NextRequest {
  return {
    headers: { get: (nombre: string) => (nombre.toLowerCase() === "authorization" ? authorization ?? null : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRETO;
  mockMarcar.mockReset().mockResolvedValue(RESUMEN);
  mockTenantFindMany.mockReset().mockResolvedValue([{ schemaName: "taller_perez" }]);
});

afterEach(() => {
  if (secretoOriginal === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = secretoOriginal;
  }
});

describe("GET /api/cron/cotizaciones-vencidas", () => {
  it("runs the sweep and returns its summary for a correct secret", async () => {
    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RESUMEN);
    expect(mockMarcar).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing Authorization header without running anything", async () => {
    const response = await GET(pedido(undefined));

    expect(response.status).toBe(401);
    expect(mockMarcar).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const response = await GET(pedido("Bearer equivocado"));

    expect(response.status).toBe(401);
    expect(mockMarcar).not.toHaveBeenCalled();
  });

  it("rejects a secret sent without the Bearer scheme", async () => {
    const response = await GET(pedido(SECRETO));

    expect(response.status).toBe(401);
    expect(mockMarcar).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is not configured at all", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(pedido("Bearer cualquier-cosa"));

    expect(response.status).toBe(401);
    expect(mockMarcar).not.toHaveBeenCalled();
  });

  it("also refuses an empty Bearer value when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(pedido("Bearer "));

    expect(response.status).toBe(401);
  });

  it("enumerates tenants from the public schema and injects a real clock", async () => {
    await GET(pedido(`Bearer ${SECRETO}`));

    const deps = mockMarcar.mock.calls[0][0];
    await deps.listarTenants();

    expect(mockTenantFindMany).toHaveBeenCalledWith({ select: { schemaName: true } });
    expect(deps.ahora).toBeInstanceOf(Date);
  });

  it("returns 500 with a generic message when the sweep itself throws, leaking no internals", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockMarcar.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.7:5432"));

    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.status).toBe(500);
    const cuerpo = await response.json();
    expect(cuerpo).toEqual({ error: "Error al marcar las cotizaciones vencidas" });
    expect(JSON.stringify(cuerpo)).not.toContain("10.0.0.7");
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain("10.0.0.7");
    consoleErrorSpy.mockRestore();
  });

  it("marks the response uncacheable", async () => {
    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
