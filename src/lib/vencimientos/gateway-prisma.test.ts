import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.fn();
const mockUpsert = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    vehiculo: { findMany: mockFindMany },
    avisoVencimiento: { upsert: mockUpsert },
    configuracionTaller: { findUnique: vi.fn().mockResolvedValue(null) },
  }),
}));

import { prismaAvisosGateway } from "./gateway-prisma";

const DESDE = new Date("2026-09-10T00:00:00Z");
const HASTA = new Date("2026-11-09T00:00:00Z");

function vehiculo(soatVence: Date, fechaAviso: Date) {
  return {
    id: "v1",
    placa: "ABC123",
    soatVence,
    tecnomecanicaVence: null,
    cliente: { nombre: "Ana", email: "ana@cliente.test" },
    avisosVencimiento: [{ tipo: "SOAT", fechaVencimiento: fechaAviso }],
  };
}

describe("prismaAvisosGateway.listarDocumentosParaAviso", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpsert.mockReset().mockResolvedValue({});
  });

  it("un aviso EMAIL de una fecha anterior (documento renovado) no cuenta como ya avisado", async () => {
    const actual = new Date("2026-10-20T00:00:00Z");
    mockFindMany.mockResolvedValue([vehiculo(actual, new Date("2025-10-20T00:00:00Z"))]);
    const [doc] = await prismaAvisosGateway.listarDocumentosParaAviso("taller_perez", DESDE, HASTA);
    expect(doc.yaAvisadoPorEmail).toBe(false);
  });

  it("un aviso EMAIL de la misma fecha sí cuenta como ya avisado", async () => {
    const actual = new Date("2026-10-20T00:00:00Z");
    mockFindMany.mockResolvedValue([vehiculo(actual, new Date("2026-10-20T00:00:00Z"))]);
    const [doc] = await prismaAvisosGateway.listarDocumentosParaAviso("taller_perez", DESDE, HASTA);
    expect(doc.yaAvisadoPorEmail).toBe(true);
  });
});

describe("prismaAvisosGateway.registrarAviso", () => {
  beforeEach(() => mockUpsert.mockReset().mockResolvedValue({}));

  it("hace upsert por vehiculoId_tipo_fechaVencimiento_canal", async () => {
    const fechaVencimiento = new Date("2026-10-20T00:00:00Z");
    const enviadoAt = new Date("2026-10-10T15:00:00Z");
    await prismaAvisosGateway.registrarAviso("taller_perez", {
      vehiculoId: "v1",
      tipo: "SOAT",
      fechaVencimiento,
      canal: "EMAIL",
      destino: "ana@cliente.test",
      enviadoPorId: null,
      enviadoAt,
    } as never);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        vehiculoId_tipo_fechaVencimiento_canal: { vehiculoId: "v1", tipo: "SOAT", fechaVencimiento, canal: "EMAIL" },
      },
      create: {
        vehiculoId: "v1", tipo: "SOAT", fechaVencimiento, canal: "EMAIL",
        destino: "ana@cliente.test", enviadoPorId: null, enviadoAt,
      },
      update: { destino: "ana@cliente.test", enviadoPorId: null, enviadoAt },
    });
  });
});
