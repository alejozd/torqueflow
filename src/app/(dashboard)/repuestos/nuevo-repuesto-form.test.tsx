import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateRepuestoAction = vi.fn();
vi.mock("@/app/actions/repuesto-actions", () => ({
  createRepuestoAction: (...args: unknown[]) => mockCreateRepuestoAction(...args),
}));

import { NuevoRepuestoForm } from "./nuevo-repuesto-form";

const bodegas = [{ id: "b1", nombre: "Bodega principal" }] as never;
const proveedores = [{ id: "p1", nombre: "Repuestos El Motor" }] as never;

describe("NuevoRepuestoForm", () => {
  beforeEach(() => {
    mockCreateRepuestoAction.mockReset();
    mockCreateRepuestoAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders all Repuesto fields plus the bodega/proveedor selects", () => {
    render(<NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />);

    expect(screen.getByLabelText("Código")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio de compra")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio de venta")).toBeInTheDocument();
    expect(screen.getByLabelText("Stock inicial")).toBeInTheDocument();
    expect(screen.getByLabelText("Stock mínimo")).toBeInTheDocument();
    expect(screen.getByLabelText("Bodega")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bodega principal" })).toBeInTheDocument();
    expect(screen.getByLabelText("Proveedor")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Repuestos El Motor" })).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.type(screen.getByLabelText("Código"), "FRN-001");
    await userEvent.type(screen.getByLabelText("Nombre"), "Filtro de aceite");
    await userEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Repuesto creado");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateRepuestoAction.mockResolvedValue({ error: "El código es obligatorio", success: false });
    render(<NuevoRepuestoForm bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El código es obligatorio");
  });
});
