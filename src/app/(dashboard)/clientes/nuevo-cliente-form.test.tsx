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

  it("shows the error message when the action returns one", async () => {
    mockCreateClienteAction.mockResolvedValue({ error: "El nombre es obligatorio", success: false });
    render(<NuevoClienteForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre es obligatorio");
  });
});
