import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireSession: vi.fn(),
}));

const mockUsuarioFindMany = vi.fn();
const mockUsuarioSedeDeleteMany = vi.fn();
const mockUsuarioSedeCreateMany = vi.fn();
const mockSedeFindMany = vi.fn();
const mockTransaction = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    usuario: { findMany: mockUsuarioFindMany },
    sede: { findMany: mockSedeFindMany },
    usuarioSede: { deleteMany: mockUsuarioSedeDeleteMany, createMany: mockUsuarioSedeCreateMany },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listUsuariosConSedes,
  setUsuarioSedesAction,
  type UsuarioSedesFormState,
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
