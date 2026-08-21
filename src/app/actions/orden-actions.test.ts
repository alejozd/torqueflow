import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockOrdenFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockSedeFindFirst = vi.fn();
const mockUsuarioFindMany = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: {
      create: mockCreate,
      findMany: mockFindMany,
      findFirst: mockOrdenFindFirst,
      update: mockUpdate,
    },
    sede: { findFirst: mockSedeFindFirst },
    usuario: { findMany: mockUsuarioFindMany },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createOrdenAction,
  listOrdenes,
  listOrdenesByVehiculo,
  getOrden,
  listTecnicos,
  updateEstadoOrdenAction,
  type OrdenFormState,
  type EstadoFormState,
} from "./orden-actions";

const initialState: OrdenFormState = { error: null, success: false };
const SESSION = {
  user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
};

describe("createOrdenAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockCreate.mockReset();
    mockSedeFindFirst.mockReset();
  });

  it("returns a validation error for a negative kilometraje", async () => {
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "-5");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("El kilometraje no puede ser negativo");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the order in the session's sede activa, never looking up a default sede", async () => {
    mockCreate.mockResolvedValue({ id: "o1" });
    const formData = new FormData();
    formData.set("kilometrajeIngreso", "45000");
    formData.set("sintomas", "Ruido al frenar");

    const result = await createOrdenAction("c1", "v1", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockSedeFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "c1",
        vehiculoId: "v1",
        sedeId: "sede-1",
        creadoPorId: "u1",
        mecanicoId: null,
        kilometrajeIngreso: 45000,
        sintomas: "Ruido al frenar",
      },
    });
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
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockFindMany.mockReset();
  });

  it("lists only órdenes of the sede activa", async () => {
    mockFindMany.mockResolvedValue([]);

    await listOrdenes();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1" },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });

  it("combines the estado filter with the sede filter instead of replacing it", async () => {
    mockFindMany.mockResolvedValue([]);

    await listOrdenes("EN_PROCESO");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sedeId: "sede-1", estado: "EN_PROCESO" },
      include: expect.anything(),
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("listOrdenesByVehiculo", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockFindMany.mockReset();
  });

  it("scopes a vehículo's órdenes to the sede activa (the vehículo itself is tenant-wide)", async () => {
    mockFindMany.mockResolvedValue([]);

    await listOrdenesByVehiculo("v1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { vehiculoId: "v1", sedeId: "sede-1" },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getOrden", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockOrdenFindFirst.mockReset();
  });

  it("uses findFirst with the sede filter for getOrden, so another sede's id resolves to null", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);

    const result = await getOrden("orden-de-otra-sede");

    expect(result).toBeNull();
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
      include: expect.anything(),
    });
  });
});

describe("listTecnicos", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockUsuarioFindMany.mockReset();
  });

  it("lists only técnicos assigned to the sede activa", async () => {
    mockUsuarioFindMany.mockResolvedValue([]);

    await listTecnicos();

    expect(mockUsuarioFindMany).toHaveBeenCalledWith({
      where: { role: "TECNICO", sedes: { some: { sedeId: "sede-1" } } },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  });
});

describe("updateEstadoOrdenAction", () => {
  const initialEstadoState: EstadoFormState = { error: null };

  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(SESSION);
    mockOrdenFindFirst.mockReset();
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
    mockOrdenFindFirst.mockResolvedValue({ id: "o1", estado: "BORRADOR" });
    const formData = new FormData();
    formData.set("estado", "TERMINADA");

    const result = await updateEstadoOrdenAction("o1", initialEstadoState, formData);

    expect(result.error).toBe("No se puede cambiar de BORRADOR a TERMINADA");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("applies a valid transition and stamps entregadaAt when moving to ENTREGADA", async () => {
    mockOrdenFindFirst.mockResolvedValue({ id: "o1", estado: "TERMINADA" });
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
    mockOrdenFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("missing", initialEstadoState, formData);

    expect(result.error).toBe("Orden no encontrada");
  });

  it("refuses to change the estado of an orden from another sede", async () => {
    mockOrdenFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("estado", "EN_PROCESO");

    const result = await updateEstadoOrdenAction("orden-de-otra-sede", initialEstadoState, formData);

    expect(result).toEqual({ error: "Orden no encontrada" });
    expect(mockOrdenFindFirst).toHaveBeenCalledWith({
      where: { id: "orden-de-otra-sede", sedeId: "sede-1" },
    });
  });
});
