import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockFindFirst = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ vehiculo: { findFirst: mockFindFirst, delete: mockDelete } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteVehiculoAction, deleteVehiculoFormAction } from "./vehiculo-actions";

describe("deleteVehiculoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { tenantSchema: "taller_perez" } });
    mockFindFirst.mockReset();
    mockDelete.mockReset().mockResolvedValue({});
  });

  it("deletes a vehículo of that cliente that has no history", async () => {
    mockFindFirst.mockResolvedValue({ _count: { historial: 0, ordenes: 0, citas: 0, cotizaciones: 0 } });

    await deleteVehiculoAction("v1", "c1");

    expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "v1", clienteId: "c1" } }));
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "v1" } });
  });

  it("refuses when the vehículo has history, saying what it has", async () => {
    mockFindFirst.mockResolvedValue({ _count: { historial: 1, ordenes: 4, citas: 0, cotizaciones: 0 } });

    await expect(deleteVehiculoAction("v1", "c1")).rejects.toThrow(
      "No se puede eliminar el vehículo porque tiene historial: 4 órdenes, 1 registro en el historial.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns the refusal inline through the form adapter, including another cliente's vehículo", async () => {
    mockFindFirst.mockResolvedValue(null);

    expect(await deleteVehiculoFormAction("v1", "otro-cliente", { error: null, success: false })).toEqual({
      error: "Vehículo no encontrado",
      success: false,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
