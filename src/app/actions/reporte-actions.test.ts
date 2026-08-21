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

describe("getReporteRentabilidad", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockSedeFindFirst.mockReset().mockResolvedValue({ id: "sede-default" });
    mockFacturaFindMany.mockReset().mockResolvedValue([]);
  });

  it("is gated to ADMIN only", async () => {
    await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects an invalid range before touching the database", async () => {
    const result = await getReporteRentabilidad({ desde: "2026-08-22", hasta: "2026-08-21" });

    expect(result.error).toBe("La fecha inicial no puede ser posterior a la final");
    expect(result.totales.totalFacturado).toBe(0);
    expect(mockFacturaFindMany).not.toHaveBeenCalled();
  });

  it("falls back to the tenant's oldest sede when no sedeId is supplied", async () => {
    const result = await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(mockSedeFindFirst).toHaveBeenCalledWith({ orderBy: { createdAt: "asc" }, select: { id: true } });
    expect(result.filtros.sedeId).toBe("sede-default");
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: { gte: new Date("2026-08-01T00:00:00.000Z"), lt: new Date("2026-08-22T00:00:00.000Z") },
          orden: { sedeId: "sede-default" },
        },
      }),
    );
  });

  it("uses the explicit sedeId when supplied and does not look up a default", async () => {
    await getReporteRentabilidad({ ...FILTROS_VALIDOS, sedeId: "sede-norte" });

    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockFacturaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orden: { sedeId: "sede-norte" } }) }),
    );
  });

  it("returns zeroed totals without querying facturas when the tenant has no sede", async () => {
    mockSedeFindFirst.mockResolvedValue(null);

    const result = await getReporteRentabilidad(FILTROS_VALIDOS);

    expect(result).toEqual({
      filtros: { desde: "2026-08-01", hasta: "2026-08-21", sedeId: null },
      error: null,
      totales: {
        facturasCount: 0,
        totalFacturado: 0,
        costoRepuestos: 0,
        margen: 0,
        margenPorcentaje: 0,
        manoDeObraFacturada: 0,
      },
    });
    expect(mockFacturaFindMany).not.toHaveBeenCalled();
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
          manoDeObra: [{ horas: "1.5", precioHora: "20" }],
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
            manoDeObra: { select: { horas: true, precioHora: true } },
          },
        },
      },
    });
  });
});

describe("getReporteProductividad", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockSedeFindFirst.mockReset().mockResolvedValue({ id: "sede-default" });
    mockOrdenFindMany.mockReset().mockResolvedValue([]);
  });

  it("is gated to ADMIN only", async () => {
    await getReporteProductividad(FILTROS_VALIDOS);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects an invalid range before touching the database", async () => {
    const result = await getReporteProductividad({ desde: "2026-13-01", hasta: "2026-08-21" });

    expect(result.error).toBe("La fecha no existe en el calendario");
    expect(result.filas).toEqual([]);
    expect(mockOrdenFindMany).not.toHaveBeenCalled();
  });

  it("queries only ENTREGADA órdenes delivered inside the range for the resolved sede", async () => {
    await getReporteProductividad(FILTROS_VALIDOS);

    expect(mockOrdenFindMany).toHaveBeenCalledWith({
      where: {
        sedeId: "sede-default",
        estado: "ENTREGADA",
        entregadaAt: { gte: new Date("2026-08-01T00:00:00.000Z"), lt: new Date("2026-08-22T00:00:00.000Z") },
      },
      select: {
        mecanicoId: true,
        mecanico: { select: { nombre: true } },
        manoDeObra: { select: { horas: true, precioHora: true } },
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

  it("returns an empty list without querying órdenes when the tenant has no sede", async () => {
    mockSedeFindFirst.mockResolvedValue(null);

    const result = await getReporteProductividad(FILTROS_VALIDOS);

    expect(result).toEqual({
      filtros: { desde: "2026-08-01", hasta: "2026-08-21", sedeId: null },
      error: null,
      filas: [],
    });
    expect(mockOrdenFindMany).not.toHaveBeenCalled();
  });

  it("converts Decimals to numbers and groups by técnico, keeping unassigned work visible", async () => {
    mockOrdenFindMany.mockResolvedValue([
      { mecanicoId: "t1", mecanico: { nombre: "Ana" }, manoDeObra: [{ horas: "1.5", precioHora: "20" }] },
      { mecanicoId: "t1", mecanico: { nombre: "Ana" }, manoDeObra: [{ horas: "2", precioHora: "20" }] },
      { mecanicoId: null, mecanico: null, manoDeObra: [] },
    ]);

    const result = await getReporteProductividad(FILTROS_VALIDOS);

    expect(result.error).toBeNull();
    expect(result.filas).toEqual([
      {
        mecanicoId: "t1",
        mecanicoNombre: "Ana",
        ordenesCompletadas: 2,
        horasManoDeObra: 3.5,
        montoManoDeObra: 70,
      },
      {
        mecanicoId: null,
        mecanicoNombre: "Sin asignar",
        ordenesCompletadas: 1,
        horasManoDeObra: 0,
        montoManoDeObra: 0,
      },
    ]);
  });
});
