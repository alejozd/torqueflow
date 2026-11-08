import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso),
}));

const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();
const mockOrdenFindFirst = vi.fn();
const mockUsuarioFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    manoDeObra: { create: mockCreate, deleteMany: mockDeleteMany },
    ordenTrabajo: { findFirst: mockOrdenFindFirst },
    usuario: { findFirst: mockUsuarioFindFirst },
    tarifaIva: {
      findMany: async () => [
        { porcentaje: "0", predeterminada: false },
        { porcentaje: "19", predeterminada: true },
      ],
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteManoDeObraAction } from "./mano-de-obra-actions";

const SESSION_ADMIN = { user: { role: "ADMIN", permisos: ["ordenes.verTodas"], tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("deleteManoDeObraAction", () => {
  beforeEach(() => {
    mockRequirePermiso.mockReset().mockResolvedValue(SESSION_ADMIN);
    mockDeleteMany.mockReset();
    mockOrdenFindFirst.mockReset().mockResolvedValue({ estado: "EN_PROCESO", factura: null });
  });

  it("requires ADMIN/RECEPCION (not TECNICO) to delete a labor line", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    await deleteManoDeObraAction("m1", "o1");

    expect(mockRequirePermiso).toHaveBeenCalledWith("ordenes.quitar");
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "m1", ordenId: "o1" } });
  });

  it("blocks deleting a labor line when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "ENTREGADA", factura: null });

    await expect(deleteManoDeObraAction("m1", "o1")).rejects.toThrow(
      "No se puede modificar una orden en estado ENTREGADA.",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("blocks deleting a labor line when the order already has a factura", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "TERMINADA", factura: { id: "f1" } });

    await expect(deleteManoDeObraAction("m1", "o1")).rejects.toThrow(
      "No se puede modificar una orden que ya tiene una factura generada.",
    );
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("throws when the labor line exists but belongs to a different orden", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteManoDeObraAction("m1", "o1")).rejects.toThrow("Registro no encontrado en esta orden");
  });

  it("refuses to touch an orden from another sede", async () => {
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);

    await expect(deleteManoDeObraAction("m1", "orden-de-otra-sede")).rejects.toThrow("Orden no encontrada");
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      select: { estado: true, factura: { select: { id: true } } },
    });
  });
});

