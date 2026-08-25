import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const mockGetTenantBySchema = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({
  getTenantBySchema: (...args: unknown[]) => mockGetTenantBySchema(...args),
}));

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

import { requireSession, requireRole } from "./guards";

describe("requireSession", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetTenantBySchema.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session when the tenant is active and a sede is set", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "ACTIVO" });

    await expect(requireSession()).resolves.toBe(session);
    expect(mockGetTenantBySchema).toHaveBeenCalledWith("taller_a");
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

  it("redirects to /seleccionar-sede when the session has no sedeActivaId (Fase 10: sede resolved post-login)", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "ACTIVO" });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/seleccionar-sede");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetTenantBySchema.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session when the user's role is allowed", async () => {
    const session = {
      user: { id: "1", role: "RECEPCION", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "ACTIVO" });

    await expect(requireRole(["ADMIN", "RECEPCION"])).resolves.toBe(session);
  });

  it("redirects when the user's role is not allowed", async () => {
    const session = {
      user: { id: "1", role: "TECNICO", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "ACTIVO" });

    await expect(requireRole(["ADMIN"])).rejects.toThrow("REDIRECT:/login?error=forbidden");
  });

  it("forwards a requireSession failure (e.g. suspended tenant) before checking the role", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockGetTenantBySchema.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "SUSPENDIDO" });

    await expect(requireRole(["ADMIN"])).rejects.toThrow("REDIRECT:/login?error=tenant-suspendido");
  });
});
