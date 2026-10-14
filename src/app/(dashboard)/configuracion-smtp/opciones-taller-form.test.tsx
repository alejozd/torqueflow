import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGuardar = vi.fn();
vi.mock("@/app/actions/configuracion-taller-actions", () => ({
  guardarOpcionesTallerAction: (...args: unknown[]) => mockGuardar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { OpcionesTallerForm } from "./opciones-taller-form";

describe("OpcionesTallerForm", () => {
  beforeEach(() => {
    mockGuardar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("muestra el estado guardado y explica qué cambia cada opción", () => {
    render(<OpcionesTallerForm opciones={{ exigirActaFirmada: true, usarControlCaja: false }} />);

    expect(screen.getByLabelText("Exigir acta firmada al entregar")).toBeChecked();
    expect(screen.getByLabelText("Usar control de caja")).not.toBeChecked();
    expect(screen.getByText(/sin firma, con una confirmación/)).toBeInTheDocument();
    expect(screen.getByText(/Solo los cobros y pagos en efectivo/)).toBeInTheDocument();
  });

  it("envía las casillas marcadas como 'true' y omite las desmarcadas", async () => {
    render(<OpcionesTallerForm opciones={{ exigirActaFirmada: false, usarControlCaja: false }} />);

    await userEvent.click(screen.getByLabelText("Usar control de caja"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const datos = mockGuardar.mock.calls[0]![1] as FormData;
    expect(datos.get("usarControlCaja")).toBe("true");
    expect(datos.get("exigirActaFirmada")).toBeNull();
  });

  it("muestra el error de la acción", async () => {
    mockGuardar.mockResolvedValue({ error: "No se pudo guardar la configuración", success: false });
    render(<OpcionesTallerForm opciones={{ exigirActaFirmada: false, usarControlCaja: false }} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("No se pudo guardar la configuración")).toBeInTheDocument();
  });
});
