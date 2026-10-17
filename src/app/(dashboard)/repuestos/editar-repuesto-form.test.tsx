import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockDelete = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/app/actions/repuesto-actions", () => ({
  updateRepuestoAction: (...args: unknown[]) => mockUpdate(...args),
  deleteRepuestoFormAction: (...args: unknown[]) => mockDelete(...args),
}));

import { EditarRepuestoForm } from "./editar-repuesto-form";

// Production always renders this form inside a Dialog (DialogClose needs its context).
function renderInDialog(ui: ReactNode) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("EditarRepuestoForm — eliminar", () => {
  beforeEach(() => mockDelete.mockReset());

  it("asks before deleting and only then calls deleteRepuestoFormAction", async () => {
    mockDelete.mockResolvedValue({ error: null, success: true });
    renderInDialog(<EditarRepuestoForm repuesto={{ id: "r1", codigo: "FIL-1", nombre: "Filtro de aceite", descripcion: null, precioCompra: 10000, precioVenta: 15000, stockMinimo: 1, stockMaximo: null, multiploCompra: 1, bodegaId: "b1", proveedorId: null }} bodegas={[]} proveedores={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Filtro de aceite/ }));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar el repuesto Filtro de aceite? No se puede deshacer.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith("r1", expect.anything()));
  });

  it("shows the refusal reason", async () => {
    mockDelete.mockResolvedValue({ error: "No se puede eliminar", success: false });
    renderInDialog(<EditarRepuestoForm repuesto={{ id: "r1", codigo: "FIL-1", nombre: "Filtro de aceite", descripcion: null, precioCompra: 10000, precioVenta: 15000, stockMinimo: 1, stockMaximo: null, multiploCompra: 1, bodegaId: "b1", proveedorId: null }} bodegas={[]} proveedores={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar Filtro de aceite/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede eliminar");
  });
});

describe("EditarRepuestoForm — costos", () => {
  const base = { id: "r1", codigo: "FIL-1", nombre: "Filtro de aceite", descripcion: null, precioVenta: 15000, stockMinimo: 1, stockMaximo: null, multiploCompra: 1, bodegaId: "b1", proveedorId: null };
  const bodegas = [{ id: "b1", nombre: "Bodega principal" }] as never;
  beforeEach(() => mockUpdate.mockReset().mockResolvedValue({ error: null, success: true, repuestoId: null }));

  it("sin costos no muestra el precio de compra, no lo envía y el formulario se guarda", async () => {
    renderInDialog(<EditarRepuestoForm repuesto={base} bodegas={bodegas} proveedores={[]} verCostos={false} />);

    expect(screen.queryByLabelText("Precio de compra")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar repuesto" }));

    await vi.waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const formData = mockUpdate.mock.calls[0][2] as FormData;
    expect(formData.has("precioCompra")).toBe(false);
  });

  it("con costos muestra el precio de compra y lo exige", async () => {
    renderInDialog(<EditarRepuestoForm repuesto={{ ...base, precioCompra: 10000 }} bodegas={bodegas} proveedores={[]} verCostos />);

    const campo = screen.getByLabelText("Precio de compra");
    await userEvent.clear(campo);
    await userEvent.click(screen.getByRole("button", { name: "Guardar repuesto" }));

    expect(await screen.findByText("El precio de compra es obligatorio")).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
