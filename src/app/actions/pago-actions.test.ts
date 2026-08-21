import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockFacturaFindUnique = vi.fn();
const mockFacturaUpdateMany = vi.fn();
const mockPagoCreate = vi.fn();
const mockFacturaFindUniqueOrThrow = vi.fn();
const mockFacturaUpdate = vi.fn();
const mockTransaction = vi.fn((cb: (tx: unknown) => unknown) =>
  cb({
    factura: {
      updateMany: mockFacturaUpdateMany,
      findUniqueOrThrow: mockFacturaFindUniqueOrThrow,
      update: mockFacturaUpdate,
    },
    pago: { create: mockPagoCreate },
  }),
);
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    factura: { findUnique: mockFacturaFindUnique },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { registrarPagoAction, type PagoFormState } from "./pago-actions";

const initialState: PagoFormState = { error: null, success: false };

describe("registrarPagoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockFacturaFindUnique.mockReset().mockResolvedValue({ id: "f1" });
    mockFacturaUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    mockPagoCreate.mockReset();
    mockFacturaFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "f1", saldoPendiente: "40.18" });
    mockFacturaUpdate.mockReset();
    mockTransaction.mockClear();
  });

  it("returns a validation error when monto is left blank, instead of silently defaulting to 0", async () => {
    const formData = new FormData();
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto es obligatorio", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns a validation error when monto is 0", async () => {
    const formData = new FormData();
    formData.set("monto", "0");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto debe ser mayor a 0", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns an error when the factura does not exist", async () => {
    mockFacturaFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("monto", "50");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "Factura no encontrada", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("registers a partial payment: decrements saldoPendiente atomically and leaves the factura PENDIENTE", async () => {
    const formData = new FormData();
    formData.set("monto", "100");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockFacturaUpdateMany).toHaveBeenCalledWith({
      where: { id: "f1", saldoPendiente: { gte: 100 } },
      data: { saldoPendiente: { decrement: 100 } },
    });
    expect(mockPagoCreate).toHaveBeenCalledWith({
      data: { facturaId: "f1", monto: 100, metodoPago: "EFECTIVO", referencia: null, registradoPorId: "u1" },
    });
    expect(mockFacturaUpdate).not.toHaveBeenCalled();
  });

  it("marks the factura PAGADA once saldoPendiente reaches 0", async () => {
    mockFacturaFindUniqueOrThrow.mockResolvedValue({ id: "f1", saldoPendiente: "0" });
    const formData = new FormData();
    formData.set("monto", "40.18");
    formData.set("metodoPago", "TRANSFERENCIA");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockFacturaUpdate).toHaveBeenCalledWith({ where: { id: "f1" }, data: { estado: "PAGADA" } });
  });

  it("rejects a payment that exceeds the saldoPendiente, atomically (no partial write)", async () => {
    mockFacturaUpdateMany.mockResolvedValue({ count: 0 });
    const formData = new FormData();
    formData.set("monto", "99999");
    formData.set("metodoPago", "EFECTIVO");

    const result = await registrarPagoAction("f1", initialState, formData);

    expect(result).toEqual({ error: "El monto no puede ser mayor al saldo pendiente", success: false });
    expect(mockPagoCreate).not.toHaveBeenCalled();
  });
});
