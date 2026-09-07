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
const mockSedeFindMany = vi.fn();
const mockOrdenGroupBy = vi.fn();
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
    ordenTrabajo: { groupBy: mockOrdenGroupBy },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockObtenerLimitesPlan = vi.fn();
vi.mock("@/lib/planes/limites", () => ({
  obtenerLimitesPlan: (...args: unknown[]) => mockObtenerLimitesPlan(...args),
}));

const mockClaimTenantUserEmail = vi.fn();
const mockReleaseTenantUserEmail = vi.fn();
vi.mock("@/lib/tenant/tenant-user-email", () => {
  class TenantUserEmailConflictError extends Error {}
  return {
    claimTenantUserEmail: (...args: unknown[]) => mockClaimTenantUserEmail(...args),
    releaseTenantUserEmail: (...args: unknown[]) => mockReleaseTenantUserEmail(...args),
    TenantUserEmailConflictError,
  };
});

import { TenantUserEmailConflictError } from "@/lib/tenant/tenant-user-email";
import {
  listUsuariosConSedes,
  listUsuariosConMetricas,
  createUsuarioAction,
  updateUsuarioAction,
  deleteUsuarioAction,
  type UsuarioFormState,
} from "./usuario-actions";

const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

/**
 * Mimics tenantDb.sede.findMany({ where: { id: { in: [...] } } }) by actually
 * filtering the requested ids against the tenant's known sedes, instead of a
 * fixed resolved value -- the sede-existence check's `existentes.length !==
 * idsAVerificar.length` comparison depends on genuinely matching only the
 * requested ids, not an unrelated fixed array.
 */
function stubSedeFindMany(existingIds: string[]) {
  const known = new Set(existingIds);
  mockSedeFindMany.mockReset().mockImplementation(async (args: { where?: { id?: { in?: string[] } } }) => {
    const requested = args?.where?.id?.in ?? [];
    return requested.filter((id) => known.has(id)).map((id) => ({ id }));
  });
}

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
        activo: true,
        sedeDefectoId: true,
        sedes: { select: { sedeId: true } },
      },
      orderBy: { nombre: "asc" },
    });
  });

  it("flattens the bridge rows into a plain sedeIds array and passes through activo/sedeDefectoId", async () => {
    mockUsuarioFindMany.mockResolvedValue([
      {
        id: "u2",
        nombre: "Tec E2E",
        email: "tec@example.test",
        role: "TECNICO",
        activo: true,
        sedeDefectoId: "sede-1",
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
        activo: true,
        sedeDefectoId: "sede-1",
        sedeIds: ["sede-1", "sede-2"],
      },
    ]);
  });
});

describe("listUsuariosConMetricas", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioFindMany.mockReset();
    mockOrdenGroupBy.mockReset();
  });

  it("is ADMIN-only and never selects passwordHash", async () => {
    mockUsuarioFindMany.mockResolvedValue([]);
    mockOrdenGroupBy.mockResolvedValue([]);

    await listUsuariosConMetricas();

    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mockUsuarioFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        activo: true,
        sedeDefectoId: true,
        sedes: { select: { sedeId: true } },
      },
      orderBy: { nombre: "asc" },
    });
  });

  it("merges ordenesActivas per usuario (mecánico), defaulting to 0", async () => {
    mockUsuarioFindMany.mockResolvedValue([
      {
        id: "u1",
        nombre: "Ana",
        email: "ana@taller.test",
        role: "TECNICO",
        activo: true,
        sedeDefectoId: null,
        sedes: [{ sedeId: "sede-1" }],
      },
      {
        id: "u2",
        nombre: "Beto",
        email: "beto@taller.test",
        role: "RECEPCION",
        activo: false,
        sedeDefectoId: null,
        sedes: [],
      },
    ]);
    mockOrdenGroupBy.mockResolvedValue([{ mecanicoId: "u1", _count: { mecanicoId: 4 } }]);

    const result = await listUsuariosConMetricas();

    expect(result).toEqual([
      {
        id: "u1",
        nombre: "Ana",
        email: "ana@taller.test",
        role: "TECNICO",
        activo: true,
        sedeDefectoId: null,
        sedeIds: ["sede-1"],
        ordenesActivas: 4,
      },
      {
        id: "u2",
        nombre: "Beto",
        email: "beto@taller.test",
        role: "RECEPCION",
        activo: false,
        sedeDefectoId: null,
        sedeIds: [],
        ordenesActivas: 0,
      },
    ]);
  });

  it("counts only órdenes not entregadas/anuladas as activas, excluding unassigned órdenes", async () => {
    mockUsuarioFindMany.mockResolvedValue([]);
    mockOrdenGroupBy.mockResolvedValue([]);

    await listUsuariosConMetricas();

    expect(mockOrdenGroupBy).toHaveBeenCalledWith({
      by: ["mecanicoId"],
      where: { estado: { notIn: ["ENTREGADA", "ANULADA"] }, mecanicoId: { not: null } },
      _count: { mecanicoId: true },
    });
  });
});

const initialUsuarioState: UsuarioFormState = { error: null, success: false };

function buildUsuarioFormData(overrides: Record<string, string | string[]> = {}): FormData {
  const formData = new FormData();
  formData.set("nombre", "Ana Pérez");
  formData.set("email", "ana@taller.test");
  formData.set("password", "contraseña-larga");
  formData.set("role", "TECNICO");
  formData.set("activo", "true");
  formData.append("sedeIds", "sede-1");
  formData.set("sedeDefectoId", "");
  for (const [key, value] of Object.entries(overrides)) {
    if (key === "sedeIds") {
      formData.delete("sedeIds");
      for (const v of Array.isArray(value) ? value : [value]) formData.append("sedeIds", v);
    } else {
      formData.set(key, Array.isArray(value) ? value[0] : value);
    }
  }
  return formData;
}

describe("createUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockObtenerLimitesPlan.mockReset().mockResolvedValue({ maxUsuarios: null, maxSedes: null });
    mockUsuarioCount.mockReset();
    mockUsuarioCreate.mockReset();
    mockUsuarioDelete.mockReset().mockResolvedValue({});
    stubSedeFindMany(["sede-1", "sede-2"]);
    mockClaimTenantUserEmail.mockReset().mockResolvedValue(undefined);
  });

  it("creates a usuario when under the plan's maxUsuarios limit, nesting the sede assignment in one create call", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: 3, maxSedes: null });
    mockUsuarioCount.mockResolvedValue(1);
    mockUsuarioCreate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData();

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUsuarioCreate).toHaveBeenCalledWith({
      data: {
        nombre: "Ana Pérez",
        email: "ana@taller.test",
        passwordHash: expect.any(String),
        role: "TECNICO",
        activo: true,
        sedeDefectoId: null,
        sedes: { create: [{ sedeId: "sede-1" }] },
      },
    });
  });

  it("allows an ADMIN to be created with an empty sedeIds (ADMIN bypasses assignment)", async () => {
    mockUsuarioCreate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData({ role: "ADMIN", sedeIds: [] });

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUsuarioCreate).toHaveBeenCalledWith({
      data: {
        nombre: "Ana Pérez",
        email: "ana@taller.test",
        passwordHash: expect.any(String),
        role: "ADMIN",
        activo: true,
        sedeDefectoId: null,
        sedes: { create: [] },
      },
    });
  });

  it("persists sedeDefectoId when provided and valid", async () => {
    mockUsuarioCreate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData({ sedeIds: ["sede-1", "sede-2"], sedeDefectoId: "sede-2" });

    await createUsuarioAction(initialUsuarioState, formData);

    expect(mockUsuarioCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sedeDefectoId: "sede-2" }),
    });
  });

  it("rejects a sedeId that does not belong to this tenant before writing", async () => {
    const formData = buildUsuarioFormData({ sedeIds: ["sede-fantasma"] });

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({ error: "Una de las sedes seleccionadas no existe.", success: false });
    expect(mockUsuarioCreate).not.toHaveBeenCalled();
  });

  it("refuses to create a usuario once the plan's maxUsuarios limit is reached", async () => {
    mockObtenerLimitesPlan.mockResolvedValue({ maxUsuarios: 3, maxSedes: null });
    mockUsuarioCount.mockResolvedValue(3);
    const formData = buildUsuarioFormData();

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({
      error: "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    expect(mockUsuarioCreate).not.toHaveBeenCalled();
  });

  it("rejects a short password before touching the database", async () => {
    const formData = buildUsuarioFormData({ password: "corta" });

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result.error).toBe("La contraseña debe tener al menos 8 caracteres");
    expect(mockUsuarioCreate).not.toHaveBeenCalled();
  });

  it("registers the new email in the public tenant_user_emails index", async () => {
    mockUsuarioCreate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData();

    await createUsuarioAction(initialUsuarioState, formData);

    expect(mockClaimTenantUserEmail).toHaveBeenCalledWith("taller_perez", "ana@taller.test");
  });

  it("rolls back the just-created usuario and returns a Spanish error when the email belongs to another tenant", async () => {
    mockUsuarioCreate.mockResolvedValue({ id: "u2" });
    mockClaimTenantUserEmail.mockRejectedValue(new TenantUserEmailConflictError("ana@taller.test"));
    const formData = buildUsuarioFormData();

    const result = await createUsuarioAction(initialUsuarioState, formData);

    expect(result).toEqual({ error: "Este correo ya está registrado en otro taller.", success: false });
    expect(mockUsuarioDelete).toHaveBeenCalledWith({ where: { id: "u2" } });
  });
});

describe("updateUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioFindUnique.mockReset().mockResolvedValue({ role: "RECEPCION", email: "ana@taller.test" });
    mockUsuarioCount.mockReset();
    mockUsuarioUpdate.mockReset();
    stubSedeFindMany(["sede-1", "sede-2"]);
    mockClaimTenantUserEmail.mockReset().mockResolvedValue(undefined);
    mockReleaseTenantUserEmail.mockReset().mockResolvedValue(undefined);
  });

  it("updates nombre/email/role/activo/sedeIds without touching the password when the field is blank", async () => {
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData({ nombre: "Ana P.", email: "ana2@taller.test", password: "" });

    const result = await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
    expect(mockUsuarioUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: {
        nombre: "Ana P.",
        email: "ana2@taller.test",
        role: "TECNICO",
        activo: true,
        sedeDefectoId: null,
        sedes: { deleteMany: {}, create: [{ sedeId: "sede-1" }] },
      },
    });
  });

  it("rehashes the password only when a new one is submitted", async () => {
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData({
      nombre: "Ana P.",
      email: "ana2@taller.test",
      password: "otra-contraseña-larga",
    });

    await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(mockUsuarioUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: expect.objectContaining({ passwordHash: expect.any(String) }),
    });
  });

  it("persists activo:false and sedeDefectoId", async () => {
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData({
      password: "",
      activo: "false",
      sedeIds: ["sede-1", "sede-2"],
      sedeDefectoId: "sede-2",
    });

    await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(mockUsuarioUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: expect.objectContaining({
        activo: false,
        sedeDefectoId: "sede-2",
        sedes: { deleteMany: {}, create: [{ sedeId: "sede-1" }, { sedeId: "sede-2" }] },
      }),
    });
  });

  it("rejects a sedeId that does not belong to this tenant before writing", async () => {
    const formData = buildUsuarioFormData({ password: "", sedeIds: ["sede-fantasma"] });

    const result = await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(result).toEqual({ error: "Una de las sedes seleccionadas no existe.", success: false });
    expect(mockUsuarioUpdate).not.toHaveBeenCalled();
  });

  it("refuses to demote the last ADMIN", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN", email: "ana@taller.test" });
    mockUsuarioCount.mockResolvedValue(1);
    const formData = buildUsuarioFormData({ password: "", role: "TECNICO" });

    const result = await updateUsuarioAction("u1", initialUsuarioState, formData);

    expect(result).toEqual({
      error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
      success: false,
    });
    expect(mockUsuarioUpdate).not.toHaveBeenCalled();
  });

  it("allows demoting an ADMIN when a second ADMIN still exists", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN", email: "ana@taller.test" });
    mockUsuarioCount.mockResolvedValue(2);
    mockUsuarioUpdate.mockResolvedValue({ id: "u1" });
    const formData = buildUsuarioFormData({ password: "", role: "TECNICO" });

    const result = await updateUsuarioAction("u1", initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
  });

  it("refuses to suspend (activo:false) the last active ADMIN", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN", email: "ana@taller.test" });
    mockUsuarioCount.mockResolvedValue(1);
    const formData = buildUsuarioFormData({ password: "", role: "ADMIN", activo: "false", sedeIds: [] });

    const result = await updateUsuarioAction("u1", initialUsuarioState, formData);

    expect(result).toEqual({
      error: "No puedes suspender al único administrador activo del taller.",
      success: false,
    });
    expect(mockUsuarioUpdate).not.toHaveBeenCalled();
    expect(mockUsuarioCount).toHaveBeenCalledWith({ where: { role: "ADMIN", activo: true } });
  });

  it("allows suspending an ADMIN when a second active ADMIN still exists", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN", email: "ana@taller.test" });
    mockUsuarioCount.mockResolvedValue(2);
    mockUsuarioUpdate.mockResolvedValue({ id: "u1" });
    const formData = buildUsuarioFormData({ password: "", role: "ADMIN", activo: "false", sedeIds: [] });

    const result = await updateUsuarioAction("u1", initialUsuarioState, formData);

    expect(result).toEqual({ error: null, success: true });
  });

  it("returns 'Usuario no encontrado' and writes nothing when the usuario does not exist", async () => {
    mockUsuarioFindUnique.mockResolvedValue(null);
    const formData = buildUsuarioFormData({ password: "", role: "TECNICO" });

    const result = await updateUsuarioAction("u-inexistente", initialUsuarioState, formData);

    expect(result).toEqual({ error: "Usuario no encontrado", success: false });
    expect(mockUsuarioUpdate).not.toHaveBeenCalled();
  });

  it("claims the new email and releases the old one in the public index when the email changes", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "RECEPCION", email: "ana@taller.test" });
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData({ nombre: "Ana P.", email: "ana2@taller.test", password: "" });

    await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(mockClaimTenantUserEmail).toHaveBeenCalledWith("taller_perez", "ana2@taller.test");
    expect(mockReleaseTenantUserEmail).toHaveBeenCalledWith("ana@taller.test");
  });

  it("does not touch the email index when the email is unchanged", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "RECEPCION", email: "ana@taller.test" });
    mockUsuarioUpdate.mockResolvedValue({ id: "u2" });
    const formData = buildUsuarioFormData({ nombre: "Ana P.", email: "ana@taller.test", password: "" });

    await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(mockClaimTenantUserEmail).not.toHaveBeenCalled();
    expect(mockReleaseTenantUserEmail).not.toHaveBeenCalled();
    expect(mockUsuarioUpdate).toHaveBeenCalled();
  });

  it("returns a Spanish error and writes nothing when the new email belongs to another tenant", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "RECEPCION", email: "ana@taller.test" });
    mockClaimTenantUserEmail.mockRejectedValue(new TenantUserEmailConflictError("tomado@otro.test"));
    const formData = buildUsuarioFormData({ nombre: "Ana P.", email: "tomado@otro.test", password: "" });

    const result = await updateUsuarioAction("u2", initialUsuarioState, formData);

    expect(result).toEqual({ error: "Este correo ya está registrado en otro taller.", success: false });
    expect(mockUsuarioUpdate).not.toHaveBeenCalled();
    expect(mockReleaseTenantUserEmail).not.toHaveBeenCalled();
  });
});

describe("deleteUsuarioAction", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue(ADMIN);
    mockUsuarioFindUnique.mockReset();
    mockUsuarioCount.mockReset();
    mockUsuarioDelete.mockReset();
    mockReleaseTenantUserEmail.mockReset().mockResolvedValue(undefined);
  });

  it("refuses to delete the last ADMIN", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "ADMIN", email: "admin@taller.test" });
    mockUsuarioCount.mockResolvedValue(1);

    await expect(deleteUsuarioAction("u1")).rejects.toThrow(
      "No puedes eliminar al único administrador del taller.",
    );
    expect(mockUsuarioDelete).not.toHaveBeenCalled();
    expect(mockReleaseTenantUserEmail).not.toHaveBeenCalled();
  });

  it("deletes a non-ADMIN usuario without checking the ADMIN count, and releases its email from the index", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "TECNICO", email: "tec@taller.test" });
    mockUsuarioDelete.mockResolvedValue({ id: "u2" });

    await deleteUsuarioAction("u2");

    expect(mockUsuarioCount).not.toHaveBeenCalled();
    expect(mockUsuarioDelete).toHaveBeenCalledWith({ where: { id: "u2" } });
    expect(mockReleaseTenantUserEmail).toHaveBeenCalledWith("tec@taller.test");
  });

  it("translates a foreign-key-protected delete into the generic Spanish message, without releasing the email", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ role: "TECNICO", email: "tec@taller.test" });
    mockUsuarioDelete.mockRejectedValue({ code: "P2003" });

    await expect(deleteUsuarioAction("u2")).rejects.toThrow(
      "No se puede completar la operación porque hay registros relacionados.",
    );
    expect(mockReleaseTenantUserEmail).not.toHaveBeenCalled();
  });
});
