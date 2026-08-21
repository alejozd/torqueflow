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
    repuesto: { create: mockCreate, update: mockUpdate, delete: mockDelete, findMany: mockFindMany },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createRepuestoAction,
  updateRepuestoAction,
  deleteRepuestoAction,
  listRepuestos,
  listRepuestoOptions,
  type RepuestoFormState,
} from "./repuesto-actions";

const initialState: RepuestoFormState = { error: null, success: false };

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
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
  });

  it("returns a validation error when codigo is missing", async () => {
    const formData = baseFormData();
    formData.delete("codigo");

    const result = await createRepuestoAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El código es obligatorio");
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

  it("creates the repuesto with the given initial stock on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "r1" });
    const formData = baseFormData();
    formData.set("stockActual", "20");
    formData.set("proveedorId", "p1");

    const result = await createRepuestoAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
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
});

describe("updateRepuestoAction", () => {
  it("updates the repuesto WITHOUT touching stockActual, even if the form somehow includes it", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "RECEPCION", tenantSchema: "taller_perez" } });
    mockUpdate.mockReset().mockResolvedValue({ id: "r1" });
    const formData = baseFormData();
    formData.set("stockActual", "9999");

    const result = await updateRepuestoAction("r1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    const callArg = mockUpdate.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("stockActual");
    expect(callArg).toEqual({
      where: { id: "r1" },
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
  it("requires ADMIN/RECEPCION and deletes by id", async () => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockDelete.mockReset();

    await deleteRepuestoAction("r1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});

describe("listRepuestos", () => {
  it("lists repuestos with bodega/proveedor included, ordered by nombre", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([{ id: "r1", nombre: "Filtro de aceite" }]);

    const result = await listRepuestos();

    expect(result).toEqual([{ id: "r1", nombre: "Filtro de aceite" }]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { nombre: "asc" } }),
    );
  });
});

describe("listRepuestoOptions", () => {
  it("selects only id/codigo/nombre, never Decimal price fields, with no bodega filter by default", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }]);

    const result = await listRepuestoOptions();

    expect(result).toEqual([{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: undefined,
      select: { id: true, codigo: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });

  it("filters by bodegaId when given, for entrada-de-mercancia's warehouse-scoped picker", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset().mockResolvedValue([]);

    await listRepuestoOptions("b1");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bodegaId: "b1" } }),
    );
  });
});
