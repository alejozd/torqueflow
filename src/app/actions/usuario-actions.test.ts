import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockUsuarioFindMany = vi.fn();
const mockUsuarioFindUnique = vi.fn();
const mockUsuarioCreate = vi.fn();
const mockUsuarioUpdate = vi.fn();
const mockUsuarioDelete = vi.fn();
const mockUsuarioCount = vi.fn();
const mockUsuarioSedeDeleteMany = vi.fn();
const mockUsuarioSedeCreateMany = vi.fn();
const mockSedeFindMany = vi.fn();
const mockTransaction = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    usuario: {
      findMany: mockUsuarioFindMany,
      findUnique: mockUsuarioFindUnique,
      create: mockUsuarioCreate,
      update: mockUsuarioUpdate,
      delete: mockUsuarioDelete,
      count: mockUsuarioCount,
    },
    sede: { findMany: mockSedeFindMany },
    usuarioSede: { deleteMany: mockUsuarioSedeDeleteMany, createMany: mockUsuarioSedeCreateMany },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockObtenerLimitesPlan = vi.fn();
vi.mock("@/lib/planes/limites", () => ({
  obtenerLimitesPlan: (...args: unknown[]) => mockObtenerLimitesPlan(...args),
}));

import {
  listUsuariosConSedes,
  setUsuarioSedesAction,
  createUsuarioAction,
  updateUsuarioAction,
  deleteUsuarioAction,
  type UsuarioSedesFormState,
  type UsuarioFormState,
} from "./usuario-actions";

const initialState: UsuarioSedesFormState = { error: null, success: false };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

describe("listUsuariosConSedes", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioFindMany.mockReset();
  });

  it("is ADMIN-only and never selects passwordHash", async () => {
    mockUsuarioFindMany.mockResolvedValue([]);

    await listUsuariosConSedes();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockUsuarioFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        sedes: { select: { sedeId: true } },
      },
      orderBy: { nombre: "asc" },
    });
  });

  it("flattens the bridge rows into a plain sedeIds array", async () => {
    mockUsuarioFindMany.mockResolvedValue([
      {
        id: "u2",
        nombre: "Tec E2E",
        email: "tec@example.test",
        role: "TECNICO",
        sedes: [{ sedeId: "sede-1" }, { sedeId: "sede-2" }],
      },
    ]);

    const result = await listUsuariosConSedes();

    expect(result).toEqual([
      {
        id: "u2",
        nombre: "Tec E2E",
        email: "tec@example.test",
        role: "TECNICO",
        sedeIds: ["sede-1", "sede-2"],
      },
    ]);
  });
});

describe("setUsuarioSedesAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioSedeDeleteMany.mockReset();
    mockUsuarioSedeCreateMany.mockReset();
    mockSedeFindMany.mockReset().mockResolvedValue([{ id: "sede-1" }, { id: "sede-2" }]);
    mockTransaction.mockReset().mockResolvedValue(undefined);
  });

  it("is ADMIN-only", async () => {
    const formData = new FormData();
    formData.append("sedeIds", "sede-1");

    await setUsuarioSedesAction("u2", initialState, formData);

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("rejects an empty selection with the Spanish message and writes nothing", async () => {
    const result = await setUsuarioSedesAction("u2", initialState, new FormData());

    expect(result).toEqual({ error: "Selecciona al menos una sede", success: false });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects an id that does not belong to this tenant", async () => {
    const formData = new FormData();
    formData.append("sedeIds", "sede-de-otro-taller");

    const result = await setUsuarioSedesAction("u2", initialState, formData);

    expect(result).toEqual({
      error: "Una de las sedes seleccionadas no existe.",
      success: false,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("replaces the whole assignment set atomically", async () => {
    const formData = new FormData();
    formData.append("sedeIds", "sede-1");
    formData.append("sedeIds", "sede-2");

    const result = await setUsuarioSedesAction("u2", initialState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUsuarioSedeDeleteMany).toHaveBeenCalledWith({ where: { usuarioId: "u2" } });
    expect(mockUsuarioSedeCreateMany).toHaveBeenCalledWith({
      data: [
        { usuarioId: "u2", sedeId: "sede-1" },
        { usuarioId: "u2", sedeId: "sede-2" },
      ],
    });
  });
});

const initialUsuarioState: UsuarioFormState = { error: null, success: false };

describe("createUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockObtenerLimitesPlan.mockReset().mockResolvedValue({ maxUsuarios: null, maxSedes: null });
    mockUsuarioCount.mockReset();
    mockUsuarioCreate.mockReset();
  });

  it("creates a usuario when under the plan's maxUsuarios limit", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: 3, maxSedes: null });
    mockUsuarioCount.mockResolvedValue(1);
    mockUsuarioCreate.mockResolvedValue({ id: "u2" });
    const formData = new FormData();
    formData.set("nombre", "Ana Pérez");
    formData.set("email", "ana@taller.test");
    formData.set("password", "contraseña-larga");
    formData.set("role", "TECNICO");

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUsuarioCreate).toHaveBeenCalledWith({
      data: {
        nombre: "Ana Pérez",
        email: "ana@taller.test",
        passwordHash: expect.any(String),
        role: "TECNICO",
      },
    });
  });

  it("refuses to create a usuario once the plan's maxUsuarios limit is reached", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: 3, maxSedes: null });
    mockUsuarioCount.mockResolvedValue(3);
    const formData = new FormData();
    formData.set("nombre", "Ana Pérez");
    formData.set("email", "ana@taller.test");
    formData.set("password", "contraseña-larga");
    formData.set("role", "TECNICO");

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({
      error: "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    expect(mockUsuarioCreate).not.toHaveBeenCalled();
  });

  it("rejects a short password before touching the database", async () => {
    const formData = new FormData();
    formData.set("nombre", "Ana Pérez");
    formData.set("email", "ana@taller.test");
    formData.set("password", "corta");
    formData.set("role", "TECNICO");

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result.error).toBe("La contraseña debe tener al menos 8 caracteres");
    expect(mockUsuarioCreate).not.toHaveBeenCalled();
  });
});

describe("updateUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioFindUnique.mockReset();
    mockUsuarioCount.mockReset();
    mockUsuarioUpdate.mockReset();
  });

  it("updates nombre/email/role without touching the password when the field is blank", async () => {
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = new FormData();
    formData.set("nombre", "Ana P.");
    formData.set("email", "ana2@taller.test");
    formData.set("password", "");
    formData.set("role", "RECEPCION");

    const result = await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUsuarioUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { nombre: "Ana P.", email: "ana2@taller.test", role: "RECEPCION" },
    });
  });

  it("rehashes the password only when a new one is submitted", async () => {
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = new FormData();
    formData.set("nombre", "Ana P.");
    formData.set("email", "ana2@taller.test");
    formData.set("password", "otra-contraseña-larga");
    formData.set("role", "RECEPCION");

    await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(mockUsuarioUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { nombre: "Ana P.", email: "ana2@taller.test", role: "RECEPCION", passwordHash: expect.any(String) },
    });
  });

  it("refuses to demote the last ADMIN", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockUsuarioCount.mockResolvedValue(1);
    const formData = new FormData();
    formData.set("nombre", "Ana P.");
    formData.set("email", "ana@taller.test");
    formData.set("password", "");
    formData.set("role", "TECNICO");

    const result = await updateUsuarioAction("u1", initialUsuarioState, formData);

    expect(result).toEqual({
      error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
      success: false,
    });
    expect(mockUsuarioUpdate).not.toHaveBeenCalled();
  });

  it("allows demoting an ADMIN when a second ADMIN still exists", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockUsuarioCount.mockResolvedValue(2);
    mockUsuarioUpdate.mockResolvedValue({ id: "u1" });
    const formData = new FormData();
    formData.set("nombre", "Ana P.");
    formData.set("email", "ana@taller.test");
    formData.set("password", "");
    formData.set("role", "TECNICO");

    const result = await updateUsuarioAction("u1", initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
  });
});

describe("deleteUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioFindUnique.mockReset();
    mockUsuarioCount.mockReset();
    mockUsuarioDelete.mockReset();
  });

  it("refuses to delete the last ADMIN", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockUsuarioCount.mockResolvedValue(1);

    await expect(deleteUsuarioAction("u1")).rejects.toThrow(
      "No puedes eliminar al único administrador del taller.",
    );
    expect(mockUsuarioDelete).not.toHaveBeenCalled();
  });

  it("deletes a non-ADMIN usuario without checking the ADMIN count", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "TECNICO" });
    mockUsuarioDelete.mockResolvedValue({ id: "u2" });

    await deleteUsuarioAction("u2");

    expect(mockUsuarioCount).not.toHaveBeenCalled();
    expect(mockUsuarioDelete).toHaveBeenCalledWith({ where: { id: "u2" } });
  });

  it("translates a foreign-key-protected delete into the generic Spanish message", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "TECNICO" });
    mockUsuarioDelete.mockRejectedValue({ code: "P2003" });

    await expect(deleteUsuarioAction("u2")).rejects.toThrow(
      "No se puede completar la operación porque hay registros relacionados.",
    );
  });
});
