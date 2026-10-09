import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("./auth", () => ({ auth: () => mockAuth() }));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

const mockSuperAdminFindUnique = vi.fn();
vi.mock("@/lib/db/public-client", () => ({
  publicDb: { superAdmin: { findUnique: (...args: unknown[]) => mockSuperAdminFindUnique(...args) } },
}));

import { requireSuperAdmin } from "./guards";

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockSuperAdminFindUnique.mockReset();
    mockRedirect.mockReset().mockImplementation((destino: string) => {
      throw new Error(`REDIRECT:${destino}`);
    });
  });

  it("returns a narrow SuperAdminSession built from the DB row, not from the JWT", async () => {
    mockAuth.mockResolvedValue({ user: { id: "sa1", email: "viejo@torqueflow.test", name: "Nombre viejo" } });
    mockSuperAdminFindUnique.mockResolvedValue({ id: "sa1", email: "owner@torqueflow.test", nombre: "Alejo" });

    const session = await requireSuperAdmin();

    expect(mockSuperAdminFindUnique).toHaveBeenCalledWith({
      where: { id: "sa1" },
      select: { id: true, email: true, nombre: true },
    });
    expect(session).toEqual({ id: "sa1", email: "owner@torqueflow.test", nombre: "Alejo" });
  });

  it("redirects to /superadmin/login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/superadmin/login");
    expect(mockSuperAdminFindUnique).not.toHaveBeenCalled();
  });

  it("redirects to /superadmin/login when the super-admin was deleted after signing in", async () => {
    mockAuth.mockResolvedValue({ user: { id: "sa1", email: "owner@torqueflow.test", name: "Alejo" } });
    mockSuperAdminFindUnique.mockResolvedValue(null);

    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/superadmin/login");
  });
});
