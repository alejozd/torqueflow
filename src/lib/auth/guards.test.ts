import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const mockGetTenantBySchema = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({
  getTenantBySchema: (...args: unknown[]) => mockGetTenantBySchema(...args),
}));

const mockUsuarioFindUnique = vi.fn();
const mockGetTenantDb = vi.fn((..._args: unknown[]) => ({
  usuario: { findUnique: (...args: unknown[]) => mockUsuarioFindUnique(...args) },
}));
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (...args: unknown[]) => mockGetTenantDb(...args),
}));

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

import { requireSession, requirePermiso, puede } from "./guards";

describe("requireSession", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetTenantBySchema.mockReset();
    mockUsuarioFindUnique.mockReset().mockResolvedValue({ activo: true, role: "ADMIN" });
    mockGetTenantDb.mockClear();
    mockRedirect.mockClear();
  });

  it("returns the session when the tenant is active, the user is active, and a sede is set", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "ACTIVO" });

    await expect(requireSession()).resolves.toBe(session);
    expect(mockGetTenantBySchema).toHaveBeenCalledWith("taller_a");
    expect(mockGetTenantDb).toHaveBeenCalledWith("taller_a");
    expect(mockUsuarioFindUnique).toHaveBeenCalledWith({ where: { id: "1" }, select: { activo: true, role: true } });
  });

  it("redirects to /login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
    expect(mockGetTenantBySchema).not.toHaveBeenCalled();
  });

  it("redirects to /login?error=tenant-mismatch when the session's tenant no longer resolves (Fase 10: tenant deleted)", async () => {
    const session = { user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a" } };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=tenant-mismatch");
  });

  it("redirects to /login?error=tenant-suspendido when the tenant has been suspended mid-session", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "SUSPENDIDO" });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=tenant-suspendido");
  });

  it("redirects to /login?error=usuario-suspendido when the session's user is now activo:false in the DB", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "ACTIVO" });
    mockUsuarioFindUnique.mockResolvedValue({ activo: false });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=usuario-suspendido");
  });

  it("redirects to /login?error=usuario-suspendido when the session's user no longer exists in the DB", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "ACTIVO" });
    mockUsuarioFindUnique.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=usuario-suspendido");
  });

  it("redirects to /seleccionar-sede when the session has no sedeActivaId (Fase 10: sede resolved post-login)", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "ACTIVO" });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/seleccionar-sede");
  });
});

describe("permisos en la sesión", () => {
  const base = { user: { id: "1", role: "ADMIN", tenantSlug: "t", tenantSchema: "taller_a", sedeActivaId: "sede-1" } };
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue(structuredClone(base));
    mockGetTenantBySchema.mockReset().mockResolvedValue({ slug: "t", schemaName: "taller_a", estado: "ACTIVO" });
    mockUsuarioFindUnique.mockReset();
    mockGetTenantDb.mockClear();
    mockRedirect.mockClear();
  });

  it("toma el rol de la base, no del JWT (D4)", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ activo: true, role: "TECNICO" });
    const session = await requireSession();
    expect(session.user.role).toBe("TECNICO");
    expect(puede(session, "ordenes.trabajar")).toBe(true);
    expect(puede(session, "caja.usar")).toBe(false);
  });

  it("consulta activo y role en la misma consulta", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ activo: true, role: "ADMIN" });
    await requireSession();
    expect(mockUsuarioFindUnique).toHaveBeenCalledWith({ where: { id: "1" }, select: { activo: true, role: true } });
  });

  it("requirePermiso devuelve la sesión si tiene el permiso", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ activo: true, role: "RECEPCION" });
    await expect(requirePermiso("caja.usar")).resolves.toMatchObject({ user: { role: "RECEPCION" } });
  });

  it("requirePermiso manda a /sin-permiso si le falta (D5)", async () => {
    mockUsuarioFindUnique.mockResolvedValue({ activo: true, role: "TECNICO" });
    await expect(requirePermiso("caja.usar")).rejects.toThrow("REDIRECT:/sin-permiso");
  });
});
