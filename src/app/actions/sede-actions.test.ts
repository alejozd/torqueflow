import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockSedeCount = vi.fn();
const mockOrdenCount = vi.fn();
const mockOrdenGroupBy = vi.fn();
const mockBodegaCount = vi.fn();
const mockUsuarioSedeCount = vi.fn();
const mockUsuarioSedeGroupBy = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    sede: {
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      count: mockSedeCount,
    },
    ordenTrabajo: { count: mockOrdenCount, groupBy: mockOrdenGroupBy },
    bodega: { count: mockBodegaCount },
    usuarioSede: { count: mockUsuarioSedeCount, groupBy: mockUsuarioSedeGroupBy },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockObtenerLimitesPlan = vi.fn();
vi.mock("@/lib/planes/limites", () => ({
  obtenerLimitesPlan: (...args: unknown[]) => mockObtenerLimitesPlan(...args),
}));

import {
  createSedeAction,
  updateSedeAction,
  deleteSedeAction,
  listSedes,
  listSedesConMetricas,
  type SedeFormState,
} from "./sede-actions";

const initialState: SedeFormState = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("createSedeAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockCreate.mockReset();
    mockObtenerLimitesPlan.mockReset().mockResolvedValue({ maxUsuarios: null, maxSedes: null });
    mockSedeCount.mockReset();
  });

  it("is ADMIN-only", async () => {
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    await createSedeAction(initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("returns a validation error when nombre is missing", async () => {
    const result = await createSedeAction(initialState, new FormData());

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the sede, storing an empty direccion as null", async () => {
    mockCreate.mockResolvedValue({ id: "sede-2" });
    const formData = new FormData();
    formData.set("nombre", "Sede norte");
    formData.set("direccion", "");

    const result = await createSedeAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({ data: { nombre: "Sede norte", direccion: null } });
  });

  it("propagates the redirect rejection and never writes when requireRole rejects", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    await expect(createSedeAction(initialState, formData)).rejects.toThrow("REDIRECT:/login?error=forbidden");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses to create a sede once the plan's maxSedes limit is reached", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: null, maxSedes: 1 });
    mockSedeCount.mockResolvedValue(1);
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    const result = await createSedeAction(initialState, formData);

    expect(result).toEqual({
      error: "Tu plan permite hasta 1 sede(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("allows creating a sede when under the plan's maxSedes limit", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: null, maxSedes: 2 });
    mockSedeCount.mockResolvedValue(1);
    mockCreate.mockResolvedValue({ id: "sede-2" });
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    const result = await createSedeAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
  });

  it("skips the count query entirely when maxSedes is null (Avanzado)", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: null, maxSedes: null });
    mockCreate.mockResolvedValue({ id: "sede-2" });
    const formData = new FormData();
    formData.set("nombre", "Sede norte");

    await createSedeAction(initialState, formData);

    expect(mockSedeCount).not.toHaveBeenCalled();
  });
});

describe("updateSedeAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUpdate.mockReset();
  });

  it("updates nombre and direccion", async () => {
    mockUpdate.mockResolvedValue({ id: "sede-2" });
    const formData = new FormData();
    formData.set("nombre", "Sede norte renombrada");
    formData.set("direccion", "Calle 1 #2-3");

    const result = await updateSedeAction("sede-2", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "sede-2" },
      data: { nombre: "Sede norte renombrada", direccion: "Calle 1 #2-3" },
    });
  });
});

describe("deleteSedeAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockDelete.mockReset();
    mockFindUnique.mockReset().mockResolvedValue({ id: "sede-2", nombre: "Sede norte" });
    mockSedeCount.mockReset().mockResolvedValue(2);
    mockOrdenCount.mockReset().mockResolvedValue(0);
    mockBodegaCount.mockReset().mockResolvedValue(0);
    mockUsuarioSedeCount.mockReset().mockResolvedValue(0);
  });

  it("deletes an empty, non-last sede", async () => {
    await deleteSedeAction("sede-2");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "sede-2" } });
  });

  it("refuses to delete a sede that does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(deleteSedeAction("sede-fantasma")).rejects.toThrow("Sede no encontrada");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete the tenant's last sede", async () => {
    mockSedeCount.mockResolvedValue(1);

    await expect(deleteSedeAction("sede-2")).rejects.toThrow(
      "No puedes eliminar la única sede del taller.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a sede that still has órdenes", async () => {
    mockOrdenCount.mockResolvedValue(3);

    await expect(deleteSedeAction("sede-2")).rejects.toThrow(
      "No puedes eliminar una sede con órdenes o bodegas asociadas.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a sede that still has bodegas", async () => {
    mockBodegaCount.mockResolvedValue(1);

    await expect(deleteSedeAction("sede-2")).rejects.toThrow(
      "No puedes eliminar una sede con órdenes o bodegas asociadas.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete a sede that still has usuarios assigned", async () => {
    mockUsuarioSedeCount.mockResolvedValue(2);

    await expect(deleteSedeAction("sede-2")).rejects.toThrow(
      "No puedes eliminar una sede con usuarios asignados. Reasígnalos primero.",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("listSedes", () => {
  it("is ADMIN-only and lists sedes by nombre", async () => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockFindMany.mockReset().mockResolvedValue([{ id: "sede-1", nombre: "Sede principal" }]);

    const result = await listSedes();

    expect(result).toEqual([{ id: "sede-1", nombre: "Sede principal" }]);
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});

describe("listSedesConMetricas", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockFindMany.mockReset();
    mockUsuarioSedeGroupBy.mockReset();
    mockOrdenGroupBy.mockReset();
  });

  it("is ADMIN-only and merges usuarios asignados + órdenes abiertas per sede, defaulting to 0", async () => {
    mockFindMany.mockResolvedValue([
      { id: "sede-1", nombre: "Sede principal", direccion: "Calle 1" },
      { id: "sede-2", nombre: "Sede norte", direccion: null },
    ]);
    mockUsuarioSedeGroupBy.mockResolvedValue([{ sedeId: "sede-1", _count: { sedeId: 3 } }]);
    mockOrdenGroupBy.mockResolvedValue([{ sedeId: "sede-2", _count: { sedeId: 5 } }]);

    const result = await listSedesConMetricas();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(result).toEqual([
      { id: "sede-1", nombre: "Sede principal", direccion: "Calle 1", usuariosAsignados: 3, ordenesAbiertas: 0 },
      { id: "sede-2", nombre: "Sede norte", direccion: null, usuariosAsignados: 0, ordenesAbiertas: 5 },
    ]);
  });

  it("counts only órdenes not entregadas/anuladas as abiertas", async () => {
    mockFindMany.mockResolvedValue([]);
    mockUsuarioSedeGroupBy.mockResolvedValue([]);
    mockOrdenGroupBy.mockResolvedValue([]);

    await listSedesConMetricas();

    expect(mockOrdenGroupBy).toHaveBeenCalledWith({
      by: ["sedeId"],
      where: { estado: { notIn: ["ENTREGADA", "ANULADA"] } },
      _count: { sedeId: true },
    });
    expect(mockUsuarioSedeGroupBy).toHaveBeenCalledWith({
      by: ["sedeId"],
      _count: { sedeId: true },
    });
  });
});
