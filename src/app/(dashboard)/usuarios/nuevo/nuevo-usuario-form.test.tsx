import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateUsuarioAction = vi.fn();
vi.mock("@/app/actions/usuario-actions", () => ({
  createUsuarioAction: (...args: unknown[]) => mockCreateUsuarioAction(...args),
}));

import { NuevoUsuarioForm } from "./nuevo-usuario-form";

const SEDES = [
  { id: "sede-1", nombre: "Sede principal" },
  { id: "sede-2", nombre: "Sede norte" },
];

describe("NuevoUsuarioForm", () => {
  beforeEach(() => {
    mockCreateUsuarioAction.mockReset();
    mockCreateUsuarioAction.mockResolvedValue({ error: null, success: false });
  });

  it("renders the three roles as options", async () => {
    render(<NuevoUsuarioForm sedes={SEDES} />);

    const trigger = screen.getByRole("combobox", { name: /rol/i });
    await userEvent.click(trigger);
    expect(await screen.findByRole("option", { name: "ADMIN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "TECNICO" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "RECEPCION" })).toBeInTheDocument();
  });

  it("defaults Estado to Activo", () => {
    render(<NuevoUsuarioForm sedes={SEDES} />);

    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Activo");
  });

  it("renders one checkbox per sede for the default (non-ADMIN) role", () => {
    render(<NuevoUsuarioForm sedes={SEDES} />);

    expect(screen.getByLabelText("Sede principal")).toBeInTheDocument();
    expect(screen.getByLabelText("Sede norte")).toBeInTheDocument();
  });

  it("hides the sede checkboxes when the role is ADMIN", async () => {
    render(<NuevoUsuarioForm sedes={SEDES} />);

    const rolTrigger = screen.getByRole("combobox", { name: /rol/i });
    await userEvent.click(rolTrigger);
    await userEvent.click(await screen.findByRole("option", { name: "ADMIN" }));

    expect(screen.queryByLabelText("Sede principal")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sede norte")).not.toBeInTheDocument();
  });

  it("narrows sede-por-defecto options to the checked sedes for a non-ADMIN role", async () => {
    render(<NuevoUsuarioForm sedes={SEDES} />);

    await userEvent.click(screen.getByLabelText("Sede principal"));

    const sedeDefectoTrigger = screen.getByRole("combobox", { name: "Sede por defecto" });
    await userEvent.click(sedeDefectoTrigger);
    expect(await screen.findByRole("option", { name: "Sede principal" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sede norte" })).not.toBeInTheDocument();
  });

  it("offers every sede for sede-por-defecto when the role is ADMIN", async () => {
    render(<NuevoUsuarioForm sedes={SEDES} />);

    const rolTrigger = screen.getByRole("combobox", { name: /rol/i });
    await userEvent.click(rolTrigger);
    await userEvent.click(await screen.findByRole("option", { name: "ADMIN" }));

    const sedeDefectoTrigger = screen.getByRole("combobox", { name: "Sede por defecto" });
    await userEvent.click(sedeDefectoTrigger);
    expect(await screen.findByRole("option", { name: "Sede principal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sede norte" })).toBeInTheDocument();
  });

  it("blocks submission and shows field errors when required fields are empty, without calling the server", async () => {
    render(<NuevoUsuarioForm sedes={SEDES} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(mockCreateUsuarioAction).not.toHaveBeenCalled();
  });

  it("blocks submission with the sedeIds error when no sede is checked for a non-ADMIN role", async () => {
    render(<NuevoUsuarioForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Usuario E2E");
    await userEvent.type(screen.getByLabelText("Correo"), "usuario@taller.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByText("Selecciona al menos una sede")).toBeInTheDocument();
    expect(mockCreateUsuarioAction).not.toHaveBeenCalled();
  });

  it("shows the error returned by the action when the plan limit is reached", async () => {
    mockCreateUsuarioAction.mockResolvedValue({
      error: "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
      success: false,
    });
    render(<NuevoUsuarioForm sedes={SEDES} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Usuario E2E");
    await userEvent.type(screen.getByLabelText("Correo"), "usuario@taller.test");
    await userEvent.type(screen.getByLabelText("Contraseña"), "SuperSecret123!");
    await userEvent.click(screen.getByLabelText("Sede principal"));
    await userEvent.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu plan permite hasta 3 usuario(s). Actualiza tu plan para agregar más.",
    );
  });
});
