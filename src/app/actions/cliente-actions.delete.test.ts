import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockFindUnique = vi.fn();
const mockClienteDelete = vi.fn((args: unknown) => ({ op: "cliente.delete", args }));
const mockVehiculoDeleteMany = vi.fn((args: unknown) => ({ op: "vehiculo.deleteMany", args }));
const mockTransaction = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    cliente: { findUnique: mockFindUnique, delete: mockClienteDelete },
    vehiculo: { deleteMany: mockVehiculoDeleteMany },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteClienteAction, deleteClienteFormAction } from "./cliente-actions";

const sinHistorial = { ordenes: 0, facturas: 0, citas: 0, cotizaciones: 0 };
const vehiculoSinHistorial = { _count: { historial: 0 } };

describe("deleteClienteAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset();
    mockTransaction.mockReset().mockResolvedValue([]);
    mockClienteDelete.mockClear();
    mockVehiculoDeleteMany.mockClear();
  });

  it("deletes a cliente without history together with its history-free vehículos", async () => {
    mockFindUnique.mockResolvedValue({ _count: sinHistorial, vehiculos: [vehiculoSinHistorial] });

    await deleteClienteAction("c1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockTransaction).toHaveBeenCalledWith([
      { op: "vehiculo.deleteMany", args: { where: { clienteId: "c1" } } },
      { op: "cliente.delete", args: { where: { id: "c1" } } },
    ]);
  });

  it("counts the vehículos' órdenes only once, through the cliente", async () => {
    mockFindUnique.mockResolvedValue({ _count: { ...sinHistorial, ordenes: 27 }, vehiculos: [vehiculoSinHistorial] });

    await expect(deleteClienteAction("c1")).rejects.toThrow("tiene historial: 27 órdenes.");
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ vehiculos: { select: { _count: { select: { historial: true } } } } }),
      }),
    );
  });

  it("refuses when the cliente has its own history, saying what it has", async () => {
    mockFindUnique.mockResolvedValue({ _count: { ...sinHistorial, ordenes: 2, facturas: 1 }, vehiculos: [] });

    await expect(deleteClienteAction("c1")).rejects.toThrow(
      "No se puede eliminar el cliente porque tiene historial: 2 órdenes, 1 factura.",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses when one of its vehículos has historial entries", async () => {
    mockFindUnique.mockResolvedValue({
      _count: sinHistorial,
      vehiculos: [vehiculoSinHistorial, { _count: { historial: 3 } }],
    });

    await expect(deleteClienteAction("c1")).rejects.toThrow(
      "No se puede eliminar el cliente porque tiene historial: 3 registros en el historial.",
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns the refusal inline through the form adapter", async () => {
    mockFindUnique.mockResolvedValue(null);

    expect(await deleteClienteFormAction("c1", { error: null, success: false })).toEqual({
      error: "Cliente no encontrado",
      success: false,
    });
  });
});
