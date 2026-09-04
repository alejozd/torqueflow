import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    vehiculo: { create: mockCreate, findMany: mockFindMany, update: mockUpdate, findUnique: mockFindUnique },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createVehiculoAction,
  updateVehiculoAction,
  listVehiculosByCliente,
  getVehiculo,
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

    expect(result).toEqual({ error: null, success: true, vehiculo: { id: "v1", placa: "ABC123" } });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { placa: "ABC123", marca: "Toyota", modelo: "Corolla", anio: 2020, clienteId: "c1" },
    });
  });

  it("persists the optional detail fields (combustible, kilometraje, proximo mantenimiento, transmision, observaciones) when provided", async () => {
    mockCreate.mockResolvedValue({ id: "v1", placa: "ABC123" });
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("anio", "2020");
    formData.set("combustible", "GASOLINA");
    formData.set("kilometraje", "78420");
    formData.set("proximoMantenimiento", "2026-12-01");
    formData.set("transmision", "AUTOMATICA");
    formData.set("observaciones", "Rines de posventa, llave de repuesto en recepción");

    const result = await createVehiculoAction("c1", initialState, formData);

    expect(result).toEqual({ error: null, success: true, vehiculo: { id: "v1", placa: "ABC123" } });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        placa: "ABC123",
        marca: "Toyota",
        modelo: "Corolla",
        anio: 2020,
        combustible: "GASOLINA",
        kilometraje: 78420,
        proximoMantenimiento: new Date("2026-12-01"),
        transmision: "AUTOMATICA",
        observaciones: "Rines de posventa, llave de repuesto en recepción",
        clienteId: "c1",
      },
    });
  });

  it("leaves the optional detail fields undefined when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "v1", placa: "ABC123" });
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");

    await createVehiculoAction("c1", initialState, formData);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        placa: "ABC123",
        marca: "Toyota",
        modelo: "Corolla",
        anio: undefined,
        combustible: undefined,
        kilometraje: undefined,
        proximoMantenimiento: undefined,
        transmision: undefined,
        observaciones: undefined,
        clienteId: "c1",
      },
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

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");

    await expect(createVehiculoAction("c1", initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateVehiculoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockUpdate.mockReset();
  });

  it("returns a validation error when placa is missing", async () => {
    const formData = new FormData();
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");

    const result = await updateVehiculoAction("v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La placa es obligatoria");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates the Vehiculo, including the detail fields, and revalidates its owning cliente", async () => {
    mockUpdate.mockResolvedValue({ id: "v1", clienteId: "c1" });
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("anio", "2020");
    formData.set("combustible", "GASOLINA");
    formData.set("kilometraje", "78420");
    formData.set("proximoMantenimiento", "2026-12-01");
    formData.set("transmision", "AUTOMATICA");
    formData.set("observaciones", "Rines de posventa");

    const result = await updateVehiculoAction("v1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: {
        placa: "ABC123",
        marca: "Toyota",
        modelo: "Corolla",
        anio: 2020,
        combustible: "GASOLINA",
        kilometraje: 78420,
        proximoMantenimiento: new Date("2026-12-01"),
        transmision: "AUTOMATICA",
        observaciones: "Rines de posventa",
      },
      select: { clienteId: true },
    });
  });

  it("returns a friendly Spanish message instead of the raw Prisma error on a unique constraint violation", async () => {
    mockUpdate.mockRejectedValue({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`placa`)",
    });
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");

    const result = await updateVehiculoAction("v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ya existe un registro con ese valor.");
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("placa", "ABC123");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");

    await expect(updateVehiculoAction("v1", initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("getVehiculo", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset();
  });

  it("includes the owning cliente's contact fields, for the vehículo detail page's owner card", async () => {
    mockFindUnique.mockResolvedValue({ id: "v1", placa: "ABC123" });

    const result = await getVehiculo("v1");

    expect(result).toEqual({ id: "v1", placa: "ABC123" });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "v1" },
      include: { cliente: { select: { id: true, nombre: true, telefono: true, email: true, documento: true } } },
    });
  });

  it("returns null when the vehiculo does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getVehiculo("missing");

    expect(result).toBeNull();
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
