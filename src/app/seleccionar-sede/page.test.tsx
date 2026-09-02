import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import userEvent from "@testing-library/user-event";

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

  it("redirects to / when the session already has a sedeActivaId", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "sede-1" },
    });

    await expect(SeleccionarSedePage()).rejects.toThrow("REDIRECT:/");
  });

  it("renders the sede picker with the candidates for a session with no sede yet", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", role: "TECNICO", tenantSchema: "taller_perez", sedeActivaId: "" },
    });
    mockListSedesDisponibles.mockResolvedValue([{ id: "sede-1", nombre: "Sede principal" }]);

    render(await SeleccionarSedePage());

    // Sede is a Base UI Select/Combobox now, not a native <select> -- options
    // only mount in the DOM once the popup is open.
    const trigger = screen.getByRole("combobox", { name: "Sede" });
    expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);
    expect(await screen.findByRole("option", { name: "Sede principal" })).toBeInTheDocument();
  });
});
