import { describe, expect, it, vi, beforeEach } from "vitest";

const mockTenantUserEmailFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { tenantUserEmail: { findUnique: (...args: unknown[]) => mockTenantUserEmailFindUnique(...args) } },
}));

const mockGetTenantDb = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (...args: unknown[]) => mockGetTenantDb(...args),
}));

const mockVerifyCredentials = vi.fn();
vi.mock("@/lib/auth/verify-credentials", () => ({
  verifyCredentials: (...args: unknown[]) => mockVerifyCredentials(...args),
}));

const mockResolveSedeInicial = vi.fn();
vi.mock("@/lib/auth/sede-access", () => ({
  resolveSedeInicial: (...args: unknown[]) => mockResolveSedeInicial(...args),
}));

import { authorizeCredentials } from "./authorize-credentials";

const TENANT_ROW = {
  slug: "taller-perez",
  schemaName: "taller_perez",
  estado: "ACTIVO",
};

describe("authorizeCredentials", () => {
  beforeEach(() => {
    mockTenantUserEmailFindUnique.mockReset();
    mockGetTenantDb.mockReset();
    mockVerifyCredentials.mockReset();
    mockResolveSedeInicial.mockReset();
  });

  it("returns null and never looks up the email index when email or password is missing/non-string", async () => {
    const result = await authorizeCredentials({ email: "user@example.com" });

    expect(result).toBeNull();
    expect(mockTenantUserEmailFindUnique).not.toHaveBeenCalled();
    expect(mockGetTenantDb).not.toHaveBeenCalled();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null when credentials is undefined", async () => {
    const result = await authorizeCredentials(undefined);

    expect(result).toBeNull();
    expect(mockTenantUserEmailFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when email/password are non-string types", async () => {
    const result = await authorizeCredentials({ email: 123, password: { not: "a string" } });

    expect(result).toBeNull();
    expect(mockTenantUserEmailFindUnique).not.toHaveBeenCalled();
  });

  it("returns null and never calls verifyCredentials when the email is not in the index", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValue(null);

    const result = await authorizeCredentials({ email: "unknown@example.com", password: "secret" });

    expect(result).toBeNull();
    expect(mockGetTenantDb).not.toHaveBeenCalled();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it("resolves the tenant from the email index, not from a subdomain/Host header", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValue({ email: "user@example.com", tenant: TENANT_ROW });
    const tenantDb = {};
    mockGetTenantDb.mockReturnValue(tenantDb);
    mockVerifyCredentials.mockResolvedValue(null);

    await authorizeCredentials({ email: "user@example.com", password: "wrong" });

    expect(mockTenantUserEmailFindUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      include: { tenant: true },
    });
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_perez");
  });

  it("returns null for a suspended tenant without ever checking credentials", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValue({
      email: "a@a.test",
      tenant: { ...TENANT_ROW, estado: "SUSPENDIDO" },
    });

    const result = await authorizeCredentials({ email: "a@a.test", password: "x" });

    expect(result).toBeNull();
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it("returns null when verifyCredentials returns null (wrong password)", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValue({ email: "user@example.com", tenant: TENANT_ROW });
    mockGetTenantDb.mockReturnValue({});
    mockVerifyCredentials.mockResolvedValue(null);

    const result = await authorizeCredentials({ email: "user@example.com", password: "wrong" });

    expect(result).toBeNull();
    expect(mockResolveSedeInicial).not.toHaveBeenCalled();
  });

  it("resolves an initial sede automatically and returns it as sedeActivaId when exactly one is available", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValue({ email: "user@example.com", tenant: TENANT_ROW });
    const tenantDb = {};
    mockGetTenantDb.mockReturnValue(tenantDb);
    mockVerifyCredentials.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "ADMIN",
      passwordHash: "hashed",
    });
    mockResolveSedeInicial.mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });

    const result = await authorizeCredentials({ email: "user@example.com", password: "correct" });

    expect(mockResolveSedeInicial).toHaveBeenCalledWith(tenantDb, "u1", "ADMIN");
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
  });

  it("returns an empty sedeActivaId when no sede can be auto-resolved (multiple or zero candidates)", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValue({ email: "user@example.com", tenant: TENANT_ROW });
    mockGetTenantDb.mockReturnValue({});
    mockVerifyCredentials.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "TECNICO",
      passwordHash: "hashed",
    });
    mockResolveSedeInicial.mockResolvedValue(null);

    const result = await authorizeCredentials({ email: "user@example.com", password: "correct" });

    expect(result).toEqual({
      id: "u1",
      email: "user@example.com",
      name: "Juan Pérez",
      role: "TECNICO",
      tenantSlug: "taller-perez",
      tenantSchema: "taller_perez",
      sedeActivaId: "",
      sedeActivaNombre: "",
    });
  });
});
