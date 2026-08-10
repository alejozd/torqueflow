import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

import { requireSession, requireRole } from "./guards";

describe("requireSession", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session when one exists", async () => {
    const session = { user: { id: "1", role: "ADMIN" } };
    mockAuth.mockResolvedValue(session);

    await expect(requireSession()).resolves.toBe(session);
  });

  it("redirects to /login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireSession()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRedirect.mockClear();
  });

  it("returns the session when the user's role is allowed", async () => {
    const session = { user: { id: "1", role: "RECEPCION" } };
    mockAuth.mockResolvedValue(session);

    await expect(requireRole(["ADMIN", "RECEPCION"])).resolves.toBe(session);
  });

  it("redirects when the user's role is not allowed", async () => {
    const session = { user: { id: "1", role: "TECNICO" } };
    mockAuth.mockResolvedValue(session);

    await expect(requireRole(["ADMIN"])).rejects.toThrow("REDIRECT:/login?error=forbidden");
  });
});
