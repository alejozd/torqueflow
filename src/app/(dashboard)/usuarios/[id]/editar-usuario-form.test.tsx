import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUpdateUsuarioAction = vi.fn();
const mockDeleteUsuarioFormAction = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: vi.fn() }) }));
vi.mock("@/app/actions/usuario-actions", () => ({
  updateUsuarioAction: (...args: unknown[]) => mockUpdateUsuarioAction(...args),
  deleteUsuarioFormAction: (...args: unknown[]) => mockDeleteUsuarioFormAction(...args),
}));

import { EditarUsuarioForm } from "./editar-usuario-form";

const SEDES = [
  { id: "sede-1", nombre: "Sede principal" },
  { id: "sede-2", nombre: "Sede norte" },
];

const USUARIO = {
  id: "u1",
  nombre: "Ana Pérez",
  email: "ana@taller.test",
  role: "TECNICO" as const,
  activo: true,
  sedeDefectoId: null,
  sedeIds: ["sede-1"],
};

describe("EditarUsuarioForm", () => {
  beforeEach(() => {
    mockUpdateUsuarioAction.mockReset();
    mockUpdateUsuarioAction.mockResolvedValue({ error: null, success: false });
    mockDeleteUsuarioFormAction.mockReset();
    mockPush.mockReset();
  });

  it("pre-fills nombre/email/role from the given usuario, leaving password blank", () => {
    render(<EditarUsuarioForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana Pérez");
    expect(screen.getByLabelText("Correo")).toHaveValue("ana@taller.test");
    expect(screen.getByRole("combobox", { name: "Rol" })).toHaveTextContent("TECNICO");
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
  });

  it("pre-fills Estado from usuario.activo", () => {
    render(<EditarUsuarioForm usuario={{ ...USUARIO, activo: false }} sedes={SEDES} />);

    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Suspendido");
  });

  it("pre-checks exactly the sedes the user is already assigned to", () => {
    render(<EditarUsuarioForm usuario={USUARIO} sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal")).toBeChecked();
    expect(screen.getByLabelText("Sede norte")).not.toBeChecked();
  });

  it("hides the sede checkboxes when the role is ADMIN", () => {
    render(<EditarUsuarioForm usuario={{ ...USUARIO, role: "ADMIN" }} sedes={SEDES} />);

    expect(screen.queryByLabelText("Sede principal")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sede norte")).not.toBeInTheDocument();
  });

  it("narrows sede-por-defecto options to the checked sedes for a non-ADMIN role", async () => {
    render(<EditarUsuarioForm usuario={USUARIO} sedes={SEDES} />);

    const sedeDefectoTrigger = screen.getByRole("combobox", { name: "Sede por defecto" });
    await userEvent.click(sedeDefectoTrigger);
    expect(await screen.findByRole("option", { name: "Sede principal" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sede norte" })).not.toBeInTheDocument();
  });

  it("shows the error returned by updateUsuarioAction", async () => {
    mockUpdateUsuarioAction.mockResolvedValue({
      error: "No puedes quitar el rol de ADMIN al único administrador del taller.",
      success: false,
    });
    render(<EditarUsuarioForm usuario={{ ...USUARIO, role: "ADMIN" }} sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No puedes quitar el rol de ADMIN al único administrador del taller.",
    );
  });

  it("asks before deleting, then deletes and goes back to /usuarios", async () => {
    mockDeleteUsuarioFormAction.mockResolvedValue({ error: null, success: true });
    render(<EditarUsuarioForm usuario={USUARIO} sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar usuario/ }));
    expect(mockDeleteUsuarioFormAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDeleteUsuarioFormAction).toHaveBeenCalledWith("u1"));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/usuarios"));
  });

  it("shows why the delete was refused", async () => {
    mockDeleteUsuarioFormAction.mockResolvedValue({
      error: "No puedes eliminar al único administrador del taller.",
      success: false,
    });
    render(<EditarUsuarioForm usuario={USUARIO} sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar usuario/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("único administrador");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
