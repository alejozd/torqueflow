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
const mockSedeFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    bodega: { create: mockCreate, update: mockUpdate, delete: mockDelete, findMany: mockFindMany, findUnique: mockFindUnique },
    sede: { findFirst: mockSedeFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createBodegaAction,
  updateBodegaAction,
  deleteBodegaAction,
  listBodegas,
  type BodegaFormState,
} from "./bodega-actions";

const initialState: BodegaFormState = { error: null, success: false };

describe("createBodegaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
    mockSedeFindFirst.mockReset().mockResolvedValue({ id: "s1" });
  });

  it("returns a validation error when nombre is missing", async () => {
    const formData = new FormData();

    const result = await createBodegaAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the bodega attached to the tenant's default Sede on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "b1" });
    const formData = new FormData();
    formData.set("nombre", "Bodega norte");

    const result = await createBodegaAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({ data: { nombre: "Bodega norte", sedeId: "s1" } });
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("nombre", "Bodega norte");

    await expect(createBodegaAction(initialState, formData)).rejects.toThrow("REDIRECT:/login?error=forbidden");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateBodegaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "RECEPCION", tenantSchema: "taller_perez" } });
    mockUpdate.mockReset();
  });

  it("updates the bodega's nombre on valid input", async () => {
    mockUpdate.mockResolvedValue({ id: "b1" });
    const formData = new FormData();
    formData.set("nombre", "Bodega renombrada");

    const result = await updateBodegaAction("b1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "b1" }, data: { nombre: "Bodega renombrada" } });
  });
});

describe("deleteBodegaAction", () => {
  it("requires ADMIN/RECEPCION and deletes by id", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();

    await deleteBodegaAction("b1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "b1" } });
  });
});

describe("listBodegas", () => {
  it("lists bodegas ordered by nombre", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([{ id: "b1", nombre: "Bodega norte" }]);

    const result = await listBodegas();

    expect(result).toEqual([{ id: "b1", nombre: "Bodega norte" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});
