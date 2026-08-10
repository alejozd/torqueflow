import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddHistorialEntryAction = vi.fn();
vi.mock("@/app/actions/historial-actions", () => ({
  addHistorialEntryAction: (...args: unknown[]) => mockAddHistorialEntryAction(...args),
}));

import { NuevaEntradaForm } from "./nueva-entrada-form";

describe("NuevaEntradaForm", () => {
  beforeEach(() => {
    mockAddHistorialEntryAction.mockReset();
    mockAddHistorialEntryAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the descripcion field", () => {
    render(<NuevaEntradaForm vehiculoId="v1" />);
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevaEntradaForm vehiculoId="v1" />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Cambio de aceite");
    await userEvent.click(screen.getByRole("button", { name: "Registrar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Entrada registrada");
  });
});
