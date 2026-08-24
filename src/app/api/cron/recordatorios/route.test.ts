import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockEjecutar = vi.fn();
vi.mock("@/lib/recordatorios/ejecutar-recordatorios", () => ({
  ejecutarRecordatorios: (...args: unknown[]) => mockEjecutar(...args),
}));

vi.mock("@/lib/recordatorios/gateway-prisma", () => ({ prismaRecordatoriosGateway: {} }));
vi.mock("@/lib/email/enviar-email", () => ({ enviarEmail: vi.fn() }));
vi.mock("@/lib/email/smtp-config", () => ({ descifrarConfiguracionSmtp: vi.fn() }));

const mockTenantFindMany = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findMany: (...args: unknown[]) => mockTenantFindMany(...args) } },
}));

import { GET } from "./route";

const SECRETO = "s3cr3t0-de-cron";
const secretoOriginal = process.env.CRON_SECRET;

const RESUMEN = {
  tenantsProcesados: 2,
  tenantsSinSmtp: 1,
  vehiculosEvaluados: 9,
  enviados: 3,
  omitidosPorCooldown: 1,
  omitidosSinEmail: 2,
  fallidos: 0,
  errores: [],
};

function pedido(authorization?: string): NextRequest {
  return {
    headers: { get: (nombre: string) => (nombre.toLowerCase() === "authorization" ? authorization ?? null : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRETO;
  mockEjecutar.mockReset().mockResolvedValue(RESUMEN);
  mockTenantFindMany.mockReset().mockResolvedValue([{ schemaName: "taller_perez" }]);
});

afterEach(() => {
  if (secretoOriginal === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = secretoOriginal;
  }
});

describe("GET /api/cron/recordatorios", () => {
  it("runs the sweep and returns its summary for a correct secret", async () => {
    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RESUMEN);
    expect(mockEjecutar).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing Authorization header without running anything", async () => {
    const response = await GET(pedido(undefined));

    expect(response.status).toBe(401);
    expect(mockEjecutar).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const response = await GET(pedido("Bearer equivocado"));

    expect(response.status).toBe(401);
    expect(mockEjecutar).not.toHaveBeenCalled();
  });

  it("rejects a secret sent without the Bearer scheme", async () => {
    const response = await GET(pedido(SECRETO));

    expect(response.status).toBe(401);
    expect(mockEjecutar).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is not configured at all", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(pedido("Bearer cualquier-cosa"));

    expect(response.status).toBe(401);
    expect(mockEjecutar).not.toHaveBeenCalled();
  });

  it("also refuses an empty Bearer value when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(pedido("Bearer "));

    expect(response.status).toBe(401);
  });

  it("enumerates tenants from the public schema and injects a real clock", async () => {
    await GET(pedido(`Bearer ${SECRETO}`));

    const deps = mockEjecutar.mock.calls[0][0];
    await deps.listarTenants();

    expect(mockTenantFindMany).toHaveBeenCalledWith({ select: { schemaName: true } });
    expect(deps.ahora).toBeInstanceOf(Date);
  });

  it("returns 500 with a generic message when the sweep itself throws, leaking no internals", async () => {
    mockEjecutar.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.7:5432"));

    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.status).toBe(500);
    const cuerpo = await response.json();
    expect(cuerpo).toEqual({ error: "Error al ejecutar los recordatorios" });
    expect(JSON.stringify(cuerpo)).not.toContain("10.0.0.7");
  });

  it("marks the response uncacheable", async () => {
    const response = await GET(pedido(`Bearer ${SECRETO}`));

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
