import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockUpdateMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockFindMany = vi.fn();
const mockBodegaFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    repuesto: { create: mockCreate, updateMany: mockUpdateMany, deleteMany: mockDeleteMany, findMany: mockFindMany },
    bodega: { findFirst: mockBodegaFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createRepuestoAction,
  updateRepuestoAction,
  deleteRepuestoAction,
  deleteRepuestoFormAction,
  listRepuestos,
  listRepuestoOptions,
  type RepuestoFormState,
} from "./repuesto-actions";

const initialState: RepuestoFormState = { error: null, success: false, repuestoId: null };
const SESSION_ADMIN = { user: { role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_RECEPCION = { user: { role: "RECEPCION", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_TECNICO = { user: { role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

function baseFormData(): FormData {
  const formData = new FormData();
  formData.set("codigo", "FRN-001");
  formData.set("nombre", "Filtro de aceite");
  formData.set("precioCompra", "8");
  formData.set("precioVenta", "15");
  formData.set("stockMinimo", "5");
  formData.set("bodegaId", "b1");
  return formData;
}

describe("createRepuestoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockCreate.mockReset();
    mockBodegaFindFirst.mockReset().mockResolvedValue({ id: "b1" });
  });

  it("returns a validation error when codigo is missing", async () => {
    const formData = baseFormData();
    formData.delete("codigo");

    const result = await createRepuestoAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El código es obligatorio");
    expect(result.repuestoId).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when precioVenta is left blank, instead of silently defaulting to 0", async () => {
    const formData = baseFormData();
    formData.set("precioVenta", "");

    const result = await createRepuestoAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El precio de venta es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when the initial stockActual is negative", async () => {
    const formData = baseFormData();
    formData.set("stockActual", "-3");

    const result = await createRepuestoAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El stock inicial no puede ser negativo");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the repuesto with the given initial stock on valid input, returning the created id", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    const formData = baseFormData();
    formData.set("stockActual", "20");
    formData.set("proveedorId", "p1");

    const result = await createRepuestoAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true, repuestoId: "r1" });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        codigo: "FRN-001",
        nombre: "Filtro de aceite",
        descripcion: null,
        precioCompra: 8,
        precioVenta: 15,
        stockActual: 20,
        stockMinimo: 5,
        bodegaId: "b1",
        proveedorId: "p1",
      },
    });
  });

  it("defaults proveedorId to null when not provided", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    const formData = baseFormData();
    formData.set("stockActual", "0");

    await createRepuestoAction(initialState, formData);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ proveedorId: null }) }),
    );
  });

  it("refuses to create a repuesto in a bodega from another sede", async () => {
    mockBodegaFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("codigo", "FRN-001");
    formData.set("nombre", "Filtro de aceite");
    formData.set("precioCompra", "8");
    formData.set("precioVenta", "18.9");
    formData.set("stockActual", "0");
    formData.set("stockMinimo", "5");
    formData.set("bodegaId", "b-otra-sede");

    const result = await createRepuestoAction(initialState, formData);

    expect(result).toEqual({
      error: "La bodega seleccionada no pertenece a tu sede activa.",
      success: false,
      repuestoId: null,
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockBodegaFindFirst).toHaveBeenCalledWith({
      where: { id: "b-otra-sede", sedeId: "sede-1" },
      select: { id: true },
    });
  });
});

describe("updateRepuestoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_RECEPCION);
    mockUpdateMany.mockReset();
    mockBodegaFindFirst.mockReset().mockResolvedValue({ id: "b1" });
  });

  it("updates the repuesto WITHOUT touching stockActual, even if the form somehow includes it, and reports no repuestoId", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const formData = baseFormData();
    formData.set("stockActual", "9999");

    const result = await updateRepuestoAction("r1", initialState, formData);

    expect(result).toEqual({ error: null, success: true, repuestoId: null });
    const callArg = mockUpdateMany.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("stockActual");
    expect(callArg).toEqual({
      where: { id: "r1", bodega: { sedeId: "sede-1" } },
      data: {
        codigo: "FRN-001",
        nombre: "Filtro de aceite",
        descripcion: null,
        precioCompra: 8,
        precioVenta: 15,
        stockMinimo: 5,
        bodegaId: "b1",
        proveedorId: null,
      },
    });
  });
});

describe("deleteRepuestoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
  });

  it("requires ADMIN/RECEPCION and deletes a repuesto of the sede activa", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteRepuestoAction("r1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "r1", bodega: { sedeId: "sede-1" } } });
  });

  it("refuses to delete a repuesto from another sede", async () => {
    mockDeleteMany.mockReset().mockResolvedValue({ count: 0 });

    await expect(deleteRepuestoAction("r-otra-sede")).rejects.toThrow(
      "Repuesto no encontrado en tu sede activa.",
    );
  });
});

describe("deleteRepuestoFormAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
  });

  it("returns success after deleting the repuesto", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteRepuestoFormAction("r1", initialState);

    expect(result).toEqual({ error: null, success: true, repuestoId: null });
  });

  it("returns the thrown error message instead of throwing", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteRepuestoFormAction("r-otra-sede", initialState);

    expect(result).toEqual({ error: "Repuesto no encontrado en tu sede activa.", success: false, repuestoId: null });
  });
});

describe("listRepuestos", () => {
  it("lists only repuestos whose bodega is in the sede activa", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockFindMany.mockReset().mockResolvedValue([]);

    await listRepuestos();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      include: expect.anything(),
      orderBy: { nombre: "asc" },
    });
  });
});

describe("listRepuestoOptions", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockFindMany.mockReset().mockResolvedValue([]);
  });

  it("combines an explicit bodegaId with the sede filter in listRepuestoOptions", async () => {
    await listRepuestoOptions("b1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodegaId: "b1", bodega: { sedeId: "sede-1" } },
      select: { id: true, codigo: true, nombre: true, precioVenta: true },
      orderBy: { nombre: "asc" },
    });
  });

  it("still applies the sede filter when no bodegaId is given", async () => {
    await listRepuestoOptions();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      select: { id: true, codigo: true, nombre: true, precioVenta: true },
      orderBy: { nombre: "asc" },
    });
  });
});
