import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateUsuarioAction = vi.fn();
vi.mock("@/app/actions/usuario-actions", () => ({
  createUsuarioAction: (...args: unknown[]) => mockCreateUsuarioAction(...args),
}));

import { NuevoUsuarioForm } from "./nuevo-usuario-form";

describe("NuevoUsuarioForm", () => {
  beforeEach(() => {
    mockCreateUsuarioAction.mockReset();
    mockCreateUsuarioAction.mockResolvedValue({ error: null, success: false });
  });

  it("renders the three roles as options", () => {
    render(<NuevoUsuarioForm />);

    expect(screen.getByRole("option", { name: "ADMIN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "TECNICO" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "RECEPCION" })).toBeInTheDocument();
  });

  it("blocks submission and shows field errors when required fields are empty, without calling the server", async () => {
    render(<NuevoUsuarioForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(mockCreateUsuarioAction).not.toHaveBeenCalled();
  });

  it("shows the error returned by the action when the plan limit is reached", async () => {
    mockCreateUsuarioAction.mockResolvedValue({
      error: "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    render(<NuevoUsuarioForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Usuario E2E");
    await userEvent.type(screen.getByLabelText("Correo"), "usuario@taller.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
    );
  });
});
