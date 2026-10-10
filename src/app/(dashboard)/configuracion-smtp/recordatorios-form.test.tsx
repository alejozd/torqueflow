import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockAction = vi.fn();
vi.mock("@/app/actions/configuracion-taller-actions", () => ({
  guardarDiasAvisoAction: (...args: unknown[]) => mockAction(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecordatoriosForm } from "./recordatorios-form";

describe("RecordatoriosForm", () => {
  it("muestra el valor inicial recibido", () => {
    render(<RecordatoriosForm diasAviso={45} />);
    expect(
      screen.getByLabelText<HTMLInputElement>("Días de anticipación para avisos de vencimiento").value,
    ).toBe("45");
  });

  it("muestra el error devuelto por la action", async () => {
    mockAction.mockResolvedValue({ error: "Ingresa un número de días entre 1 y 90", success: false });
    render(<RecordatoriosForm diasAviso={30} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(screen.getByText("Ingresa un número de días entre 1 y 90")).toBeInTheDocument(),
    );
  });
});
