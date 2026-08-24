import { describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("./auth", () => ({ auth: () => mockAuth() }));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));

import { requireSuperAdmin } from "./guards";

describe("requireSuperAdmin", () => {
  it("returns a narrow SuperAdminSession when a session exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "sa1", email: "owner@torqueflow.test", name: "Alejo" } });

    const session = await requireSuperAdmin();

    expect(session).toEqual({ id: "sa1", email: "owner@torqueflow.test", nombre: "Alejo" });
  });

  it("redirects to /superadmin/login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    mockRedirect.mockImplementation(() => {
      throw new Error("REDIRECT:/superadmin/login");
    });

    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/superadmin/login");
  });
});
