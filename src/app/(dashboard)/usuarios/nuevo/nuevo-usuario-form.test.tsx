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

  it("shows the error returned by the action", async () => {
    mockCreateUsuarioAction.mockResolvedValue({
      error: "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    render(<NuevoUsuarioForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
    );
  });
});
