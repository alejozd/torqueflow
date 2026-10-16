import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRegistrar = vi.fn();
vi.mock("@/app/actions/cotizacion-seguimiento-actions", () => ({
  registrarSeguimientoAction: (...args: unknown[]) => mockRegistrar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RegistrarSeguimientoForm } from "./registrar-seguimiento-form";

beforeEach(() => {
  mockRegistrar.mockReset().mockResolvedValue({ error: null, success: true });
  // Viernes 16 de octubre de 2026, 3:00 p. m. en Bogotá. Solo se finge Date.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T20:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RegistrarSeguimientoForm", () => {
  it("envía la fecha elegida y el próximo seguimiento en el FormData", async () => {
    const usuario = userEvent.setup();
    render(<RegistrarSeguimientoForm cotizacionId="q1" />);

    await usuario.click(screen.getByRole("button", { name: /^Fecha/ }));
    await usuario.click(await screen.findByRole("button", { name: /^jueves 15 de octubre/ }));
    await usuario.click(screen.getByRole("button", { name: "9:30 a. m." }));
    await usuario.type(screen.getByLabelText("Resultado"), "Cliente pidió una semana para decidir");
    await usuario.click(screen.getByRole("button", { name: "Mañana" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar seguimiento" }));

    await waitFor(() => expect(mockRegistrar).toHaveBeenCalled());
    const formData = mockRegistrar.mock.calls[0][2] as FormData;
    expect(formData.get("fecha")).toBe("2026-10-15T09:30");
    expect(formData.get("proximoSeguimiento")).toBe("2026-10-17");
    expect(formData.get("tipo")).toBe("LLAMADA");
  });
});
