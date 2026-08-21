import { describe, expect, it, vi } from "vitest";

const capturedConfig = vi.hoisted<{ current: Record<string, never> | null }>(() => ({ current: null }));

vi.mock("next-auth", () => ({
  default: (config: Record<string, never>) => {
    capturedConfig.current = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: Record<string, never>) => ({ id: "credentials", ...config }),
}));

vi.mock("@/lib/auth/authorize-credentials", () => ({ authorizeCredentials: vi.fn() }));

import "./auth";

/* eslint-disable @typescript-eslint/no-explicit-any */
function config(): any {
  if (!capturedConfig.current) throw new Error("NextAuth config was not captured");
  return capturedConfig.current;
}

describe("auth callbacks", () => {
  it("declares a sedeId credential alongside email and password", () => {
    const provider = config().providers[0];

    expect(Object.keys(provider.credentials)).toEqual(["email", "password", "sedeId"]);
  });

  it("copies sedeActivaId and sedeActivaNombre from the user onto the token on sign-in", async () => {
    const token = await config().callbacks.jwt({
      token: {},
      user: {
        role: "TECNICO",
        tenantSlug: "taller-perez",
        tenantSchema: "taller_perez",
        sedeActivaId: "sede-1",
        sedeActivaNombre: "Sede principal",
      },
    });

    expect(token.sedeActivaId).toBe("sede-1");
    expect(token.sedeActivaNombre).toBe("Sede principal");
  });

  it("leaves an existing token untouched on subsequent requests (no user)", async () => {
    const token = await config().callbacks.jwt({
      token: { sedeActivaId: "sede-1", sedeActivaNombre: "Sede principal" },
      user: undefined,
    });

    expect(token.sedeActivaId).toBe("sede-1");
    expect(token.sedeActivaNombre).toBe("Sede principal");
  });

  it("exposes both sede fields on the session", async () => {
    const session = await config().callbacks.session({
      session: { user: {} },
      token: {
        sub: "u1",
        role: "TECNICO",
        tenantSlug: "taller-perez",
        tenantSchema: "taller_perez",
        sedeActivaId: "sede-1",
        sedeActivaNombre: "Sede principal",
      },
    });

    expect(session.user.sedeActivaId).toBe("sede-1");
    expect(session.user.sedeActivaNombre).toBe("Sede principal");
  });
});
