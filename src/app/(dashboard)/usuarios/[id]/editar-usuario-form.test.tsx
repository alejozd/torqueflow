import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateUsuarioAction = vi.fn();
const mockDeleteUsuarioAction = vi.fn();
vi.mock("@/app/actions/usuario-actions", () => ({
  updateUsuarioAction: (...args: unknown[]) => mockUpdateUsuarioAction(...args),
  deleteUsuarioAction: (...args: unknown[]) => mockDeleteUsuarioAction(...args),
}));

import { EditarUsuarioForm } from "./editar-usuario-form";

const USUARIO = { id: "u1", nombre: "Ana Pérez", email: "ana@taller.test", role: "TECNICO" as const };

describe("EditarUsuarioForm", () => {
  beforeEach(() => {
    mockUpdateUsuarioAction.mockReset();
    mockUpdateUsuarioAction.mockResolvedValue({ error: null, success: false });
    mockDeleteUsuarioAction.mockReset();
  });

  it("pre-fills nombre/email/role from the given usuario, leaving password blank", () => {
    render(<EditarUsuarioForm usuario={USUARIO} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana Pérez");
    expect(screen.getByLabelText("Correo")).toHaveValue("ana@taller.test");
    expect(screen.getByRole("combobox", { name: "Rol" })).toHaveTextContent("TECNICO");
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
  });

  it("shows the error returned by updateUsuarioAction", async () => {
    mockUpdateUsuarioAction.mockResolvedValue({
      error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
      success: false,
    });
    render(<EditarUsuarioForm usuario={{ ...USUARIO, role: "ADMIN" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No puedes quitar el rol de ADMIN al único administrador del taller.",
    );
  });

  it("calls deleteUsuarioAction with the usuario id when the delete button is clicked", async () => {
    mockDeleteUsuarioAction.mockResolvedValue(undefined);
    render(<EditarUsuarioForm usuario={USUARIO} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar usuario" }));

    expect(mockDeleteUsuarioAction).toHaveBeenCalledWith("u1", expect.any(FormData));
  });
});
