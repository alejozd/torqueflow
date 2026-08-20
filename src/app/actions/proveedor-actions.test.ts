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
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    proveedor: { create: mockCreate, update: mockUpdate, delete: mockDelete, findMany: mockFindMany },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createProveedorAction,
  updateProveedorAction,
  deleteProveedorAction,
  listProveedores,
  type ProveedorFormState,
} from "./proveedor-actions";

const initialState: ProveedorFormState = { error: null, success: false };

describe("createProveedorAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error when nombre is missing", async () => {
    const formData = new FormData();

    const result = await createProveedorAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the proveedor on valid input, with optional fields as null when blank", async () => {
    mockCreate.mockResolvedValue({ id: "p1" });
    const formData = new FormData();
    formData.set("nombre", "Repuestos El Motor");

    const result = await createProveedorAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { nombre: "Repuestos El Motor", contacto: null, telefono: null, email: null },
    });
  });
});

describe("updateProveedorAction", () => {
  it("updates the proveedor on valid input", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "RECEPCION", tenantSchema: "taller_perez" } });
    mockUpdate.mockReset().mockResolvedValue({ id: "p1" });
    const formData = new FormData();
    formData.set("nombre", "Repuestos El Motor S.A.");
    formData.set("telefono", "555-1234");

    const result = await updateProveedorAction("p1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { nombre: "Repuestos El Motor S.A.", contacto: null, telefono: "555-1234", email: null },
    });
  });
});

describe("deleteProveedorAction", () => {
  it("requires ADMIN/RECEPCION and deletes by id", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();

    await deleteProveedorAction("p1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});

describe("listProveedores", () => {
  it("lists proveedores ordered by nombre", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([{ id: "p1", nombre: "Repuestos El Motor" }]);

    const result = await listProveedores();

    expect(result).toEqual([{ id: "p1", nombre: "Repuestos El Motor" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { nombre: "asc" } });
  });
});
