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

const resolveSedeActivaMock = vi.hoisted(() => vi.fn());
const tenantDbFake = vi.hoisted(() => ({}));

vi.mock("@/lib/auth/sede-access", () => ({ resolveSedeActiva: resolveSedeActivaMock }));
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: vi.fn(() => tenantDbFake) }));

import "./auth";

/* eslint-disable @typescript-eslint/no-explicit-any */
function config(): any {
  if (!capturedConfig.current) throw new Error("NextAuth config was not captured");
  return capturedConfig.current;
}

describe("auth callbacks", () => {
  it("declares only email and password credentials (Fase 10: no pre-login sede)", () => {
    const provider = config().providers[0];

    expect(Object.keys(provider.credentials)).toEqual(["email", "password"]);
  });

  it("has no redirect callback (Fase 10: single URL, no cross-subdomain trust needed)", () => {
    expect(config().callbacks.redirect).toBeUndefined();
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

  it("re-validates an update({ user }) sede against the DB and takes the nombre from it", async () => {
    resolveSedeActivaMock.mockResolvedValueOnce({ id: "sede-2", nombre: "Sede Norte (BD)" });

    const token = await config().callbacks.jwt({
      token: { sub: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "", sedeActivaNombre: "" },
      user: undefined,
      trigger: "update",
      session: { user: { sedeActivaId: "sede-2", sedeActivaNombre: "nombre del cliente" } },
    });

    expect(resolveSedeActivaMock).toHaveBeenCalledWith(tenantDbFake, "u1", "TECNICO", "sede-2");
    expect(token.sedeActivaId).toBe("sede-2");
    expect(token.sedeActivaNombre).toBe("Sede Norte (BD)");
  });

  it("rejects an update() to a sede the user may not use (forged POST /api/auth/session)", async () => {
    resolveSedeActivaMock.mockResolvedValueOnce(null);

    const token = await config().callbacks.jwt({
      token: {
        sub: "u1",
        role: "TECNICO",
        tenantSchema: "taller_perez",
        sedeActivaId: "sede-1",
        sedeActivaNombre: "Sede principal",
      },
      user: undefined,
      trigger: "update",
      session: { user: { sedeActivaId: "sede-ajena", sedeActivaNombre: "X" } },
    });

    expect(token.sedeActivaId).toBe("sede-1");
    expect(token.sedeActivaNombre).toBe("Sede principal");
  });

  it("ignores a non-string sedeActivaId in update() without querying the DB", async () => {
    resolveSedeActivaMock.mockClear();

    const token = await config().callbacks.jwt({
      token: {
        sub: "u1",
        role: "TECNICO",
        tenantSchema: "taller_perez",
        sedeActivaId: "sede-1",
        sedeActivaNombre: "Sede principal",
      },
      user: undefined,
      trigger: "update",
      session: { user: { sedeActivaId: { not: "a string" } } },
    });

    expect(resolveSedeActivaMock).not.toHaveBeenCalled();
    expect(token.sedeActivaId).toBe("sede-1");
  });

  it("ignores an update() call that carries no sede data", async () => {
    const token = await config().callbacks.jwt({
      token: { sedeActivaId: "sede-1", sedeActivaNombre: "Sede principal" },
      user: undefined,
      trigger: "update",
      session: {},
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

  it("turns a token without sede into an empty sede (\"no sede yet\"), never undefined", async () => {
    const session = await config().callbacks.session({
      session: { user: {} },
      token: { sub: "u1", role: "ADMIN", tenantSlug: "taller-perez", tenantSchema: "taller_perez" },
    });

    expect(session.user.sedeActivaId).toBe("");
    expect(session.user.sedeActivaNombre).toBe("");
  });
});
