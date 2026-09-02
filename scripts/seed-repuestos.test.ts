import { describe, expect, it, beforeEach, vi } from "vitest";
import { seedRepuestos, PARTES, MARCAS } from "./seed-repuestos";

vi.mock("@/lib/db/tenant-client");

describe("seedRepuestos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates repuestos with deterministic SEED-XXXX codigo format", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1", codigo: "SEED-0001" });
    const mockBodegaFindFirst = vi.fn().mockResolvedValue({ id: "bodega-1" });

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    const result = await seedRepuestos({
      schemaName: "test_schema",
      count: 3,
      bodegaId: "bodega-1",
    });

    expect(result.created).toBe(3);
    expect(result.bodegaId).toBe("bodega-1");
    expect(mockRepuestoUpsert).toHaveBeenCalledTimes(3);

    // Verify SEED-XXXX format
    const firstCall = mockRepuestoUpsert.mock.calls[0][0];
    expect(firstCall.where.codigo).toBe("SEED-0001");

    const secondCall = mockRepuestoUpsert.mock.calls[1][0];
    expect(secondCall.where.codigo).toBe("SEED-0002");

    const thirdCall = mockRepuestoUpsert.mock.calls[2][0];
    expect(thirdCall.where.codigo).toBe("SEED-0003");
  });

  it("uses provided bodegaId without calling bodega.findFirst", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1" });
    const mockBodegaFindFirst = vi.fn();

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    await seedRepuestos({
      schemaName: "test_schema",
      count: 1,
      bodegaId: "bodega-provided",
    });

    expect(mockBodegaFindFirst).not.toHaveBeenCalled();
    expect(mockRepuestoUpsert.mock.calls[0][0].create.bodegaId).toBe("bodega-provided");
  });

  it("calls bodega.findFirst with orderBy createdAt asc when bodegaId is omitted", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1" });
    const mockBodegaFindFirst = vi.fn().mockResolvedValue({ id: "bodega-oldest" });

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    await seedRepuestos({
      schemaName: "test_schema",
      count: 1,
    });

    expect(mockBodegaFindFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    expect(mockRepuestoUpsert.mock.calls[0][0].create.bodegaId).toBe("bodega-oldest");
  });

  it("generates realistic nombres combining partes and marcas from vocabulary", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1" });
    const mockBodegaFindFirst = vi.fn().mockResolvedValue({ id: "bodega-1" });

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    await seedRepuestos({
      schemaName: "test_schema",
      count: 5,
      bodegaId: "bodega-1",
    });

    const nombres = mockRepuestoUpsert.mock.calls.map((call) => call[0].create.nombre);

    // Assert first few names match exact deterministic sequence from seeding function
    // For i=1: parteIndex=(1-1)%PARTES.length=0, marcaIndex=floor((1-1)/PARTES.length)%MARCAS.length=0
    // → PARTES[0] + " " + MARCAS[0]
    expect(nombres[0]).toBe(`${PARTES[0]} ${MARCAS[0]}`);
    expect(nombres[1]).toBe(`${PARTES[1]} ${MARCAS[0]}`);
    expect(nombres[4]).toBe(`${PARTES[4]} ${MARCAS[0]}`);

    // Verify all names are built from real vocabulary
    // Format: "Parte Marca" where last word is the marca
    const marcaSet = new Set(MARCAS);
    nombres.forEach((nombre) => {
      const lastSpaceIndex = nombre.lastIndexOf(" ");
      expect(lastSpaceIndex).toBeGreaterThan(0);

      const marca = nombre.substring(lastSpaceIndex + 1);
      const parte = nombre.substring(0, lastSpaceIndex);

      // Marca must be one from MARCAS array
      expect(marcaSet.has(marca)).toBe(true);

      // Parte must be one from PARTES array
      expect(PARTES.includes(parte)).toBe(true);
    });

    // Should have all unique names for 5 items (since we have 65 partes × 20 marcas = 1300 combinations)
    const uniqueNames = new Set(nombres);
    expect(uniqueNames.size).toBe(nombres.length);
  });

  it("generates realistic pricing with precioVenta as markup of precioCompra", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1" });
    const mockBodegaFindFirst = vi.fn().mockResolvedValue({ id: "bodega-1" });

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    await seedRepuestos({
      schemaName: "test_schema",
      count: 10,
      bodegaId: "bodega-1",
    });

    mockRepuestoUpsert.mock.calls.forEach((call) => {
      const { precioCompra, precioVenta } = call[0].create;
      const precioCompraNum = Number(precioCompra);
      const precioVentaNum = Number(precioVenta);

      // precioVenta should be between 1.2 and 1.6x precioCompra
      const markup = precioVentaNum / precioCompraNum;
      expect(markup).toBeGreaterThanOrEqual(1.2);
      expect(markup).toBeLessThanOrEqual(1.6);

      // Prices should be in plausible range (5k to 150k COP)
      expect(precioCompraNum).toBeGreaterThanOrEqual(5000);
      expect(precioCompraNum).toBeLessThanOrEqual(150000);
    });
  });

  it("sets stockActual and stockMinimo to reasonable values", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1" });
    const mockBodegaFindFirst = vi.fn().mockResolvedValue({ id: "bodega-1" });

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    await seedRepuestos({
      schemaName: "test_schema",
      count: 10,
      bodegaId: "bodega-1",
    });

    mockRepuestoUpsert.mock.calls.forEach((call) => {
      const { stockActual, stockMinimo } = call[0].create;

      expect(stockActual).toBeGreaterThanOrEqual(0);
      expect(stockActual).toBeLessThanOrEqual(50);
      expect(stockMinimo).toBeGreaterThanOrEqual(2);
      expect(stockMinimo).toBeLessThanOrEqual(10);
    });
  });

  it("leaves descripcion as null", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1" });
    const mockBodegaFindFirst = vi.fn().mockResolvedValue({ id: "bodega-1" });

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    await seedRepuestos({
      schemaName: "test_schema",
      count: 1,
      bodegaId: "bodega-1",
    });

    const { descripcion } = mockRepuestoUpsert.mock.calls[0][0].create;
    expect(descripcion).toBeNull();
  });

  it("leaves proveedorId as null", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1" });
    const mockBodegaFindFirst = vi.fn().mockResolvedValue({ id: "bodega-1" });

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    await seedRepuestos({
      schemaName: "test_schema",
      count: 1,
      bodegaId: "bodega-1",
    });

    const { proveedorId } = mockRepuestoUpsert.mock.calls[0][0].create;
    expect(proveedorId).toBeNull();
  });

  it("returns correct created count and bodegaId", async () => {
    const { getTenantDb } = await import("@/lib/db/tenant-client");
    const mockRepuestoUpsert = vi.fn().mockResolvedValue({ id: "rep-1" });
    const mockBodegaFindFirst = vi.fn().mockResolvedValue({ id: "bodega-test-123" });

    (getTenantDb as any).mockReturnValue({
      repuesto: { upsert: mockRepuestoUpsert },
      bodega: { findFirst: mockBodegaFindFirst },
    });

    const result = await seedRepuestos({
      schemaName: "test_schema",
      count: 150,
      bodegaId: "bodega-test-123",
    });

    expect(result.created).toBe(150);
    expect(result.bodegaId).toBe("bodega-test-123");
  });
});
