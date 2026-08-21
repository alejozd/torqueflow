import { describe, expect, it, vi, beforeEach } from "vitest";

const mockResolveTenant = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({
  resolveTenant: () => mockResolveTenant(),
}));

const mockGetTenantDb = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (...args: unknown[]) => mockGetTenantDb(...args),
}));

const mockVerifyCredentials = vi.fn();
vi.mock("@/lib/auth/verify-credentials", () => ({
  verifyCredentials: (...args: unknown[]) => mockVerifyCredentials(...args),
}));

const mockResolveSedeActiva = vi.fn();
vi.mock("@/lib/auth/sede-access", () => ({
  resolveSedeActiva: (...args: unknown[]) => mockResolveSedeActiva(...args),
}));

import { authorizeCredentials } from "./authorize-credentials";

describe("authorizeCredentials", () => {
  beforeEach(() => {
    mockResolveTenant.mockReset();
    mockGetTenantDb.mockReset();
    mockVerifyCredentials.mockReset();
    mockResolveSedeActiva.mockReset();
  });

  it("returns null and never calls resolveTenant/verifyCredentials when email or password is missing/non-string", async () => {
    const result = await authorizeCredentials({ email: "user@example.com" });

    expect(result).toBeNull();
    expect(mockResolveTenant).not.toHaveBeenCalled();
    expect(mockGetTenantDb).not.toHaveBeenCalled();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null and never calls resolveTenant/verifyCredentials when credentials is undefined", async () => {
    const result = await authorizeCredentials(undefined);

    expect(result).toBeNull();
    expect(mockResolveTenant).not.toHaveBeenCalled();
    expect(mockGetTenantDb).not.toHaveBeenCalled();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null and never calls resolveTenant/verifyCredentials when email/password are non-string types", async () => {
    const result = await authorizeCredentials({ email: 123, password: { not: "a string" } });

    expect(result).toBeNull();
    expect(mockResolveTenant).not.toHaveBeenCalled();
    expect(mockGetTenantDb).not.toHaveBeenCalled();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null and never calls verifyCredentials when resolveTenant returns null", async () => {
    mockResolveTenant.mockResolvedValue(null);

    const result = await authorizeCredentials({ email: "user@example.com", password: "secret" });

    expect(result).toBeNull();
    expect(mockGetTenantDb).not.toHaveBeenCalled();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null when verifyCredentials returns null (wrong email/password)", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    const tenantDb = {};
    mockGetTenantDb.mockReturnValue(tenantDb);
    mockVerifyCredentials.mockResolvedValue(null);

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "wrong",
      sedeId: "sede-1",
    });

    expect(result).toBeNull();
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_perez");
    expect(mockVerifyCredentials).toHaveBeenCalledWith(tenantDb, "user@example.com", "wrong");
  });

  it("returns null and never resolves a sede when sedeId is missing", async () => {
    const result = await authorizeCredentials({ email: "user@example.com", password: "correct" });

    expect(result).toBeNull();
    expect(mockResolveTenant).not.toHaveBeenCalled();
    expect(mockResolveSedeActiva).not.toHaveBeenCalled();
  });

  it("returns null when the user is not entitled to the chosen sede", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockGetTenantDb.mockReturnValue({});
    mockVerifyCredentials.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "TECNICO",
      passwordHash: "hashed",
    });
    mockResolveSedeActiva.mockResolvedValue(null);

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "correct",
      sedeId: "sede-ajena",
    });

    expect(result).toBeNull();
  });

  it("never resolves a sede when the password is wrong", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    mockGetTenantDb.mockReturnValue({});
    mockVerifyCredentials.mockResolvedValue(null);

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "wrong",
      sedeId: "sede-1",
    });

    expect(result).toBeNull();
    expect(mockResolveSedeActiva).not.toHaveBeenCalled();
  });

  it("returns the correctly-shaped AuthorizedUser including the resolved sede activa", async () => {
    mockResolveTenant.mockResolvedValue({ slug: "taller-perez", schemaName: "taller_perez" });
    const tenantDb = {};
    mockGetTenantDb.mockReturnValue(tenantDb);
    mockVerifyCredentials.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "ADMIN",
      passwordHash: "hashed",
    });
    mockResolveSedeActiva.mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "correct",
      sedeId: "sede-1",
    });

    expect(result).toEqual({
      id: "u1",
      email: "user@example.com",
      name: "Juan Pérez",
      role: "ADMIN",
      tenantSlug: "taller-perez",
      tenantSchema: "taller_perez",
      sedeActivaId: "sede-1",
      sedeActivaNombre: "Sede principal",
    });
    expect(mockResolveSedeActiva).toHaveBeenCalledWith(tenantDb, "u1", "ADMIN", "sede-1");
  });
});
