import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();
const mockOrdenFindFirst = vi.fn();
const mockRepuestoFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    itemOrden: { create: mockCreate, deleteMany: mockDeleteMany },
    ordenTrabajo: { findFirst: mockOrdenFindFirst },
    repuesto: { findFirst: mockRepuestoFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addItemOrdenAction, deleteItemOrdenAction, type ItemOrdenFormState } from "./item-orden-actions";

const initialState: ItemOrdenFormState = { error: null, success: false };
const SESSION = { user: { role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_ADMIN = { user: { role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("addItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockCreate.mockReset();
    mockRepuestoFindFirst.mockReset();
    mockOrdenFindFirst.mockReset().mockResolvedValue({ estado: "EN_PROCESO", factura: null });
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

  it("returns a validation error when neither repuestoId nor manual descripcion+precio are given", async () => {
    const formData = new FormData();
    formData.set("cantidad", "2");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Selecciona un repuesto del inventario o completa descripción y precio manualmente");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a manual (non-catalog) item linked to the given ordenId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "2");
    formData.set("precioUnitario", "15.5");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRepuestoFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: { ordenId: "o1", repuestoId: null, descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: 15.5 },
    });
  });

  it("creates a catalog-linked item, deriving descripcion/precioUnitario from the Repuesto and ignoring manual fields", async () => {
    mockRepuestoFindFirst.mockResolvedValue({ id: "r1", nombre: "Filtro de aceite Bosch", precioVenta: 18.9 });
    mockCreate.mockResolvedValue({ id: "i1" });
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "3");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockRepuestoFindFirst).toHaveBeenCalledWith({
      where: { id: "r1", bodega: { sedeId: "sede-1" } },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        ordenId: "o1",
        repuestoId: "r1",
        descripcion: "Filtro de aceite Bosch",
        cantidad: 3,
        precioUnitario: 18.9,
      },
    });
  });

  it("returns an error when repuestoId references a repuesto that doesn't exist", async () => {
    mockRepuestoFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("repuestoId", "r-missing");
    formData.set("cantidad", "1");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Repuesto no encontrado");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses a repuesto that lives in another sede's bodega", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "BORRADOR", factura: null });
    mockRepuestoFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("repuestoId", "repuesto-de-otra-sede");
    formData.set("cantidad", "2");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result).toEqual({ error: "Repuesto no encontrado", success: false });
    expect(mockRepuestoFindFirst).toHaveBeenCalledWith({
      where: { id: "repuesto-de-otra-sede", bodega: { sedeId: "sede-1" } },
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
    mockOrdenFindFirst.mockResolvedValue({ estado: "ENTREGADA", factura: null });
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "1");
    formData.set("precioUnitario", "15");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se puede modificar una orden en estado ENTREGADA.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("blocks adding an item when the order already has a factura", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "TERMINADA", factura: { id: "f1" } });
    const formData = new FormData();
    formData.set("descripcion", "Filtro de aceite");
    formData.set("cantidad", "1");
    formData.set("precioUnitario", "15");

    const result = await addItemOrdenAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se puede modificar una orden que ya tiene una factura generada.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses to touch an orden from another sede", async () => {
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("descripcion", "Pastillas de freno");
    formData.set("cantidad", "4");
    formData.set("precioUnitario", "15");

    const result = await addItemOrdenAction("orden-de-otra-sede", initialState, formData);

    expect(result).toEqual({ error: "Orden no encontrada", success: false });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      select: { estado: true, factura: { select: { id: true } } },
    });
  });
});

describe("deleteItemOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
    mockOrdenFindFirst.mockReset().mockResolvedValue({ estado: "EN_PROCESO", factura: null });
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete an item", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteItemOrdenAction("i1", "o1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "i1", ordenId: "o1" } });
  });

  it("blocks deleting an item when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "ENTREGADA", factura: null });

    await expect(deleteItemOrdenAction("i1", "o1")).rejects.toThrow(
      "No se puede modificar una orden en estado ENTREGADA.",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("blocks deleting an item when the order already has a factura", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "TERMINADA", factura: { id: "f1" } });

    await expect(deleteItemOrdenAction("i1", "o1")).rejects.toThrow(
      "No se puede modificar una orden que ya tiene una factura generada.",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("throws when the item exists but belongs to a different orden", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteItemOrdenAction("i1", "o1")).rejects.toThrow("Ítem no encontrado en esta orden");
  });

  it("refuses to touch an orden from another sede", async () => {
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);

    await expect(deleteItemOrdenAction("i1", "orden-de-otra-sede")).rejects.toThrow("Orden no encontrada");
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      select: { estado: true, factura: { select: { id: true } } },
    });
  });
});
