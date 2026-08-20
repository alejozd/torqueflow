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

  it("shows the error message when the action returns one", async () => {
    mockCreateProveedorAction.mockResolvedValue({ error: "El nombre es obligatorio", success: false });
    render(<NuevoProveedorForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El nombre es obligatorio");
  });
});
