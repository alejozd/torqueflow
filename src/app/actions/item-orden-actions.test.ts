import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();
const mockOrdenFindUnique = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    itemOrden: { create: mockCreate, deleteMany: mockDeleteMany },
    ordenTrabajo: { findUnique: mockOrdenFindUnique },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addItemOrdenAction, deleteItemOrdenAction, type ItemOrdenFormState } from "./item-orden-actions";

const initialState: ItemOrdenFormState = { error: null, success: false };

describe("addItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
    mockOrdenFindUnique.mockReset().mockResolvedValue({ estado: "EN_PROCESO" });
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

  it("blocks adding an item when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindUnique.mockResolvedValue({ estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "1");
    formData.set("precioUnitario", "15");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se puede modificar una orden en estado ENTREGADA.");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("deleteItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDeleteMany.mockReset();
    mockOrdenFindUnique.mockReset().mockResolvedValue({ estado: "EN_PROCESO" });
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete an item", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteItemOrdenAction("i1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "i1", ordenId: "o1" } });
  });

  it("blocks deleting an item when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindUnique.mockResolvedValue({ estado: "ENTREGADA" });

    await expect(deleteItemOrdenAction("i1", "o1")).rejects.toThrow(
      "No se puede modificar una orden en estado ENTREGADA.",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("throws when the item exists but belongs to a different orden", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteItemOrdenAction("i1", "o1")).rejects.toThrow("Ítem no encontrado en esta orden");
  });
});
