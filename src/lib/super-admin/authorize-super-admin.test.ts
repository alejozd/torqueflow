import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifySuperAdminCredentials = vi.fn();
vi.mock("./verify-credentials", () => ({
  verifySuperAdminCredentials: (...args: unknown[]) => mockVerifySuperAdminCredentials(...args),
}));

const mockCompararConHashDeRelleno = vi.fn();
vi.mock("@/lib/auth/hash-de-relleno", () => ({
  compararConHashDeRelleno: (...args: unknown[]) => mockCompararConHashDeRelleno(...args),
}));

import { authorizeSuperAdmin, reiniciarLimitadoresSuperAdmin } from "./authorize-super-admin";

const ADMIN = { id: "sa1", email: "owner@torqueflow.test", nombre: "Alejo", passwordHash: "hashed" };

function desde(ip: string): Request {
  return new Request("http://x/api/superadmin/auth/callback/credentials", { headers: { "x-forwarded-for": ip } });
}

async function fallar(veces: number, email: string, ip: string): Promise<void> {
  mockVerifySuperAdminCredentials.mockResolvedValue(null);
  for (let i = 0; i < veces; i++) {
    await authorizeSuperAdmin({ email, password: "mala" }, desde(ip));
  }
}

describe("authorizeSuperAdmin", () => {
  beforeEach(() => {
    mockVerifySuperAdminCredentials.mockReset();
    mockCompararConHashDeRelleno.mockReset().mockResolvedValue(undefined);
    reiniciarLimitadoresSuperAdmin();
  });

  it("devuelve id/email/name del superadmin con credenciales correctas", async () => {
    mockVerifySuperAdminCredentials.mockResolvedValue(ADMIN);

    const result = await authorizeSuperAdmin({ email: ADMIN.email, password: "buena" }, desde("1.2.3.4"));

    expect(result).toEqual({ id: "sa1", email: "owner@torqueflow.test", name: "Alejo" });
  });

  it("devuelve null sin consultar nada cuando email o password no son strings", async () => {
    expect(await authorizeSuperAdmin({ email: 1, password: "x" }, desde("1.2.3.4"))).toBeNull();
    expect(await authorizeSuperAdmin(undefined, desde("1.2.3.4"))).toBeNull();
    expect(mockVerifySuperAdminCredentials).not.toHaveBeenCalled();
  });

  it("bloquea la cuenta desde esa IP tras 3 fallos, incluso con la contraseña correcta, pagando el hash de relleno", async () => {
    await fallar(3, ADMIN.email, "1.2.3.4");
    mockVerifySuperAdminCredentials.mockReset().mockResolvedValue(ADMIN);

    const result = await authorizeSuperAdmin({ email: ADMIN.email, password: "buena" }, desde("1.2.3.4"));

    expect(result).toBeNull();
    expect(mockVerifySuperAdminCredentials).not.toHaveBeenCalled();
    expect(mockCompararConHashDeRelleno).toHaveBeenCalledWith("buena");
  });

  it("no bloquea la misma cuenta desde otra IP", async () => {
    await fallar(3, ADMIN.email, "1.2.3.4");
    mockVerifySuperAdminCredentials.mockResolvedValue(ADMIN);

    const result = await authorizeSuperAdmin({ email: ADMIN.email, password: "buena" }, desde("5.6.7.8"));

    expect(result?.id).toBe("sa1");
  });

  it("un login correcto limpia el contador de la cuenta", async () => {
    await fallar(2, ADMIN.email, "1.2.3.4");
    mockVerifySuperAdminCredentials.mockResolvedValue(ADMIN);
    await authorizeSuperAdmin({ email: ADMIN.email, password: "buena" }, desde("1.2.3.4"));
    await fallar(2, ADMIN.email, "1.2.3.4");
    mockVerifySuperAdminCredentials.mockResolvedValue(ADMIN);

    const result = await authorizeSuperAdmin({ email: ADMIN.email, password: "buena" }, desde("1.2.3.4"));

    expect(result?.id).toBe("sa1");
  });

  it("normaliza el email para la clave del límite", async () => {
    await fallar(2, ADMIN.email, "1.2.3.4");
    await fallar(1, " OWNER@torqueflow.TEST ", "1.2.3.4");
    mockVerifySuperAdminCredentials.mockReset().mockResolvedValue(ADMIN);

    expect(await authorizeSuperAdmin({ email: ADMIN.email, password: "buena" }, desde("1.2.3.4"))).toBeNull();
  });

  it("bloquea una IP tras 10 fallos repartidos entre cuentas distintas", async () => {
    for (let i = 0; i < 10; i++) await fallar(1, `admin${i}@torqueflow.test`, "9.9.9.9");
    mockVerifySuperAdminCredentials.mockReset().mockResolvedValue(ADMIN);

    expect(await authorizeSuperAdmin({ email: ADMIN.email, password: "buena" }, desde("9.9.9.9"))).toBeNull();
    expect(mockVerifySuperAdminCredentials).not.toHaveBeenCalled();
  });
});
