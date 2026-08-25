import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const mockGetTenantDb = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: (...args: unknown[]) => mockGetTenantDb(...args),
}));

const mockListSedesDisponibles = vi.fn();
vi.mock("@/lib/auth/sede-access", () => ({
  listSedesDisponibles: (...args: unknown[]) => mockListSedesDisponibles(...args),
}));

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
  useRouter: () => ({ push: vi.fn() }),
}));

import SeleccionarSedePage from "./page";

describe("SeleccionarSedePage", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGetTenantDb.mockReset().mockReturnValue({});
    mockListSedesDisponibles.mockReset();
    mockRedirect.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("redirects to /login when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(SeleccionarSedePage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /clientes when the session already has a sedeActivaId", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
    });

    await expect(SeleccionarSedePage()).rejects.toThrow("REDIRECT:/clientes");
  });

  it("renders the sede picker with the candidates for a session with no sede yet", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "" },
    });
    mockListSedesDisponibles.mockResolvedValue([{ id: "sede-1", nombre: "Sede principal" }]);

    render(await SeleccionarSedePage());

    expect(screen.getByLabelText("Sede")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sede principal" })).toBeInTheDocument();
  });
});
