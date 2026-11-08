import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
}));

const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();
const mockOrdenFindFirst = vi.fn();
const mockRepuestoFindFirst = vi.fn();
const mockItemFindFirst = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    itemOrden: { create: mockCreate, deleteMany: mockDeleteMany, findFirst: mockItemFindFirst, update: mockUpdate },
    ordenTrabajo: { findFirst: mockOrdenFindFirst },
    repuesto: { findFirst: mockRepuestoFindFirst },
    tarifaIva: {
      findMany: async () => [
        { porcentaje: "0", predeterminada: false },
        { porcentaje: "19", predeterminada: true },
      ],
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteItemOrdenAction } from "./item-orden-actions";

const SESSION_ADMIN = { user: { role: "ADMIN", permisos: ["ordenes.verTodas"], tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("deleteItemOrdenAction", () => {
  beforeEach(() => {
    mockRequirePermiso.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
    mockOrdenFindFirst.mockReset().mockResolvedValue({ estado: "EN_PROCESO", factura: null });
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete an item", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteItemOrdenAction("i1", "o1");

    expect(mockRequirePermiso).toHaveBeenCalledWith("ordenes.quitar");
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

