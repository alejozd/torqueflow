import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockSedeFindFirst = vi.fn();
const mockFacturaFindMany = vi.fn();
const mockOrdenFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    sede: { findFirst: mockSedeFindFirst },
    factura: { findMany: mockFacturaFindMany },
    ordenTrabajo: { findMany: mockOrdenFindMany },
  }),
}));

import { getReporteRentabilidad, getReporteProductividad } from "./reporte-actions";

const FILTROS_VALIDOS = { desde: "2026-08-01", hasta: "2026-08-21" };
const SESSION = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-activa" } };

describe("getReporteRentabilidad", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockSedeFindFirst.mockReset();
    mockFacturaFindMany.mockReset().mockResolvedValue([]);
  });

  it("is gated to ADMIN only", async () => {
    await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects an invalid range before touching the database", async () => {
    const result = await getReporteRentabilidad({ desde: "2026-08-22", hasta: "2026-08-21" });

    expect(result.error).toBe("La fecha inicial no puede ser posterior a la final");
    expect(result.filtros.sedeId).toBe("sede-activa");
    expect(result.totales.totalFacturado).toBe(0);
    expect(mockFacturaFindMany).not.toHaveBeenCalled();
  });

  it("defaults to the session's sede activa without any sede lookup", async () => {
    mockFacturaFindMany.mockReset().mockResolvedValue([]);

    const result = await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(result.filtros.sedeId).toBe("sede-activa");
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orden: { sedeId: "sede-activa" } }),
      }),
    );
  });

  it("uses an explicit sedeId when supplied, so an ADMIN can compare sedes", async () => {
    mockFacturaFindMany.mockReset().mockResolvedValue([]);

    const result = await getReporteRentabilidad({ ...FILTROS_VALIDOS, sedeId: "sede-norte" });

    expect(result.filtros.sedeId).toBe("sede-norte");
    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orden: { sedeId: "sede-norte" } }) }),
    );
  });

  it("converts Prisma Decimals to numbers and aggregates them", async () => {
    mockFacturaFindMany.mockResolvedValue([
      {
        total: "140.18",
        subtotal: "127.80",
        descuento: "10",
        orden: {
          items: [
            { cantidad: 4, repuesto: null },
            { cantidad: 2, repuesto: { precioCompra: "8" } },
          ],
          manoDeObra: [{ valor: "30" }],
        },
      },
    ]);

    const result = await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(result.error).toBeNull();
    expect(result.totales).toEqual({
      facturasCount: 1,
      totalFacturado: 140.18,
      costoRepuestos: 16,
      margen: 101.8,
      margenPorcentaje: 86.42,
      manoDeObraFacturada: 30,
    });
  });

  it("projects only the columns it needs, never a whole Usuario or a bare include", async () => {
    await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockFacturaFindMany).toHaveBeenCalledWith({
      where: expect.anything(),
      select: {
        total: true,
        subtotal: true,
        descuento: true,
        orden: {
          select: {
            items: { select: { cantidad: true, repuesto: { select: { precioCompra: true } } } },
            manoDeObra: { select: { valor: true } },
          },
        },
      },
    });
  });
});

describe("getReporteProductividad", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockSedeFindFirst.mockReset();
    mockOrdenFindMany.mockReset().mockResolvedValue([]);
  });

  it("is gated to ADMIN only", async () => {
    await getReporteProductividad(FILTROS_VALIDOS);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects an invalid range before touching the database", async () => {
    const result = await getReporteProductividad({ desde: "2026-13-01", hasta: "2026-08-21" });

    expect(result.error).toBe("La fecha no existe en el calendario");
    expect(result.filtros.sedeId).toBe("sede-activa");
    expect(result.filas).toEqual([]);
    expect(mockOrdenFindMany).not.toHaveBeenCalled();
  });

  it("queries only ENTREGADA órdenes delivered inside the range for the resolved sede", async () => {
    await getReporteProductividad(FILTROS_VALIDOS);

    expect(mockOrdenFindMany).toHaveBeenCalledWith({
      where: {
        sedeId: "sede-activa",
        estado: "ENTREGADA",
        entregadaAt: { gte: new Date("2026-08-01T00:00:00.000Z"), lt: new Date("2026-08-22T00:00:00.000Z") },
      },
      select: {
        mecanicoId: true,
        mecanico: { select: { nombre: true } },
        manoDeObra: { select: { valor: true } },
      },
    });
  });

  it("uses the explicit sedeId when supplied", async () => {
    await getReporteProductividad({ ...FILTROS_VALIDOS, sedeId: "sede-norte" });

    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockOrdenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sedeId: "sede-norte" }) }),
    );
  });

  it("productividad defaults to the session's sede activa too", async () => {
    mockOrdenFindMany.mockReset().mockResolvedValue([]);

    const result = await getReporteProductividad(FILTROS_VALIDOS);

    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(result.filtros.sedeId).toBe("sede-activa");
    expect(mockOrdenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sedeId: "sede-activa" }) }),
    );
  });

  it("productividad honours an explicit sedeId", async () => {
    mockOrdenFindMany.mockReset().mockResolvedValue([]);

    await getReporteProductividad({ ...FILTROS_VALIDOS, sedeId: "sede-norte" });

    expect(mockOrdenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sedeId: "sede-norte" }) }),
    );
  });

  it("converts Decimals to numbers and groups by técnico, keeping unassigned work visible", async () => {
    mockOrdenFindMany.mockResolvedValue([
      { mecanicoId: "t1", mecanico: { nombre: "Ana" }, manoDeObra: [{ valor: "30" }] },
      { mecanicoId: "t1", mecanico: { nombre: "Ana" }, manoDeObra: [{ valor: "40" }] },
      { mecanicoId: null, mecanico: null, manoDeObra: [] },
    ]);

    const result = await getReporteProductividad(FILTROS_VALIDOS);

    expect(result.error).toBeNull();
    expect(result.filas).toEqual([
      {
        mecanicoId: "t1",
        mecanicoNombre: "Ana",
        ordenesCompletadas: 2,
        montoManoDeObra: 70,
      },
      {
        mecanicoId: null,
        mecanicoNombre: "Sin asignar",
        ordenesCompletadas: 1,
        montoManoDeObra: 0,
      },
    ]);
  });
});
