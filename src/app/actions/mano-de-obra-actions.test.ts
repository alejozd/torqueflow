import { describe, expect, it, vi, beforeEach } from "vitest";
import { permisosEfectivos } from "@/lib/auth/permisos";

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
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addManoDeObraAction, deleteManoDeObraAction, type ManoDeObraFormState } from "./mano-de-obra-actions";

const initialState: ManoDeObraFormState = { error: null, success: false };
const SESSION = { user: { role: "TECNICO", permisos: ["ordenes.verTodas"], tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const SESSION_ADMIN = { user: { role: "ADMIN", permisos: ["ordenes.verTodas"], tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("addManoDeObraAction", () => {
  beforeEach(() => {
    mockRequirePermiso.mockReset().mockResolvedValue(SESSION);
    mockCreate.mockReset();
    mockOrdenFindFirst.mockReset().mockResolvedValue({ estado: "EN_PROCESO", factura: null });
    mockUsuarioFindFirst.mockReset().mockResolvedValue({ id: "t1" });
  });

  it("returns a validation error when valor is negative", async () => {
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("valor", "-5");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El valor no puede ser negativo");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a validation error when valor is left blank, instead of silently defaulting to 0", async () => {
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("valor", "");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El valor es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the labor line linked to the given ordenId on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "m1" });
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("valor", "30000");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Cambio de pastillas de freno", valor: 30000, mecanicoId: null },
    });
    expect(mockUsuarioFindFirst).not.toHaveBeenCalled();
  });

  it("assigns a técnico to the labor line after confirming they belong to the sede activa", async () => {
    mockCreate.mockResolvedValue({ id: "m1" });
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("valor", "30000");
    formData.set("mecanicoId", "t1");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUsuarioFindFirst).toHaveBeenCalledWith({
      where: { id: "t1", role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } },
      select: { id: true },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: { ordenId: "o1", descripcion: "Cambio de pastillas de freno", valor: 30000, mecanicoId: "t1" },
    });
  });

  it("rejects a técnico that does not belong to (or does not exist in) the sede activa", async () => {
    mockUsuarioFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("valor", "30000");
    formData.set("mecanicoId", "t-otra-sede");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result).toEqual({
      error: "El técnico seleccionado no existe o no pertenece a esta sede.",
      success: false,
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("blocks adding a labor line when the order is in a terminal state (ENTREGADA)", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "ENTREGADA", factura: null });
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("valor", "30000");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se puede modificar una orden en estado ENTREGADA.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("blocks adding a labor line when the order already has a factura", async () => {
    mockOrdenFindFirst.mockResolvedValue({ estado: "TERMINADA", factura: { id: "f1" } });
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("valor", "30000");

    const result = await addManoDeObraAction("o1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No se puede modificar una orden que ya tiene una factura generada.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses to touch an orden from another sede", async () => {
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas de freno");
    formData.set("valor", "30000");

    const result = await addManoDeObraAction("orden-de-otra-sede", initialState, formData);

    expect(result).toEqual({ error: "Orden no encontrada", success: false });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      select: { estado: true, factura: { select: { id: true } } },
    });
  });
});

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

const TECNICO_D7 = { user: { id: "tec-1", role: "TECNICO", permisos: permisosEfectivos({ role: "TECNICO" }), tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };
const WHERE_D7 = (id: string) => ({ id, sedeId: "sede-1", OR: [{ mecanicoId: "tec-1" }, { manoDeObra: { some: { mecanicoId: "tec-1" } } }] });

describe("D7: el técnico solo trabaja en sus órdenes (mano de obra)", () => {
  it("una orden ajena no se encuentra y no se crea la línea", async () => {
    mockRequirePermiso.mockReset().mockResolvedValue(TECNICO_D7);
    mockOrdenFindFirst.mockReset().mockResolvedValue(null);
    mockCreate.mockReset();
    const formData = new FormData();
    formData.set("descripcion", "Cambio de pastillas");
    formData.set("valor", "30000");

    const result = await addManoDeObraAction("ajena", initialState, formData);

    expect(result).toEqual({ error: "Orden no encontrada", success: false });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: WHERE_D7("ajena") }));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
