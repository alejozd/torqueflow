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
  deleteProveedorFormAction,
  listProveedores,
  listProveedoresConInventario,
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

describe("deleteProveedorFormAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();
  });

  it("returns success after deleting the proveedor", async () => {
    mockDelete.mockResolvedValue({ id: "p1" });

    const result = await deleteProveedorFormAction("p1", initialState);

    expect(result).toEqual({ error: null, success: true });
  });

  it("returns the thrown error message instead of throwing", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));

    const result = await deleteProveedorFormAction("p1", initialState);

    expect(result).toEqual({ error: "Error al eliminar el proveedor", success: false });
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

describe("listProveedoresConInventario", () => {
  it("lists proveedores with their repuestos count and most recent entrada for the KPI columns", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([
      {
        id: "p1",
        nombre: "Repuestos El Motor",
        repuestos: [{ id: "r1" }],
        entradas: [{ createdAt: new Date("2026-01-01") }],
      },
    ]);

    const result = await listProveedoresConInventario();

    expect(result).toEqual([
      {
        id: "p1",
        nombre: "Repuestos El Motor",
        repuestos: [{ id: "r1" }],
        entradas: [{ createdAt: new Date("2026-01-01") }],
      },
    ]);
    expect(mockFindMany).toHaveBeenCalledWith({
      include: {
        repuestos: { select: { id: true } },
        entradas: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { nombre: "asc" },
    });
  });
});
