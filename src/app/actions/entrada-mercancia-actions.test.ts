import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockEntradaCreate = vi.fn();
const mockEntradaFindMany = vi.fn();
const mockEntradaFindUnique = vi.fn();
const mockItemCreate = vi.fn();
const mockRepuestoUpdate = vi.fn();
const mockRepuestoFindUnique = vi.fn();
const mockTransaction = vi.fn((ops: unknown[]) => Promise.all(ops));
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    entradaMercancia: { create: mockEntradaCreate, findMany: mockEntradaFindMany, findUnique: mockEntradaFindUnique },
    entradaMercanciaItem: { create: mockItemCreate },
    repuesto: { update: mockRepuestoUpdate, findUnique: mockRepuestoFindUnique },
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

const initialState: EntradaFormState = { error: null, success: false };

describe("createEntradaMercanciaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockEntradaCreate.mockReset();
  });

  it("returns a validation error when proveedorId is missing", async () => {
    const formData = new FormData();
    formData.set("bodegaId", "b1");

    const result = await createEntradaMercanciaAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Selecciona un proveedor");
    expect(mockEntradaCreate).not.toHaveBeenCalled();
  });

  it("creates the entrada header on valid input", async () => {
    mockEntradaCreate.mockResolvedValue({ id: "e1" });
    const formData = new FormData();
    formData.set("proveedorId", "p1");
    formData.set("bodegaId", "b1");

    const result = await createEntradaMercanciaAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockEntradaCreate).toHaveBeenCalledWith({
      data: { proveedorId: "p1", bodegaId: "b1", creadoPorId: "u1" },
    });
  });
});

describe("addEntradaItemAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockItemCreate.mockReset();
    mockRepuestoUpdate.mockReset();
    mockTransaction.mockClear();
    mockEntradaFindUnique.mockReset().mockResolvedValue({ bodegaId: "b1" });
    mockRepuestoFindUnique.mockReset().mockResolvedValue({ bodegaId: "b1" });
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

    expect(result).toEqual({ error: null, success: true });
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
    mockEntradaFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result).toEqual({ error: "Entrada no encontrada", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects when the repuesto does not exist", async () => {
    mockRepuestoFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result).toEqual({ error: "Repuesto no encontrado", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects when the repuesto belongs to a different bodega than the entrada", async () => {
    mockEntradaFindUnique.mockResolvedValue({ bodegaId: "b1" });
    mockRepuestoFindUnique.mockResolvedValue({ bodegaId: "b2" });
    const formData = new FormData();
    formData.set("repuestoId", "r1");
    formData.set("cantidad", "20");
    formData.set("precioCompraUnitario", "8.5");

    const result = await addEntradaItemAction("e1", initialState, formData);

    expect(result).toEqual({
      error: "El repuesto no pertenece a la bodega de esta entrada",
      success: false,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("listEntradas", () => {
  it("lists entradas ordered by most recent first, with proveedor/bodega/items included", async () => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockEntradaFindMany.mockReset().mockResolvedValue([{ id: "e1" }]);

    const result = await listEntradas();

    expect(result).toEqual([{ id: "e1" }]);
    expect(mockEntradaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });
});
