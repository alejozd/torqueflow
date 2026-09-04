import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockEntradaCreate = vi.fn();
const mockEntradaFindMany = vi.fn();
const mockEntradaFindFirst = vi.fn();
const mockItemCreate = vi.fn();
const mockRepuestoUpdate = vi.fn();
const mockRepuestoFindFirst = vi.fn();
const mockBodegaFindFirst = vi.fn();
const mockTransaction = vi.fn((ops: unknown[]) => Promise.all(ops));
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    entradaMercancia: { create: mockEntradaCreate, findMany: mockEntradaFindMany, findFirst: mockEntradaFindFirst },
    entradaMercanciaItem: { create: mockItemCreate },
    repuesto: { update: mockRepuestoUpdate, findFirst: mockRepuestoFindFirst },
    bodega: { findFirst: mockBodegaFindFirst },
    $transaction: mockTransaction,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createEntradaMercanciaAction,
  addEntradaItemAction,
  listEntradas,
  type EntradaFormState,
} from "./entrada-mercancia-actions";

const initialState: EntradaFormState = { error: null, success: false, entradaId: null };
const SESSION_ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_TECNICO = { user: { role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("createEntradaMercanciaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockEntradaCreate.mockReset();
    mockBodegaFindFirst.mockReset().mockResolvedValue({ id: "b1" });
  });

  it("returns a validation error when proveedorId is missing", async () => {
    const formData = new FormData();
    formData.set("bodegaId", "b1");

    const result = await createEntradaMercanciaAction(initialState, formData);

    expect(result).toEqual({ error: "Selecciona un proveedor", success: false, entradaId: null });
    expect(mockEntradaCreate).not.toHaveBeenCalled();
  });

  it("creates the entrada header on valid input", async () => {
    mockEntradaCreate.mockResolvedValue({ id: "e1" });
    const formData = new FormData();
    formData.set("proveedorId", "p1");
    formData.set("bodegaId", "b1");

    const result = await createEntradaMercanciaAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true, entradaId: "e1" });
    expect(mockEntradaCreate).toHaveBeenCalledWith({
      data: { proveedorId: "p1", bodegaId: "b1", creadoPorId: "u1" },
    });
  });

  it("refuses to create an entrada against a bodega from another sede", async () => {
    mockBodegaFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("proveedorId", "p1");
    formData.set("bodegaId", "b-otra-sede");

    const result = await createEntradaMercanciaAction(initialState, formData);

    expect(result).toEqual({
      error: "La bodega seleccionada no pertenece a tu sede activa.",
      success: false,
      entradaId: null,
    });
    expect(mockEntradaCreate).not.toHaveBeenCalled();
  });
});

describe("addEntradaItemAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockItemCreate.mockReset();
    mockRepuestoUpdate.mockReset();
    mockTransaction.mockClear();
    mockEntradaFindFirst.mockReset().mockResolvedValue({ bodegaId: "b1" });
    mockRepuestoFindFirst.mockReset().mockResolvedValue({ bodegaId: "b1" });
  });

  it("returns a validation error when cantidad is less than 1", async () => {
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "0");
    formData.set("precioCompraUnitario", "8");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("La cantidad debe ser al menos 1");
    expect(mockItemCreate).not.toHaveBeenCalled();
    expect(mockRepuestoUpdate).not.toHaveBeenCalled();
  });

  it("returns a validation error when precioCompraUnitario is left blank, instead of silently defaulting to 0", async () => {
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El precio de compra unitario es obligatorio");
    expect(mockItemCreate).not.toHaveBeenCalled();
  });

  it("creates the item AND atomically increments the repuesto's stockActual on valid input", async () => {
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result).toEqual({ error: null, success: true, entradaId: "e1" });
    expect(mockItemCreate).toHaveBeenCalledWith({
      data: { entradaId: "e1", repuestoId: "r1", cantidad: 20, precioCompraUnitario: 8.5 },
    });
    expect(mockRepuestoUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { stockActual: { increment: 20 } },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("surfaces a friendly error when the transaction rejects", async () => {
    mockTransaction.mockRejectedValueOnce(new Error("simulated DB failure"));
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result.success).toBe(false);
  });

  it("rejects when the entrada does not exist", async () => {
    mockEntradaFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result).toEqual({ error: "Entrada no encontrada", success: false, entradaId: "e1" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects when the repuesto does not exist", async () => {
    mockRepuestoFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result).toEqual({ error: "Repuesto no encontrado", success: false, entradaId: "e1" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects when the repuesto belongs to a different bodega than the entrada", async () => {
    mockEntradaFindFirst.mockResolvedValue({ bodegaId: "b1" });
    mockRepuestoFindFirst.mockResolvedValue({ bodegaId: "b2" });
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result).toEqual({
      error: "El repuesto no pertenece a la bodega de esta entrada",
      success: false,
      entradaId: "e1",
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses to add an item to an entrada from another sede", async () => {
    mockEntradaFindFirst.mockReset().mockResolvedValue(null);
    mockRepuestoFindFirst.mockReset().mockResolvedValue({ bodegaId: "b1" });
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8");

    const result = await addEntradaItemAction("e-otra-sede", initialState, formData);

    expect(result).toEqual({ error: "Entrada no encontrada", success: false, entradaId: "e-otra-sede" });
  });
});

describe("listEntradas", () => {
  it("lists only entradas whose bodega is in the sede activa", async () => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION_TECNICO);
    mockEntradaFindMany.mockReset().mockResolvedValue([]);

    await listEntradas();

    expect(mockEntradaFindMany).toHaveBeenCalledWith({
      where: { bodega: { sedeId: "sede-1" } },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });
});
