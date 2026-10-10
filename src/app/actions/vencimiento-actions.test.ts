import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));
const mockVehiculoFindMany = vi.fn();
const mockVehiculoFindUnique = vi.fn();
const mockAvisoUpsert = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    vehiculo: { findMany: mockVehiculoFindMany, findUnique: mockVehiculoFindUnique },
    avisoVencimiento: { upsert: mockAvisoUpsert },
    configuracionTaller: { findUnique: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenant: { findUnique: vi.fn().mockResolvedValue({ nombre: "Taller Pérez", slug: "taller-perez" }) } },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { listVencimientos, registrarAvisoWhatsappAction } from "./vencimiento-actions";

const SESION = { user: { id: "u1", role: "RECEPCION", tenantSchema: "taller_perez" } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T15:00:00Z"));
  mockRequireSession.mockReset().mockResolvedValue(SESION);
  mockRequireRole.mockReset().mockResolvedValue(SESION);
  mockVehiculoFindMany.mockReset();
  mockVehiculoFindUnique.mockReset();
  mockAvisoUpsert.mockReset().mockResolvedValue({});
});

describe("listVencimientos", () => {
  it("una fila por documento que requiere aviso, ordenadas por días restantes", async () => {
    mockVehiculoFindMany.mockResolvedValue([
      {
        id: "v1", placa: "ABC123", tipo: "CARRO",
        soatVence: new Date("2026-10-20T00:00:00Z"), tecnomecanicaVence: new Date("2026-09-01T00:00:00Z"),
        cliente: { nombre: "Ana", telefono: "3105550142" },
        avisosVencimiento: [
          { tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"), canal: "EMAIL", enviadoAt: new Date("2026-10-01T10:00:00Z") },
        ],
      },
      {
        id: "v2", placa: "XYZ987", tipo: "MOTO",
        soatVence: new Date("2027-05-01T00:00:00Z"), tecnomecanicaVence: null,
        cliente: { nombre: "Luis", telefono: null }, avisosVencimiento: [],
      },
      {
        // SOAT renovado: el aviso es de la fecha anterior, no cuenta para la actual.
        id: "v3", placa: "DEF456", tipo: "CARRO",
        soatVence: new Date("2026-10-14T00:00:00Z"), tecnomecanicaVence: null,
        cliente: { nombre: "Eva", telefono: "3105550143" },
        avisosVencimiento: [
          { tipo: "SOAT", fechaVencimiento: new Date("2025-10-14T00:00:00Z"), canal: "EMAIL", enviadoAt: new Date("2025-10-01T10:00:00Z") },
        ],
      },
    ]);

    const filas = await listVencimientos();

    expect(filas.map((f) => [f.placa, f.tipo, f.estado])).toEqual([
      ["ABC123", "TECNOMECANICA", "VENCIDO"],
      ["DEF456", "SOAT", "PROXIMO"],
      ["ABC123", "SOAT", "POR_VENCER"],
    ]);
    expect(filas[2].ultimoAviso).toEqual({ canal: "EMAIL", enviadoAt: new Date("2026-10-01T10:00:00Z") });
    // Aviso de una fecha anterior (documento renovado) no cuenta como ya avisado.
    expect(filas[1].ultimoAviso).toBeNull();
    expect(filas[0].ultimoAviso).toBeNull();
    expect(filas[0].urlWhatsapp).toMatch(/^https:\/\/wa\.me\/573105550142\?text=/);
  });
});

describe("registrarAvisoWhatsappAction", () => {
  it("exige ADMIN o RECEPCION", async () => {
    mockVehiculoFindUnique.mockResolvedValue(null);
    await registrarAvisoWhatsappAction("v1", "SOAT");
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("registra el aviso WHATSAPP con el usuario que lo envió", async () => {
    mockVehiculoFindUnique.mockResolvedValue({
      soatVence: new Date("2026-10-20T00:00:00Z"), tecnomecanicaVence: null, cliente: { telefono: "3105550142" },
    });
    const r = await registrarAvisoWhatsappAction("v1", "SOAT");
    expect(r).toEqual({ error: null });
    expect(mockAvisoUpsert).toHaveBeenCalledWith({
      where: {
        vehiculoId_tipo_fechaVencimiento_canal: {
          vehiculoId: "v1", tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"), canal: "WHATSAPP",
        },
      },
      create: {
        vehiculoId: "v1", tipo: "SOAT", fechaVencimiento: new Date("2026-10-20T00:00:00Z"), canal: "WHATSAPP",
        destino: "3105550142", enviadoPorId: "u1",
      },
      update: { destino: "3105550142", enviadoPorId: "u1", enviadoAt: expect.any(Date) },
    });
  });

  it("rechaza un tipo inválido sin tocar la base de datos", async () => {
    const r = await registrarAvisoWhatsappAction("v1", "OTRO" as never);
    expect(r).toEqual({ error: "Documento inválido" });
    expect(mockVehiculoFindUnique).not.toHaveBeenCalled();
    expect(mockAvisoUpsert).not.toHaveBeenCalled();
  });

  it("devuelve un error en vez de lanzar si el upsert falla", async () => {
    mockVehiculoFindUnique.mockResolvedValue({
      soatVence: new Date("2026-10-20T00:00:00Z"), tecnomecanicaVence: null, cliente: { telefono: "3105550142" },
    });
    mockAvisoUpsert.mockRejectedValue(new Error("db down"));
    expect(await registrarAvisoWhatsappAction("v1", "SOAT")).toEqual({ error: "No se pudo registrar el aviso" });
  });

  it("error si el vehículo no existe, no tiene la fecha o el cliente no tiene teléfono", async () => {
    mockVehiculoFindUnique.mockResolvedValueOnce(null);
    expect((await registrarAvisoWhatsappAction("x", "SOAT")).error).toBe("Vehículo no encontrado");
    mockVehiculoFindUnique.mockResolvedValueOnce({ soatVence: null, tecnomecanicaVence: null, cliente: { telefono: "3105550142" } });
    expect((await registrarAvisoWhatsappAction("v1", "SOAT")).error).toBe("El vehículo no tiene fecha de vencimiento registrada");
    mockVehiculoFindUnique.mockResolvedValueOnce({ soatVence: new Date("2026-10-20T00:00:00Z"), tecnomecanicaVence: null, cliente: { telefono: null } });
    expect((await registrarAvisoWhatsappAction("v1", "SOAT")).error).toBe("El cliente no tiene teléfono registrado");
    expect(mockAvisoUpsert).not.toHaveBeenCalled();
  });
});
