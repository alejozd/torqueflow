import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateOrdenAction = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  createOrdenAction: (...args: unknown[]) => mockCreateOrdenAction(...args),
}));

import { NuevaOrdenForm } from "./nueva-orden-form";

const tecnicos = [{ id: "t1", nombre: "Carlos Ruiz" }];

describe("NuevaOrdenForm", () => {
  beforeEach(() => {
    mockCreateOrdenAction.mockReset();
    mockCreateOrdenAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the kilometraje, síntomas, and mecánico fields", () => {
    render(<NuevaOrdenForm clienteId="c1" vehiculoId="v1" tecnicos={tecnicos} />);

    expect(screen.getByLabelText("Kilometraje de ingreso")).toBeInTheDocument();
    expect(screen.getByLabelText("Síntomas reportados")).toBeInTheDocument();
    expect(screen.getByLabelText("Mecánico asignado")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Carlos Ruiz" })).toBeInTheDocument();
  });

  it("shows a success message after a successful submit when no onCreated callback is given", async () => {
    render(<NuevaOrdenForm clienteId="c1" vehiculoId="v1" tecnicos={tecnicos} />);

    await userEvent.type(screen.getByLabelText("Kilometraje de ingreso"), "12000");
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Orden creada");
  });

  it("calls onCreated with the new orden's id after a successful submit, instead of showing its own success message", async () => {
    mockCreateOrdenAction.mockResolvedValue({ error: null, success: true, ordenId: "o1" });
    const onCreated = vi.fn();
    render(<NuevaOrdenForm clienteId="c1" vehiculoId="v1" tecnicos={tecnicos} onCreated={onCreated} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith("o1"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not call onCreated when the action returns an error", async () => {
    mockCreateOrdenAction.mockResolvedValue({ error: "El kilometraje no puede ser negativo", success: false });
    const onCreated = vi.fn();
    render(<NuevaOrdenForm clienteId="c1" vehiculoId="v1" tecnicos={tecnicos} onCreated={onCreated} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    await screen.findByRole("alert");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateOrdenAction.mockResolvedValue({ error: "El kilometraje no puede ser negativo", success: false });
    render(<NuevaOrdenForm clienteId="c1" vehiculoId="v1" tecnicos={tecnicos} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El kilometraje no puede ser negativo");
  });
});
