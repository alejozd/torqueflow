import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockCreateClienteAction = vi.fn();
vi.mock("@/app/actions/cliente-actions", () => ({
  createClienteAction: (...args: unknown[]) => mockCreateClienteAction(...args),
}));

import { NuevoClienteForm } from "./nuevo-cliente-form";

// NuevoClienteForm renders a DialogClose-wrapped Cancel button that requires
// a Dialog ancestor (same as every dialog-only form in this app) -- render
// through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("NuevoClienteForm", () => {
  beforeEach(() => {
    mockCreateClienteAction.mockReset();
    mockCreateClienteAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders all Cliente fields", () => {
    renderInDialog(<NuevoClienteForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Documento")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    renderInDialog(<NuevoClienteForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cliente creado");
  });

  it("blocks submission and shows a field error when the name is empty, without calling the server", async () => {
    renderInDialog(<NuevoClienteForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(mockCreateClienteAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockCreateClienteAction.mockResolvedValue({ error: "Ya existe un cliente con ese documento.", success: false });
    renderInDialog(<NuevoClienteForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un cliente con ese documento.");
  });
});
