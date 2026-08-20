import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreate = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ itemOrden: { create: mockCreate, delete: mockDelete } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addItemOrdenAction, deleteItemOrdenAction, type ItemOrdenFormState } from "./item-orden-actions";

const initialState: ItemOrdenFormState = { error: null, success: false };

describe("addItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error when cantidad is less than 1", async () => {
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "0");
    formData.set("precioUnitario", "15");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La cantidad debe ser al menos 1");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the item linked to the given ordenId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "2");
    formData.set("precioUnitario", "15.5");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: 15.5 },
    });
  });

  it("allows TECNICO to add items (not just ADMIN/RECEPCION)", async () => {
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("descripcion", "Bujía");
    formData.set("cantidad", "4");
    formData.set("precioUnitario", "8");

    await addItemOrdenAction("o1", initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION", "TECNICO"]);
  });
});

describe("deleteItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete an item", async () => {
    await deleteItemOrdenAction("i1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });
});
