import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGuardar = vi.fn();
vi.mock("@/app/actions/configuracion-taller-actions", () => ({
  guardarDiasEstancadaAction: (...args: unknown[]) => mockGuardar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EstancadasForm } from "./estancadas-form";

describe("EstancadasForm", () => {
  beforeEach(() => {
    mockGuardar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("muestra el umbral actual y explica qué cuenta como actividad", () => {
    render(<EstancadasForm diasEstancada={5} />);

    expect(screen.getByLabelText(/Días sin actividad/)).toHaveValue(5);
    expect(screen.getByText(/repuestos, mano de obra, fotos del DVI o daños/)).toBeInTheDocument();
  });

  it("envía el umbral a la acción", async () => {
    render(<EstancadasForm diasEstancada={3} />);

    const campo = screen.getByLabelText(/Días sin actividad/);
    await userEvent.clear(campo);
    await userEvent.type(campo, "7");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mockGuardar).toHaveBeenCalledTimes(1);
    expect((mockGuardar.mock.calls[0]![1] as FormData).get("diasOrdenEstancada")).toBe("7");
  });

  it("muestra el error de la acción y no toca el valor guardado", async () => {
    mockGuardar.mockResolvedValue({ error: "Ingresa un número de días entre 1 y 90", success: false });
    render(<EstancadasForm diasEstancada={3} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mockGuardar).toHaveBeenCalled();
  });
});
