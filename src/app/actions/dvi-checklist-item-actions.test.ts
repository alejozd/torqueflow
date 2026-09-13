import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockAggregate = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    dviChecklistItem: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      aggregate: mockAggregate,
    },
  }),
}));

import {
  crearDviChecklistItemAction,
  listDviChecklistItems,
  toggleDviChecklistItemActivoAction,
  type DviChecklistItemFormState,
} from "./dvi-checklist-item-actions";

const initialState: DviChecklistItemFormState = { error: null, success: false };

describe("listDviChecklistItems", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset();
  });

  it("lists every item ordered by orden", async () => {
    mockFindMany.mockResolvedValue([{ id: "i1", key: "frenos", label: "Frenos", activo: true, orden: 0 }]);

    const result = await listDviChecklistItems();

    expect(result).toEqual([{ id: "i1", key: "frenos", label: "Frenos", activo: true, orden: 0 }]);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { orden: "asc" } });
  });
});

describe("crearDviChecklistItemAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset().mockResolvedValue(null);
    mockAggregate.mockReset().mockResolvedValue({ _max: { orden: 7 } });
    mockCreate.mockReset();
  });

  it("returns a validation error when label is missing", async () => {
    const formData = new FormData();

    const result = await crearDviChecklistItemAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("creates the item with a slugified key and the next available orden", async () => {
    mockCreate.mockResolvedValue({
      id: "i9",
      key: "aire_acondicionado",
      label: "Aire acondicionado",
      activo: true,
      orden: 8,
    });
    const formData = new FormData();
    formData.set("label", "Aire acondicionado");

    const result = await crearDviChecklistItemAction(initialState, formData);

    expect(result).toEqual({
      error: null,
      success: true,
      item: { id: "i9", key: "aire_acondicionado", label: "Aire acondicionado", activo: true, orden: 8 },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { key: "aire_acondicionado", label: "Aire acondicionado", orden: 8 },
    });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("appends a numeric suffix to the key when the slugified label already exists", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "i1", key: "frenos" }).mockResolvedValueOnce(null);
    mockCreate.mockResolvedValue({ id: "i10", key: "frenos_2", label: "Frenos", activo: true, orden: 8 });
    const formData = new FormData();
    formData.set("label", "Frenos");

    await crearDviChecklistItemAction(initialState, formData);

    expect(mockCreate).toHaveBeenCalledWith({
      data: { key: "frenos_2", label: "Frenos", orden: 8 },
    });
  });

  it("returns a friendly Spanish message instead of the raw Prisma error on a duplicate key race", async () => {
    mockCreate.mockRejectedValue({ code: "P2002", message: "Unique constraint failed on the fields: (`key`)" });
    const formData = new FormData();
    formData.set("label", "Frenos");

    const result = await crearDviChecklistItemAction(initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Ya existe un registro con ese valor.");
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (not ADMIN)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();
    formData.set("label", "Frenos");

    await expect(crearDviChecklistItemAction(initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("generates a non-empty key even when the label is all symbols or whitespace", async () => {
    mockCreate.mockResolvedValue({
      id: "i11",
      key: "item",
      label: "!!!",
      activo: true,
      orden: 8,
    });
    const formData = new FormData();
    formData.set("label", "!!!");

    const result = await crearDviChecklistItemAction(initialState, formData);

    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { key: "item", label: "!!!", orden: 8 },
    });
  });
});

describe("toggleDviChecklistItemActivoAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "ADMIN", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("flips activo from true to false", async () => {
    mockFindUnique.mockResolvedValue({ id: "i1", activo: true });
    mockUpdate.mockResolvedValue({ id: "i1", activo: false });

    await toggleDviChecklistItemActivoAction("i1");

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { activo: false } });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("flips activo from false back to true", async () => {
    mockFindUnique.mockResolvedValue({ id: "i1", activo: false });
    mockUpdate.mockResolvedValue({ id: "i1", activo: true });

    await toggleDviChecklistItemActivoAction("i1");

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { activo: true } });
  });

  it("throws when the item does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(toggleDviChecklistItemActivoAction("missing")).rejects.toThrow("Ítem no encontrado");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("propagates the redirect rejection when requireRole rejects (not ADMIN)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));

    await expect(toggleDviChecklistItemActivoAction("i1")).rejects.toThrow("REDIRECT:/login?error=forbidden");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
