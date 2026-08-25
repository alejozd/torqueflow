import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateEntradaMercanciaAction = vi.fn();
vi.mock("@/app/actions/entrada-mercancia-actions", () => ({
  createEntradaMercanciaAction: (...args: unknown[]) => mockCreateEntradaMercanciaAction(...args),
}));

import { NuevaEntradaMercanciaForm } from "./nueva-entrada-mercancia-form";

const proveedores = [{ id: "p1", nombre: "Repuestos El Motor" }] as never;
const bodegas = [{ id: "b1", nombre: "Bodega principal" }] as never;

describe("NuevaEntradaMercanciaForm", () => {
  beforeEach(() => {
    mockCreateEntradaMercanciaAction.mockReset();
    mockCreateEntradaMercanciaAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the proveedor and bodega selects", () => {
    render(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    expect(screen.getByLabelText("Proveedor")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Repuestos El Motor" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bodega")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bodega principal" })).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "p1");
    await userEvent.selectOptions(screen.getByLabelText("Bodega"), "b1");
    await userEvent.click(screen.getByRole("button", { name: "Crear entrada" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Entrada creada");
  });

  it("blocks submission and shows a field error when nothing is selected, without calling the server", async () => {
    render(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear entrada" }));

    expect(document.getElementById("proveedorId-error")).toHaveTextContent("Selecciona un proveedor");
    expect(mockCreateEntradaMercanciaAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockCreateEntradaMercanciaAction.mockResolvedValue({ error: "Tu plan no permite más bodegas.", success: false });
    render(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "p1");
    await userEvent.selectOptions(screen.getByLabelText("Bodega"), "b1");
    await userEvent.click(screen.getByRole("button", { name: "Crear entrada" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tu plan no permite más bodegas.");
  });
});
