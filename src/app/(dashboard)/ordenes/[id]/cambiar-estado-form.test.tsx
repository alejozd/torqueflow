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

  it("submits the estado the user actually selected, not just the default", async () => {
    mockUpdateEstadoOrdenAction.mockResolvedValue({ error: null });
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    const trigger = screen.getByRole("combobox", { name: /cambiar estado a/i });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Anulada" }));
    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));
    expect(mockUpdateEstadoOrdenAction).not.toHaveBeenCalled();
    expect(screen.getByText("¿Anular la orden? Ya no se podrá editar.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sí, anular" }));

    await vi.waitFor(() => expect(mockUpdateEstadoOrdenAction).toHaveBeenCalled());
    const formData = mockUpdateEstadoOrdenAction.mock.calls[0][2] as FormData;
    expect(formData.get("estado")).toBe("ANULADA");
  });

  it("does not ask for a non-closing estado (EN_PROCESO)", async () => {
    render(<CambiarEstadoForm ordenId="o1" estadoActual="BORRADOR" />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));

    await vi.waitFor(() => expect(mockUpdateEstadoOrdenAction).toHaveBeenCalled());
    expect(screen.queryByText(/¿Anular/)).not.toBeInTheDocument();
  });

  it("asks before ENTREGADA and lets the user back out", async () => {
    render(<CambiarEstadoForm ordenId="o1" estadoActual="TERMINADA" />);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));
    expect(screen.getByText("¿Marcar la orden como entregada? Ya no se podrá editar.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(mockUpdateEstadoOrdenAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeInTheDocument();
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
