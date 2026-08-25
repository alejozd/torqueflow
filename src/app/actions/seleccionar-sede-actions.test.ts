import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
const mockUnstableUpdate = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => mockAuth(),
  unstable_update: (...args: unknown[]) => mockUnstableUpdate(...args),
}));

const mockGetTenantDb = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (...args: unknown[]) => mockGetTenantDb(...args),
}));

const mockResolveSedeActiva = vi.fn();
vi.mock("@/lib/auth/sede-access", () => ({
  resolveSedeActiva: (...args: unknown[]) => mockResolveSedeActiva(...args),
}));

import { seleccionarSedeAction } from "./seleccionar-sede-actions";

const SESSION = {
  user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "" },
};

describe("seleccionarSedeAction", () => {
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue(SESSION);
    mockGetTenantDb.mockReset().mockReturnValue({});
    mockResolveSedeActiva.mockReset();
    mockUnstableUpdate.mockReset().mockResolvedValue(null);
  });

  it("returns an error and never calls unstable_update when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const result = await seleccionarSedeAction("sede-1");

    expect(result.error).toBeTruthy();
    expect(mockUnstableUpdate).not.toHaveBeenCalled();
  });

  it("returns an error and never resolves a sede when sedeId is empty", async () => {
    const result = await seleccionarSedeAction("");

    expect(result.error).toBeTruthy();
    expect(mockResolveSedeActiva).not.toHaveBeenCalled();
    expect(mockUnstableUpdate).not.toHaveBeenCalled();
  });

  it("returns an error and never calls unstable_update when the sede is not valid for this usuario", async () => {
    mockResolveSedeActiva.mockResolvedValue(null);

    const result = await seleccionarSedeAction("sede-ajena");

    expect(result.error).toBeTruthy();
    expect(mockUnstableUpdate).not.toHaveBeenCalled();
  });

  it("validates the sede against the session's tenantSchema/usuarioId/role", async () => {
    const tenantDb = {};
    mockGetTenantDb.mockReturnValue(tenantDb);
    mockResolveSedeActiva.mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });

    await seleccionarSedeAction("sede-1");

    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_perez");
    expect(mockResolveSedeActiva).toHaveBeenCalledWith(tenantDb, "u1", "TECNICO", "sede-1");
  });

  it("completes the session via unstable_update and returns no error on success", async () => {
    mockResolveSedeActiva.mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });

    const result = await seleccionarSedeAction("sede-1");

    expect(result).toEqual({ error: null });
    expect(mockUnstableUpdate).toHaveBeenCalledWith({
      user: { sedeActivaId: "sede-1", sedeActivaNombre: "Sede principal" },
    });
  });
});
