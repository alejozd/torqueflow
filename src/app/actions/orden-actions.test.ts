import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockSedeFindFirst = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: { create: mockCreate, findMany: mockFindMany, findUnique: mockFindUnique, update: mockUpdate },
    sede: { findFirst: mockSedeFindFirst },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createOrdenAction,
  listOrdenes,
  getOrden,
  updateEstadoOrdenAction,
  type OrdenFormState,
  type EstadoFormState,
} from "./orden-actions";

const initialState: OrdenFormState = { error: null, success: false };

describe("createOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez" } });
    mockCreate.mockReset();
    mockSedeFindFirst.mockReset().mockResolvedValue({ id: "s1", nombre: "Sede principal" });
  });

  it("returns a validation error for a negative kilometraje", async () => {
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "-5");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El kilometraje no puede ser negativo");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the order attached to the tenant's default Sede on valid input", async () => {
    mockCreate.mockResolvedValue({ id: "o1" });
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "12000");
    formData.set("sintomas", "Ruido al frenar");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "c1",
        vehiculoId: "v1",
        sedeId: "s1",
        creadoPorId: "u1",
        mecanicoId: null,
        kilometrajeIngreso: 12000,
        sintomas: "Ruido al frenar",
      },
    });
  });

  it("returns an error when the tenant has no Sede (should never happen post-provisioning, but guarded)", async () => {
    mockSedeFindFirst.mockResolvedValue(null);
    const formData = new FormData();

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("No hay una sede configurada para este taller.");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("propagates the redirect rejection and never touches the database when requireRole rejects (unauthorized)", async () => {
    mockRequireRole.mockReset().mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));
    const formData = new FormData();

    await expect(createOrdenAction("c1", "v1", initialState, formData)).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("listOrdenes", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindMany.mockReset();
  });

  it("lists all orders when no estado filter is given", async () => {
    mockFindMany.mockResolvedValue([{ id: "o1" }]);

    const result = await listOrdenes();

    expect(result).toEqual([{ id: "o1" }]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined, orderBy: { createdAt: "desc" } }),
    );
  });

  it("filters by estado when given", async () => {
    mockFindMany.mockResolvedValue([]);

    await listOrdenes("EN_PROCESO");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: "EN_PROCESO" } }),
    );
  });
});

describe("getOrden", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { role: "RECEPCION", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset();
  });

  it("returns null when the order does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getOrden("missing");

    expect(result).toBeNull();
  });
});

describe("updateEstadoOrdenAction", () => {
  const initialEstadoState: EstadoFormState = { error: null };

  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { role: "TECNICO", tenantSchema: "taller_perez" } });
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it("rejects an invalid estado value", async () => {
    const formData = new FormData();
    formData.set("estado", "NOT_A_REAL_ESTADO");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("Estado inválido");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a transition that skips states (BORRADOR straight to TERMINADA)", async () => {
    mockFindUnique.mockResolvedValue({ id: "o1", estado: "BORRADOR" });
    const formData = new FormData();
    formData.set("estado", "TERMINADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("No se puede cambiar de BORRADOR a TERMINADA");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("applies a valid transition and stamps entregadaAt when moving to ENTREGADA", async () => {
    mockFindUnique.mockResolvedValue({ id: "o1", estado: "TERMINADA" });
    mockUpdate.mockResolvedValue({ id: "o1", estado: "ENTREGADA" });
    const formData = new FormData();
    formData.set("estado", "ENTREGADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { estado: "ENTREGADA", entregadaAt: expect.any(Date), anuladaAt: undefined },
    });
  });

  it("returns 'Orden no encontrada' when the order does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("missing", initialEstadoState, formData);

    expect(result.error).toBe("Orden no encontrada");
  });
});
