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

const mockCompararConHashDeRelleno = vi.fn();
vi.mock("@/lib/auth/hash-de-relleno", () => ({
  compararConHashDeRelleno: (...args: unknown[]) => mockCompararConHashDeRelleno(...args),
}));

import { authorizeCredentials, reiniciarLimitadoresLogin } from "./authorize-credentials";

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
    mockCompararConHashDeRelleno.mockReset().mockResolvedValue(undefined);
    reiniciarLimitadoresLogin();
  });

  it("pays a filler bcrypt comparison for an unknown email and for a suspended tenant, so timing reveals neither", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValueOnce(null);
    await authorizeCredentials({ email: "nadie@example.com", password: "x" });

    mockTenantUserEmailFindUnique.mockResolvedValueOnce({ tenant: { ...TENANT_ROW, estado: "SUSPENDIDO" } });
    await authorizeCredentials({ email: "user@example.com", password: "y" });

    expect(mockCompararConHashDeRelleno).toHaveBeenNthCalledWith(1, "x");
    expect(mockCompararConHashDeRelleno).toHaveBeenNthCalledWith(2, "y");
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
      activo: true,
      sedeDefectoId: null,
    });
    mockResolveSedeInicial.mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });

    const result = await authorizeCredentials({ email: "user@example.com", password: "correct" });

    expect(mockResolveSedeInicial).toHaveBeenCalledWith(tenantDb, "u1", "ADMIN", null);
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
      activo: true,
      sedeDefectoId: null,
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

  it("passes usuario.sedeDefectoId through to resolveSedeInicial as the 4th argument", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValue({ email: "user@example.com", tenant: TENANT_ROW });
    const tenantDb = {};
    mockGetTenantDb.mockReturnValue(tenantDb);
    mockVerifyCredentials.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "TECNICO",
      passwordHash: "hashed",
      activo: true,
      sedeDefectoId: "sede-2",
    });
    mockResolveSedeInicial.mockResolvedValue({ id: "sede-2", nombre: "Sede norte" });

    await authorizeCredentials({ email: "user@example.com", password: "correct" });

    expect(mockResolveSedeInicial).toHaveBeenCalledWith(tenantDb, "u1", "TECNICO", "sede-2");
  });

  it("returns null for a suspended user (activo:false) with correct credentials, same as a wrong password", async () => {
    mockTenantUserEmailFindUnique.mockResolvedValue({ email: "user@example.com", tenant: TENANT_ROW });
    mockGetTenantDb.mockReturnValue({});
    mockVerifyCredentials.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "TECNICO",
      passwordHash: "hashed",
      activo: false,
      sedeDefectoId: null,
    });

    const result = await authorizeCredentials({ email: "user@example.com", password: "correct" });

    expect(result).toBeNull();
    expect(mockResolveSedeInicial).not.toHaveBeenCalled();
  });

  describe("límite de intentos", () => {
    const USUARIO_ACTIVO = {
      id: "u1",
      email: "user@example.com",
      nombre: "Juan Pérez",
      role: "ADMIN",
      passwordHash: "hashed",
      activo: true,
      sedeDefectoId: null,
    };

    function desde(ip: string): Request {
      return new Request("http://x/api/auth/callback/credentials", { headers: { "x-forwarded-for": ip } });
    }

    beforeEach(() => {
      mockTenantUserEmailFindUnique.mockResolvedValue({ email: "user@example.com", tenant: TENANT_ROW });
      mockGetTenantDb.mockReturnValue({});
      mockResolveSedeInicial.mockResolvedValue({ id: "sede-1", nombre: "Sede principal" });
    });

    async function fallar(veces: number, email: string, ip: string): Promise<void> {
      mockVerifyCredentials.mockResolvedValue(null);
      for (let i = 0; i < veces; i++) {
        await authorizeCredentials({ email, password: "mala" }, desde(ip));
      }
    }

    it("bloquea la cuenta desde esa IP tras 5 fallos, incluso con la contraseña correcta, pagando el hash de relleno", async () => {
      await fallar(5, "user@example.com", "1.2.3.4");
      mockVerifyCredentials.mockReset().mockResolvedValue(USUARIO_ACTIVO);
      mockCompararConHashDeRelleno.mockClear();

      const result = await authorizeCredentials({ email: "user@example.com", password: "correcta" }, desde("1.2.3.4"));

      expect(result).toBeNull();
      expect(mockVerifyCredentials).not.toHaveBeenCalled();
      expect(mockCompararConHashDeRelleno).toHaveBeenCalledWith("correcta");
    });

    it("no bloquea la misma cuenta desde otra IP (un atacante no puede dejar fuera al usuario legítimo)", async () => {
      await fallar(5, "user@example.com", "1.2.3.4");
      mockVerifyCredentials.mockResolvedValue(USUARIO_ACTIVO);

      const result = await authorizeCredentials({ email: "user@example.com", password: "correcta" }, desde("5.6.7.8"));

      expect(result?.id).toBe("u1");
    });

    it("un login correcto limpia el contador de la cuenta", async () => {
      await fallar(4, "user@example.com", "1.2.3.4");
      mockVerifyCredentials.mockResolvedValue(USUARIO_ACTIVO);
      await authorizeCredentials({ email: "user@example.com", password: "correcta" }, desde("1.2.3.4"));
      await fallar(4, "user@example.com", "1.2.3.4");
      mockVerifyCredentials.mockResolvedValue(USUARIO_ACTIVO);

      const result = await authorizeCredentials({ email: "user@example.com", password: "correcta" }, desde("1.2.3.4"));

      expect(result?.id).toBe("u1");
    });

    it("normaliza el email para la clave: variar mayúsculas/espacios no evita el bloqueo", async () => {
      await fallar(3, "user@example.com", "1.2.3.4");
      await fallar(2, "  USER@Example.com ", "1.2.3.4");
      mockVerifyCredentials.mockReset().mockResolvedValue(USUARIO_ACTIVO);

      const result = await authorizeCredentials({ email: "user@example.com", password: "correcta" }, desde("1.2.3.4"));

      expect(result).toBeNull();
      expect(mockVerifyCredentials).not.toHaveBeenCalled();
    });

    it("bloquea una IP tras 30 fallos repartidos entre cuentas distintas", async () => {
      for (let i = 0; i < 30; i++) await fallar(1, `user${i}@example.com`, "9.9.9.9");
      mockVerifyCredentials.mockReset().mockResolvedValue(USUARIO_ACTIVO);

      const result = await authorizeCredentials({ email: "user@example.com", password: "correcta" }, desde("9.9.9.9"));

      expect(result).toBeNull();
      expect(mockVerifyCredentials).not.toHaveBeenCalled();
    });
  });
});
