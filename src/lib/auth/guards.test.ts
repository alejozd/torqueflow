import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const mockResolveTenant = vi.fn();
vi.mock("@/lib/tenant/resolve-tenant", () => ({ resolveTenant: () => mockResolveTenant() }));

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

import { requireSession, requireRole } from "./guards";

describe("requireSession", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockResolveTenant.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session when one exists and matches the resolved tenant", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a" });

    await expect(requireSession()).resolves.toBe(session);
  });

  it("redirects to /login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    mockResolveTenant.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a" });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /login?error=tenant-mismatch when the session's tenant does not match the resolved tenant", async () => {
    const session = { user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a" } };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue({ slug: "taller-b", schemaName: "taller_b" });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=tenant-mismatch");
  });

  it("redirects to /login?error=tenant-mismatch when no tenant can be resolved for the current request", async () => {
    const session = { user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a" } };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=tenant-mismatch");
  });

  it("redirects to /login?error=sede-requerida when the session has no sedeActivaId (a pre-Fase-6 JWT)", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: undefined },
    };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a" });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=sede-requerida");
  });

  it("returns the session when sedeActivaId is present", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a" });

    await expect(requireSession()).resolves.toBe(session);
  });

  it("redirects to /login?error=tenant-suspendido when the tenant has been suspended mid-session", async () => {
    const session = {
      user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a", estado: "SUSPENDIDO" });

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login?error=tenant-suspendido");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockResolveTenant.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session when the user's role is allowed and the tenant matches", async () => {
    const session = {
      user: { id: "1", role: "RECEPCION", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a" });

    await expect(requireRole(["ADMIN", "RECEPCION"])).resolves.toBe(session);
  });

  it("redirects when the user's role is not allowed", async () => {
    const session = {
      user: { id: "1", role: "TECNICO", tenantSlug: "taller-a", tenantSchema: "taller_a", sedeActivaId: "sede-1" },
    };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue({ slug: "taller-a", schemaName: "taller_a" });

    await expect(requireRole(["ADMIN"])).rejects.toThrow("REDIRECT:/login?error=forbidden");
  });

  it("redirects to /login?error=tenant-mismatch when the session's tenant does not match the resolved tenant, even for an allowed role", async () => {
    const session = { user: { id: "1", role: "ADMIN", tenantSlug: "taller-a", tenantSchema: "taller_a" } };
    mockAuth.mockResolvedValue(session);
    mockResolveTenant.mockResolvedValue({ slug: "taller-b", schemaName: "taller_b" });

    await expect(requireRole(["ADMIN"])).rejects.toThrow("REDIRECT:/login?error=tenant-mismatch");
  });
});
