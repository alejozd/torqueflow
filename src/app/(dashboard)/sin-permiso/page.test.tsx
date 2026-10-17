import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireSession: () => mockRequireSession() }));

import SinPermisoPage from "./page";

describe("SinPermisoPage", () => {
  it("explica que falta el permiso y enlaza al inicio", async () => {
    mockRequireSession.mockResolvedValue({ user: { id: "1" } });
    render(await SinPermisoPage());
    expect(screen.getByText("No tienes permiso para ver esto")).toBeTruthy();
    expect(screen.getByText(/pídele al administrador del taller/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver al inicio" }).getAttribute("href")).toBe("/");
    expect(mockRequireSession).toHaveBeenCalled();
  });
});
