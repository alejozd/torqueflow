import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: () => mockRequireSession(),
}));

const mockCitaFindMany = vi.fn();
const mockCitaFindFirst = vi.fn();
const mockCitaCreate = vi.fn();
const mockCitaUpdateMany = vi.fn();
const mockCitaDeleteMany = vi.fn();
const mockVehiculoFindMany = vi.fn();
const mockVehiculoFindUnique = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    cita: {
      findMany: mockCitaFindMany,
      findFirst: mockCitaFindFirst,
      create: mockCitaCreate,
      updateMany: mockCitaUpdateMany,
      deleteMany: mockCitaDeleteMany,
    },
    vehiculo: { findMany: mockVehiculoFindMany, findUnique: mockVehiculoFindUnique },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  cambiarEstadoCitaAction,
  createCitaAction,
  deleteCitaAction,
  getCita,
  listCitas,
  listVehiculosParaCita,
  updateCitaAction,
  type CitaFormState,
} from "./cita-actions";

const initialState: CitaFormState = { error: null, success: false };
const RECEPCION = {
  user: { id: "u-rec", role: "RECEPCION", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
};
const ADMIN = {
  user: { id: "u-adm", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
};

function formularioValido(): FormData {
  const formData = new FormData();
  formData.set("vehiculoId", "veh-1");
  formData.set("fechaHora", "2026-09-01T10:30");
  formData.set("motivo", "Cambio de aceite");
  formData.set("notas", "");
  return formData;
}

beforeEach(() => {
  mockRequireRole.mockReset().mockResolvedValue(RECEPCION);
  mockRequireSession.mockReset().mockResolvedValue(RECEPCION);
  mockCitaFindMany.mockReset().mockResolvedValue([]);
  mockCitaFindFirst.mockReset().mockResolvedValue(null);
  mockCitaCreate.mockReset().mockResolvedValue({ id: "cita-1" });
  mockCitaUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mockCitaDeleteMany.mockReset().mockResolvedValue({ count: 1 });
  mockVehiculoFindMany.mockReset().mockResolvedValue([]);
  mockVehiculoFindUnique.mockReset().mockResolvedValue({ id: "veh-1", clienteId: "cli-1" });
});

describe("listCitas", () => {
  it("is readable by any authenticated role and filters by the sede activa", async () => {
    await listCitas();

    expect(mockRequireSession).toHaveBeenCalled();
    expect(mockCitaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sedeId: "sede-1" }, orderBy: { fechaHora: "asc" } }),
    );
  });

  it("adds the estado filter without dropping the sede filter", async () => {
    await listCitas("CONFIRMADA");

    expect(mockCitaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sedeId: "sede-1", estado: "CONFIRMADA" } }),
    );
  });
});

describe("getCita", () => {
  it("uses findFirst with the sede filter, never findUnique -- this is the IDOR boundary", async () => {
    await getCita("cita-1");

    expect(mockCitaFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cita-1", sedeId: "sede-1" } }),
    );
  });

  it("returns null for a cita in another sede", async () => {
    mockCitaFindFirst.mockResolvedValue(null);

    expect(await getCita("cita-de-otra-sede")).toBeNull();
  });
});

describe("listVehiculosParaCita", () => {
  it("is deliberately NOT sede-scoped: vehículos are tenant-wide", async () => {
    mockVehiculoFindMany.mockResolvedValue([
      { id: "veh-1", placa: "ABC123", marca: "Mazda", modelo: "3", cliente: { nombre: "Ana" } },
    ]);

    const resultado = await listVehiculosParaCita();

    expect(resultado).toEqual([
      { id: "veh-1", placa: "ABC123", marca: "Mazda", modelo: "3", clienteNombre: "Ana" },
    ]);
    const args = mockVehiculoFindMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
  });
});

describe("createCitaAction", () => {
  it("is limited to ADMIN and RECEPCION", async () => {
    await createCitaAction(initialState, formularioValido());

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
  });

  it("calls the guard before validating, so an invalid form from a forbidden role still redirects", async () => {
    mockRequireRole.mockRejectedValue(new Error("REDIRECT:/login?error=forbidden"));

    await expect(createCitaAction(initialState, new FormData())).rejects.toThrow(
      "REDIRECT:/login?error=forbidden",
    );
    expect(mockCitaCreate).not.toHaveBeenCalled();
  });

  it("stamps the sede activa and the creating user, and derives clienteId from the vehículo", async () => {
    const resultado = await createCitaAction(initialState, formularioValido());

    expect(resultado).toEqual({ error: null, success: true });
    expect(mockCitaCreate).toHaveBeenCalledWith({
      data: {
        clienteId: "cli-1",
        vehiculoId: "veh-1",
        sedeId: "sede-1",
        fechaHora: new Date("2026-09-01T10:30"),
        motivo: "Cambio de aceite",
        notas: null,
        creadoPorId: "u-rec",
      },
    });
  });

  it("refuses a vehiculoId that does not exist", async () => {
    mockVehiculoFindUnique.mockResolvedValue(null);

    const resultado = await createCitaAction(initialState, formularioValido());

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe("El vehículo seleccionado no existe.");
    expect(mockCitaCreate).not.toHaveBeenCalled();
  });

  it("returns the Spanish validation message when motivo is missing", async () => {
    const formData = formularioValido();
    formData.delete("motivo");

    const resultado = await createCitaAction(initialState, formData);

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe("El motivo es obligatorio");
    expect(mockCitaCreate).not.toHaveBeenCalled();
  });
});

describe("updateCitaAction", () => {
  it("writes through updateMany carrying the sede filter, never update-by-id", async () => {
    const resultado = await updateCitaAction("cita-1", initialState, formularioValido());

    expect(resultado).toEqual({ error: null, success: true });
    expect(mockCitaUpdateMany).toHaveBeenCalledWith({
      where: { id: "cita-1", sedeId: "sede-1" },
      data: {
        vehiculoId: "veh-1",
        clienteId: "cli-1",
        fechaHora: new Date("2026-09-01T10:30"),
        motivo: "Cambio de aceite",
        notas: null,
      },
    });
  });

  it("reports a not-found instead of silently succeeding when the cita is in another sede", async () => {
    mockCitaUpdateMany.mockResolvedValue({ count: 0 });

    const resultado = await updateCitaAction("cita-ajena", initialState, formularioValido());

    expect(resultado).toEqual({ error: "Cita no encontrada", success: false });
  });
});

describe("cambiarEstadoCitaAction", () => {
  it("is limited to ADMIN and RECEPCION and writes through updateMany with the sede filter", async () => {
    const formData = new FormData();
    formData.set("estado", "CANCELADA");

    const resultado = await cambiarEstadoCitaAction("cita-1", initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(resultado).toEqual({ error: null, success: true });
    expect(mockCitaUpdateMany).toHaveBeenCalledWith({
      where: { id: "cita-1", sedeId: "sede-1" },
      data: { estado: "CANCELADA" },
    });
  });

  it("rejects an estado that is not part of EstadoCita", async () => {
    const formData = new FormData();
    formData.set("estado", "ENTREGADA");

    const resultado = await cambiarEstadoCitaAction("cita-1", initialState, formData);

    expect(resultado.success).toBe(false);
    expect(resultado.error).toBe("Estado de cita inválido");
    expect(mockCitaUpdateMany).not.toHaveBeenCalled();
  });

  it("reports a not-found when the cita belongs to another sede", async () => {
    mockCitaUpdateMany.mockResolvedValue({ count: 0 });
    const formData = new FormData();
    formData.set("estado", "CONFIRMADA");

    const resultado = await cambiarEstadoCitaAction("cita-ajena", initialState, formData);

    expect(resultado).toEqual({ error: "Cita no encontrada", success: false });
  });
});

describe("deleteCitaAction", () => {
  it("is ADMIN-only, stricter than booking", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);

    await deleteCitaAction("cita-1");

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockCitaDeleteMany).toHaveBeenCalledWith({ where: { id: "cita-1", sedeId: "sede-1" } });
  });

  it("throws instead of silently doing nothing when the cita is in another sede", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    mockCitaDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteCitaAction("cita-ajena")).rejects.toThrow("Cita no encontrada");
  });
});
