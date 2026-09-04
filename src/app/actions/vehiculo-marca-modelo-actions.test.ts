import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockMarcaCreate = vi.fn();
const mockMarcaFindMany = vi.fn();
const mockModeloCreate = vi.fn();
const mockModeloFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    marcaVehiculo: { create: mockMarcaCreate, findMany: mockMarcaFindMany },
    modeloVehiculo: { create: mockModeloCreate, findMany: mockModeloFindMany },
  }),
}));

import {
  crearMarcaVehiculoAction,
  crearModeloVehiculoAction,
  listMarcasVehiculo,
  listModelosVehiculo,
  listTodosLosModelosVehiculo,
  type MarcaVehiculoFormState,
  type ModeloVehiculoFormState,
} from "./vehiculo-marca-modelo-actions";

const initialMarcaState: MarcaVehiculoFormState = { error: null, success: false };
const initialModeloState: ModeloVehiculoFormState = { error: null, success: false };

describe("listMarcasVehiculo", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockMarcaFindMany.mockReset();
  });

  it("lists every marca ordered by nombre", async () => {
    mockMarcaFindMany.mockResolvedValue([{ id: "m1", nombre: "Toyota" }]);

    const result = await listMarcasVehiculo();

    expect(result).toEqual([{ id: "m1", nombre: "Toyota" }]);
    expect(mockMarcaFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});

describe("listModelosVehiculo", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockModeloFindMany.mockReset();
  });

  it("lists only the modelos for the given marcaId, ordered by nombre", async () => {
    mockModeloFindMany.mockResolvedValue([{ id: "mo1", marcaId: "m1", nombre: "Corolla" }]);

    const result = await listModelosVehiculo("m1");

    expect(result).toEqual([{ id: "mo1", marcaId: "m1", nombre: "Corolla" }]);
    expect(mockModeloFindMany).toHaveBeenCalledWith({ where: { marcaId: "m1" }, orderBy: { nombre: "asc" } });
  });
});

describe("listTodosLosModelosVehiculo", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockModeloFindMany.mockReset();
  });

  it("lists every modelo across every marca, ordered by nombre", async () => {
    mockModeloFindMany.mockResolvedValue([
      { id: "mo1", marcaId: "m1", nombre: "Corolla" },
      { id: "mo2", marcaId: "m2", nombre: "Mazda 3" },
    ]);

    const result = await listTodosLosModelosVehiculo();

    expect(result).toEqual([
      { id: "mo1", marcaId: "m1", nombre: "Corolla" },
      { id: "mo2", marcaId: "m2", nombre: "Mazda 3" },
    ]);
    expect(mockModeloFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});

describe("crearMarcaVehiculoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockMarcaCreate.mockReset();
  });

  it("returns a validation error when nombre is missing", async () => {
    const formData = new FormData();

    const result = await crearMarcaVehiculoAction(initialMarcaState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockMarcaCreate).not.toHaveBeenCalled();
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("creates the marca and returns it on valid input", async () => {
    mockMarcaCreate.mockResolvedValue({ id: "m1", nombre: "Toyota" });
    const formData = new FormData();
    formData.set("nombre", "Toyota");

    const result = await crearMarcaVehiculoAction(initialMarcaState, formData);

    expect(result).toEqual({ error: null, success: true, marca: { id: "m1", nombre: "Toyota" } });
    expect(mockMarcaCreate).toHaveBeenCalledWith({ data: { nombre: "Toyota" } });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("returns a friendly Spanish message instead of the raw Prisma error on a duplicate nombre", async () => {
    mockMarcaCreate.mockRejectedValue({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`nombre`)",
    });
    const formData = new FormData();
    formData.set("nombre", "Toyota");

    const result = await crearMarcaVehiculoAction(initialMarcaState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ya existe un registro con ese valor.");
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (not ADMIN)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("nombre", "Toyota");

    await expect(crearMarcaVehiculoAction(initialMarcaState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockMarcaCreate).not.toHaveBeenCalled();
  });
});

describe("crearModeloVehiculoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockModeloCreate.mockReset();
  });

  it("returns a validation error when marcaId is missing", async () => {
    const formData = new FormData();
    formData.set("nombre", "Corolla");

    const result = await crearModeloVehiculoAction(initialModeloState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Selecciona una marca");
    expect(mockModeloCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when nombre is missing", async () => {
    const formData = new FormData();
    formData.set("marcaId", "m1");

    const result = await crearModeloVehiculoAction(initialModeloState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockModeloCreate).not.toHaveBeenCalled();
  });

  it("creates the modelo under the given marca and returns it on valid input", async () => {
    mockModeloCreate.mockResolvedValue({ id: "mo1", marcaId: "m1", nombre: "Corolla" });
    const formData = new FormData();
    formData.set("marcaId", "m1");
    formData.set("nombre", "Corolla");

    const result = await crearModeloVehiculoAction(initialModeloState, formData);

    expect(result).toEqual({
      error: null,
      success: true,
      modelo: { id: "mo1", marcaId: "m1", nombre: "Corolla" },
    });
    expect(mockModeloCreate).toHaveBeenCalledWith({ data: { marcaId: "m1", nombre: "Corolla" } });
  });

  it("returns a friendly Spanish message instead of the raw Prisma error on a duplicate nombre within the same marca", async () => {
    mockModeloCreate.mockRejectedValue({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`marca_id`,`nombre`)",
    });
    const formData = new FormData();
    formData.set("marcaId", "m1");
    formData.set("nombre", "Corolla");

    const result = await crearModeloVehiculoAction(initialModeloState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ya existe un registro con ese valor.");
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (not ADMIN)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("marcaId", "m1");
    formData.set("nombre", "Corolla");

    await expect(crearModeloVehiculoAction(initialModeloState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockModeloCreate).not.toHaveBeenCalled();
  });
});
