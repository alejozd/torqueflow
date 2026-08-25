import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateProveedorAction = vi.fn();
vi.mock("@/app/actions/proveedor-actions", () => ({
  createProveedorAction: (...args: unknown[]) => mockCreateProveedorAction(...args),
}));

import { NuevoProveedorForm } from "./nuevo-proveedor-form";

describe("NuevoProveedorForm", () => {
  beforeEach(() => {
    mockCreateProveedorAction.mockReset();
    mockCreateProveedorAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders all Proveedor fields", () => {
    render(<NuevoProveedorForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Contacto")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoProveedorForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Proveedor creado");
  });

  it("blocks submission and shows a field error when the name is empty, without calling the server", async () => {
    render(<NuevoProveedorForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(mockCreateProveedorAction).not.toHaveBeenCalled();
  });

  it("blocks submission and shows a field error for an invalid email", async () => {
    render(<NuevoProveedorForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.type(screen.getByLabelText("Correo"), "no-es-un-correo");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByText("Correo inválido")).toBeInTheDocument();
    expect(mockCreateProveedorAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockCreateProveedorAction.mockResolvedValue({ error: "Ya existe un proveedor con ese nombre.", success: false });
    render(<NuevoProveedorForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un proveedor con ese nombre.");
  });
});
