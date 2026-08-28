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
const mockSedeFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    bodega: {
      create: mockCreate,
      updateMany: mockUpdateMany,
      deleteMany: mockDeleteMany,
      findMany: mockFindMany,
      findFirst: mockBodegaFindFirst,
    },
    sede: { findFirst: mockSedeFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createBodegaAction,
  updateBodegaAction,
  deleteBodegaAction,
  deleteBodegaFormAction,
  listBodegas,
  listBodegasConInventario,
  getBodega,
  type BodegaFormState,
} from "./bodega-actions";

const initialState: BodegaFormState = { error: null, success: false };
const SESSION_ADMIN = { user: { role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_RECEPCION = { user: { role: "RECEPCION", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("createBodegaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockCreate.mockReset();
    mockSedeFindFirst.mockReset();
  });

  it("returns a validation error when nombre is missing", async () => {
    const formData = new FormData();

    const result = await createBodegaAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the bodega in the session's sede activa, never looking up a default sede", async () => {
    mockCreate.mockResolvedValue({ id: "b1" });
    const formData = new FormData();
    formData.set("nombre", "Bodega norte");

    const result = await createBodegaAction(initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({ data: { nombre: "Bodega norte", sedeId: "sede-1" } });
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("nombre", "Bodega norte");

    await expect(createBodegaAction(initialState, formData)).rejects.toThrow("REDIRECT:/login?error=forbidden");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateBodegaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_RECEPCION);
    mockUpdateMany.mockReset();
  });

  it("updates a bodega of the sede activa", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const formData = new FormData();
    formData.set("nombre", "Bodega renombrada");

    const result = await updateBodegaAction("b1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "b1", sedeId: "sede-1" },
      data: { nombre: "Bodega renombrada" },
    });
  });

  it("refuses to update a bodega from another sede", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const formData = new FormData();
    formData.set("nombre", "Bodega ajena");

    const result = await updateBodegaAction("b-otra-sede", initialState, formData);

    expect(result).toEqual({ error: "Bodega no encontrada en tu sede activa.", success: false });
  });
});

describe("deleteBodegaAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
  });

  it("deletes a bodega of the sede activa", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteBodegaAction("b1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "b1", sedeId: "sede-1" } });
  });

  it("refuses to delete a bodega from another sede", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteBodegaAction("b-otra-sede")).rejects.toThrow(
      "Bodega no encontrada en tu sede activa.",
    );
  });
});

describe("deleteBodegaFormAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
  });

  it("returns success after deleting the bodega", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteBodegaFormAction("b1", initialState);

    expect(result).toEqual({ error: null, success: true });
  });

  it("returns the thrown error message instead of throwing", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteBodegaFormAction("b-otra-sede", initialState);

    expect(result).toEqual({ error: "Bodega no encontrada en tu sede activa.", success: false });
  });
});

describe("listBodegas", () => {
  it("lists only the bodegas of the sede activa, ordered by nombre", async () => {
    mockRequireSession.mockReset().mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
    });
    mockFindMany.mockReset().mockResolvedValue([{ id: "b1", nombre: "Bodega norte" }]);

    const result = await listBodegas();

    expect(result).toEqual([{ id: "b1", nombre: "Bodega norte" }]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1" },
      orderBy: { nombre: "asc" },
    });
  });
});

describe("listBodegasConInventario", () => {
  it("lists bodegas of the sede activa with their repuestos' stock/precio for the KPI columns", async () => {
    mockRequireSession.mockReset().mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
    });
    mockFindMany.mockReset().mockResolvedValue([
      {
        id: "b1",
        nombre: "Bodega norte",
        repuestos: [{ stockActual: 10, stockMinimo: 5, precioCompra: 8 }],
      },
    ]);

    const result = await listBodegasConInventario();

    expect(result).toEqual([
      {
        id: "b1",
        nombre: "Bodega norte",
        repuestos: [{ stockActual: 10, stockMinimo: 5, precioCompra: 8 }],
      },
    ]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1" },
      include: { repuestos: { select: { stockActual: true, stockMinimo: true, precioCompra: true } } },
      orderBy: { nombre: "asc" },
    });
  });
});

describe("getBodega", () => {
  it("returns null for a bodega id belonging to another sede", async () => {
    mockRequireSession.mockReset().mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
    });
    mockBodegaFindFirst.mockReset().mockResolvedValue(null);

    await expect(getBodega("b-otra-sede")).resolves.toBeNull();
    expect(mockBodegaFindFirst).toHaveBeenCalledWith({ where: { id: "b-otra-sede", sedeId: "sede-1" } });
  });
});
