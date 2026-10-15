import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockServicioFindMany = vi.fn();
const mockRepuestoFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    servicio: { findMany: mockServicioFindMany },
    repuesto: { findMany: mockRepuestoFindMany },
  }),
}));

import { buscarParaCotizacionAction } from "./buscar-cotizacion-actions";

const SESSION = { user: { id: "u1", role: "RECEPCION", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

beforeEach(() => {
  mockRequireRole.mockReset().mockResolvedValue(SESSION);
  mockServicioFindMany.mockReset().mockResolvedValue([]);
  mockRepuestoFindMany.mockReset().mockResolvedValue([]);
});

describe("buscarParaCotizacionAction", () => {
  it("busca repuestos de la sede activa con cada palabra en el nombre o el código", async () => {
    await buscarParaCotizacionAction("  aceite 20w ");

    expect(mockRepuestoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bodega: { sedeId: "sede-1" },
          AND: [
            {
              OR: [
                { nombre: { contains: "aceite", mode: "insensitive" } },
                { codigo: { contains: "aceite", mode: "insensitive" } },
              ],
            },
            {
              OR: [
                { nombre: { contains: "20w", mode: "insensitive" } },
                { codigo: { contains: "20w", mode: "insensitive" } },
              ],
            },
          ],
        },
        take: 8,
      }),
    );
  });

  it("solo ofrece servicios activos y resuelve el kit con los repuestos de la sede", async () => {
    await buscarParaCotizacionAction("aceite");

    expect(mockServicioFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activo: true, AND: [{ OR: [{ nombre: { contains: "aceite", mode: "insensitive" } }] }] },
        select: expect.objectContaining({
          repuestos: expect.objectContaining({ where: { repuesto: { bodega: { sedeId: "sede-1" } } } }),
        }),
      }),
    );
  });

  it("sin texto sugiere servicios y no consulta repuestos", async () => {
    const resultado = await buscarParaCotizacionAction("   ");

    expect(mockRepuestoFindMany).not.toHaveBeenCalled();
    expect(mockServicioFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activo: true, AND: [] } }));
    expect(resultado.repuestos).toEqual([]);
  });

  it("calcula conceptos, total y repuestos sin existencia de cada kit", async () => {
    mockServicioFindMany.mockResolvedValue([
      {
        id: "s1",
        nombre: "Cambio de aceite",
        precioManoObra: "98000",
        repuestos: [
          { cantidad: 4, repuesto: { precioVenta: "38000", stockActual: 12 } },
          { cantidad: 1, repuesto: { precioVenta: "35000", stockActual: 0 } },
        ],
      },
      { id: "s2", nombre: "Kit vacío", precioManoObra: "0", repuestos: [] },
    ]);

    const { kits } = await buscarParaCotizacionAction("cambio");

    expect(kits).toEqual([
      { id: "s1", nombre: "Cambio de aceite", conceptos: 3, total: 285000, repuestosSinExistencia: 1 },
    ]);
  });

  it("devuelve los repuestos con precio, existencia y bodega", async () => {
    mockRepuestoFindMany.mockResolvedValue([
      {
        id: "r1",
        codigo: "ACE-020",
        nombre: "Aceite 20W50",
        precioVenta: "38000",
        stockActual: 12,
        bodega: { nombre: "Bodega principal" },
      },
    ]);

    const { repuestos } = await buscarParaCotizacionAction("ace");

    expect(repuestos).toEqual([
      { id: "r1", codigo: "ACE-020", nombre: "Aceite 20W50", precioVenta: 38000, stockActual: 12, bodega: "Bodega principal" },
    ]);
  });

  it("exige un rol que pueda cotizar", async () => {
    await buscarParaCotizacionAction("x");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION", "TECNICO"]);
  });
});
