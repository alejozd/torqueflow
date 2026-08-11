import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ vehiculo: { create: mockCreate, findMany: mockFindMany } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createVehiculoAction,
  listVehiculosByCliente,
  type VehiculoFormState,
} from "./vehiculo-actions";

const initialState: VehiculoFormState = { error: null, success: false };

describe("createVehiculoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error when placa is missing", async () => {
    const formData = new FormData();
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");

    const result = await createVehiculoAction("c1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La placa es obligatoria");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the Vehiculo linked to the given clienteId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "v1", placa: "ABC123" });
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("anio", "2020");

    const result = await createVehiculoAction("c1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { placa: "ABC123", marca: "Toyota", modelo: "Corolla", anio: 2020, clienteId: "c1" },
    });
  });

  it("returns a friendly Spanish message instead of the raw Prisma error on a unique constraint violation", async () => {
    mockCreate.mockRejectedValue({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`placa`)",
    });
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("anio", "2020");

    const result = await createVehiculoAction("c1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ya existe un registro con ese valor.");
    expect(result.error).not.toContain("Unique constraint");
  });
});

describe("listVehiculosByCliente", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset();
  });

  it("lists vehiculos for the given clienteId, ordered by placa", async () => {
    mockFindMany.mockResolvedValue([{ id: "v1", placa: "ABC123" }]);

    const result = await listVehiculosByCliente("c1");

    expect(result).toEqual([{ id: "v1", placa: "ABC123" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ where: { clienteId: "c1" }, orderBy: { placa: "asc" } });
  });
});
