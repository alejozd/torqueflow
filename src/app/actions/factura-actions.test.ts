import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockOrdenFindFirst = vi.fn();
const mockFacturaFindMany = vi.fn();
const mockFacturaFindFirst = vi.fn();
const mockFacturaCreate = vi.fn();
const mockRepuestoUpdateMany = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({ factura: { create: mockFacturaCreate }, repuesto: { updateMany: mockRepuestoUpdateMany } }),
);
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: { findFirst: mockOrdenFindFirst },
    factura: { findMany: mockFacturaFindMany, findFirst: mockFacturaFindFirst },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { crearFacturaAction, listFacturas, getFactura, type FacturaFormState } from "./factura-actions";

const initialState: FacturaFormState = { error: null, success: false, facturaId: null };
const SESSION_ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_TECNICO = { user: { role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

function baseOrden(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    estado: "TERMINADA",
    clienteId: "c1",
    factura: null,
    items: [
      { id: "i1", repuestoId: "r1", cantidad: 2, precioUnitario: "18.9" },
      { id: "i2", repuestoId: null, cantidad: 4, precioUnitario: "15" },
    ],
    manoDeObra: [{ id: "m1", valor: "30" }],
    ...overrides,
  };
}

describe("crearFacturaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockOrdenFindFirst.mockReset().mockResolvedValue(baseOrden());
    mockFacturaCreate.mockReset().mockResolvedValue({ id: "f1" });
    mockRepuestoUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mockTransaction.mockClear();
  });

  it("returns an error when the orden does not exist", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({ error: "Orden no encontrada", success: false, facturaId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the orden already has a factura", async () => {
    mockOrdenFindFirst.mockResolvedValue(baseOrden({ factura: { id: "f0" } }));

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({ error: "Esta orden ya tiene una factura generada", success: false, facturaId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the orden is not in an invoiceable estado", async () => {
    mockOrdenFindFirst.mockResolvedValue(baseOrden({ estado: "EN_PROCESO" }));

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Debe estar Terminada o Entregada/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the discount exceeds the subtotal", async () => {
    const formData = new FormData();
    formData.set("descuento", "9999");

    const result = await crearFacturaAction("o1", initialState, formData);

    expect(result).toEqual({ error: "El descuento no puede ser mayor al subtotal", success: false, facturaId: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("computes totals, creates the factura, and atomically decrements stock only for catalog-linked items", async () => {
    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({ error: null, success: true, facturaId: "f1" });
    expect(mockFacturaCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        clienteId: "c1",
        subtotal: 127.8,
        descuento: 0,
        iva: 24.28,
        total: 152.08,
        saldoPendiente: 152.08,
        emitidaPorId: "u1",
        estado: "PENDIENTE",
      },
    });
    expect(mockRepuestoUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockRepuestoUpdateMany).toHaveBeenCalledWith({
      where: { id: "r1", stockActual: { gte: 2 } },
      data: { stockActual: { decrement: 2 } },
    });
  });

  it("applies a valid discount to the totals", async () => {
    const formData = new FormData();
    formData.set("descuento", "10");

    await crearFacturaAction("o1", initialState, formData);

    expect(mockFacturaCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ descuento: 10, iva: 22.38, total: 140.18 }) }),
    );
  });

  it("sums cantidad across multiple items linked to the same repuesto into a single decrement", async () => {
    mockOrdenFindFirst.mockResolvedValue(
      baseOrden({
        items: [
          { id: "i1", repuestoId: "r1", cantidad: 2, precioUnitario: "18.9" },
          { id: "i2", repuestoId: "r1", cantidad: 3, precioUnitario: "18.9" },
        ],
      }),
    );

    await crearFacturaAction("o1", initialState, new FormData());

    expect(mockRepuestoUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockRepuestoUpdateMany).toHaveBeenCalledWith({
      where: { id: "r1", stockActual: { gte: 5 } },
      data: { stockActual: { decrement: 5 } },
    });
  });

  it("returns a friendly error and does not decrement stock further when there is insufficient stock for a repuesto", async () => {
    mockRepuestoUpdateMany.mockResolvedValue({ count: 0 });

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({
      error: "Stock insuficiente para uno de los repuestos de esta orden",
      success: false,
      facturaId: null,
    });
  });

  it("returns the friendly duplicate-factura message when factura.create races on the unique ordenId constraint (P2002)", async () => {
    mockFacturaCreate.mockReset().mockRejectedValue({ code: "P2002" });

    const result = await crearFacturaAction("o1", initialState, new FormData());

    expect(result).toEqual({
      error: "Ya existe un registro con ese valor.",
      success: false,
      facturaId: null,
    });
  });

  it("creates the factura as PAGADA (not PENDIENTE) when a 100% discount zeroes the total", async () => {
    const formData = new FormData();
    formData.set("descuento", "127.8");

    await crearFacturaAction("o1", initialState, formData);

    expect(mockFacturaCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 0, estado: "PAGADA" }) }),
    );
  });

  it("refuses to invoice an orden from another sede", async () => {
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);

    const result = await crearFacturaAction("orden-de-otra-sede", initialState, new FormData());

    expect(result).toEqual({ error: "Orden no encontrada", success: false, facturaId: null });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      include: { items: true, manoDeObra: true, factura: { select: { id: true } } },
    });
  });
});

describe("listFacturas", () => {
  it("lists only facturas whose orden belongs to the sede activa", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockFacturaFindMany.mockReset().mockResolvedValue([]);

    await listFacturas();

    expect(mockFacturaFindMany).toHaveBeenCalledWith({
      where: { orden: { sedeId: "sede-1" } },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });

  it("combines the estado filter with the sede filter", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockFacturaFindMany.mockReset().mockResolvedValue([]);

    await listFacturas("PENDIENTE");

    expect(mockFacturaFindMany).toHaveBeenCalledWith({
      where: { orden: { sedeId: "sede-1" }, estado: "PENDIENTE" },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getFactura", () => {
  it("fetches a single factura by id with full detail, scoped to the sede activa", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockFacturaFindFirst.mockReset().mockResolvedValue({ id: "f1" });

    const result = await getFactura("f1");

    expect(result).toEqual({ id: "f1" });
    expect(mockFacturaFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "f1", orden: { sedeId: "sede-1" } } }),
    );
  });

  it("returns null for a factura belonging to another sede", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockFacturaFindFirst.mockReset().mockResolvedValue(null);

    await expect(getFactura("f-otra-sede")).resolves.toBeNull();
    expect(mockFacturaFindFirst).toHaveBeenCalledWith({
      where: { id: "f-otra-sede", orden: { sedeId: "sede-1" } },
      include: expect.anything(),
    });
  });
});
