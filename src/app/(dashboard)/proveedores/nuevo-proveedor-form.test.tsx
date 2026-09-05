import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockCreateProveedorAction = vi.fn();
vi.mock("@/app/actions/proveedor-actions", () => ({
  createProveedorAction: (...args: unknown[]) => mockCreateProveedorAction(...args),
}));

import { NuevoProveedorForm } from "./nuevo-proveedor-form";

// NuevoProveedorForm renders a DialogClose-wrapped Cancel button that
// requires a Dialog ancestor (same as every dialog-only form in this app).
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("NuevoProveedorForm", () => {
  beforeEach(() => {
    mockCreateProveedorAction.mockReset();
    mockCreateProveedorAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders all Proveedor fields, including NIT/Cédula and Dirección", () => {
    renderInDialog(<NuevoProveedorForm />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("NIT / Cédula")).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección")).toBeInTheDocument();
    expect(screen.getByLabelText("Contacto")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });

  it("submits the documento and direccion fields to createProveedorAction when filled", async () => {
    renderInDialog(<NuevoProveedorForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.type(screen.getByLabelText("NIT / Cédula"), "900123456-7");
    await userEvent.type(screen.getByLabelText("Dirección"), "Calle 10 # 20-30");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    await screen.findByRole("status");
    const formData = mockCreateProveedorAction.mock.calls[0]![1] as FormData;
    expect(formData.get("documento")).toBe("900123456-7");
    expect(formData.get("direccion")).toBe("Calle 10 # 20-30");
  });

  it("shows a success message after a successful submit", async () => {
    renderInDialog(<NuevoProveedorForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Proveedor creado");
  });

  it("calls onCreated instead of rendering the inline status message when a successful submit provides it", async () => {
    const onCreated = vi.fn();
    renderInDialog(<NuevoProveedorForm onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("blocks submission and shows a field error when the name is empty, without calling the server", async () => {
    renderInDialog(<NuevoProveedorForm />);

    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(mockCreateProveedorAction).not.toHaveBeenCalled();
  });

  it("blocks submission and shows a field error for an invalid email", async () => {
    renderInDialog(<NuevoProveedorForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.type(screen.getByLabelText("Correo"), "no-es-un-correo");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByText("Correo inválido")).toBeInTheDocument();
    expect(mockCreateProveedorAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockCreateProveedorAction.mockResolvedValue({ error: "Ya existe un proveedor con ese nombre.", success: false });
    renderInDialog(<NuevoProveedorForm />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Repuestos El Motor");
    await userEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un proveedor con ese nombre.");
  });
});
