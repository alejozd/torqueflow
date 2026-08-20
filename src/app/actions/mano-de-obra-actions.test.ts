import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreate = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ manoDeObra: { create: mockCreate, delete: mockDelete } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addManoDeObraAction, deleteManoDeObraAction, type ManoDeObraFormState } from "./mano-de-obra-actions";

const initialState: ManoDeObraFormState = { error: null, success: false };

describe("addManoDeObraAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error when horas is 0", async () => {
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("horas", "0");
    formData.set("precioHora", "20");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Las horas deben ser mayores a 0");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the labor line linked to the given ordenId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "m1" });
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("horas", "1.5");
    formData.set("precioHora", "20");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Cambio de pastillas de freno", horas: 1.5, precioHora: 20 },
    });
  });
});

describe("deleteManoDeObraAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete a labor line", async () => {
    await deleteManoDeObraAction("m1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});
