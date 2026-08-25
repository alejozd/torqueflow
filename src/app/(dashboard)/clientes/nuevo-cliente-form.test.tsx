import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateClienteAction = vi.fn();
vi.mock("@/app/actions/cliente-actions", () => ({
  createClienteAction: (...args: unknown[]) => mockCreateClienteAction(...args),
}));

import { NuevoClienteForm } from "./nuevo-cliente-form";

describe("NuevoClienteForm", () => {
  beforeEach(() => {
    mockCreateClienteAction.mockReset();
    mockCreateClienteAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders all Cliente fields", () => {
    render(<NuevoClienteForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
    expect(screen.getByLabelText("Documento")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoClienteForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cliente creado");
  });

  it("blocks submission and shows a field error when the name is empty, without calling the server", async () => {
    render(<NuevoClienteForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(mockCreateClienteAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockCreateClienteAction.mockResolvedValue({ error: "Ya existe un cliente con ese documento.", success: false });
    render(<NuevoClienteForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Juan Pérez");
    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un cliente con ese documento.");
  });
});
