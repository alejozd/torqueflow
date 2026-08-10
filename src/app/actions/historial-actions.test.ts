import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockResolveTenant = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({ resolveTenant: () => mockResolveTenant() }));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ historialVehiculo: { create: mockCreate, findMany: mockFindMany } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addHistorialEntryAction,
  listHistorial,
  type HistorialFormState,
} from "./historial-actions";

const initialState: HistorialFormState = { error: null, success: false };

describe("addHistorialEntryAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "TECNICO" } });
    mockResolveTenant.mockReset().mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockCreate.mockReset();
  });

  it("returns a validation error when descripcion is empty", async () => {
    const formData = new FormData();
    formData.set("descripcion", "");

    const result = await addHistorialEntryAction("v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La descripción es obligatoria");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the entry linked to the vehiculo and the current user, and allows TECNICO", async () => {
    mockCreate.mockResolvedValue({ id: "h1", descripcion: "Cambio de aceite" });
    const formData = new FormData();
    formData.set("descripcion", "Cambio de aceite");

    const result = await addHistorialEntryAction("v1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION", "TECNICO"]);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { descripcion: "Cambio de aceite", vehiculoId: "v1", autorId: "u1" },
    });
  });
});

describe("listHistorial", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO" } });
    mockResolveTenant.mockReset().mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockFindMany.mockReset();
  });

  it("lists historial entries for the vehiculo, most recent first", async () => {
    mockFindMany.mockResolvedValue([{ id: "h1", descripcion: "Cambio de aceite" }]);

    const result = await listHistorial("v1");

    expect(result).toEqual([{ id: "h1", descripcion: "Cambio de aceite" }]);
    expect(mockFindMany).toHaveBeenCalledWith({ where: { vehiculoId: "v1" }, orderBy: { fecha: "desc" } });
  });
});
