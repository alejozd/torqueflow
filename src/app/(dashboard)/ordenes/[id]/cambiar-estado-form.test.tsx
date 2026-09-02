import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateEstadoOrdenAction = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  updateEstadoOrdenAction: (...args: unknown[]) => mockUpdateEstadoOrdenAction(...args),
}));

import { CambiarEstadoForm } from "./cambiar-estado-form";

describe("CambiarEstadoForm", () => {
  beforeEach(() => {
    mockUpdateEstadoOrdenAction.mockReset();
    mockUpdateEstadoOrdenAction.mockResolvedValue({ error: null });
  });

  it("offers only the valid next states for BORRADOR (EN_PROCESO, ANULADA)", async () => {
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    const trigger = screen.getByRole("combobox", { name: /cambiar estado a/i });
    await userEvent.click(trigger);
    expect(await screen.findByRole("option", { name: "En proceso" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Anulada" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Terminada" })).not.toBeInTheDocument();
  });

  it("renders no form and a static message for a terminal state (ENTREGADA)", () => {
    render(<CambiarEstadoForm ordenId="o1" estadoActual="ENTREGADA" />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/Entregada/)).toBeInTheDocument();
  });

  it("submits the selected estado and shows the error when the action returns one", async () => {
    mockUpdateEstadoOrdenAction.mockResolvedValue({ error: "No se puede cambiar de BORRADOR a TERMINADA" });
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede cambiar de BORRADOR a TERMINADA");
  });

  it("shows the advertencia message when the action succeeds but flags a notification issue", async () => {
    mockUpdateEstadoOrdenAction.mockResolvedValue({
      error: null,
      advertencia: "Estado actualizado. El correo del taller no está configurado, no se notificó al cliente.",
    });
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "El correo del taller no está configurado, no se notificó al cliente.",
    );
  });
});
