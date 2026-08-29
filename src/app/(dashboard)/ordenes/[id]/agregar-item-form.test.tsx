import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockAddItemOrdenAction = vi.fn();
vi.mock("@/app/actions/item-orden-actions", () => ({
  addItemOrdenAction: (...args: unknown[]) => mockAddItemOrdenAction(...args),
}));

const mockCreateRepuestoAction = vi.fn();
vi.mock("@/app/actions/repuesto-actions", () => ({
  createRepuestoAction: (...args: unknown[]) => mockCreateRepuestoAction(...args),
}));

import { AgregarItemForm } from "./agregar-item-form";

const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }] as never;
const bodegas = [{ id: "b1", nombre: "Bodega principal" }] as never;
const proveedores = [{ id: "p1", nombre: "Repuestos El Motor" }] as never;

describe("AgregarItemForm", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockAddItemOrdenAction.mockReset();
    mockAddItemOrdenAction.mockResolvedValue({ error: null, success: true });
    mockCreateRepuestoAction.mockReset();
  });

  it("renders the repuesto select alongside the manual fields", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    expect(screen.getByLabelText("Repuesto del inventario (opcional)")).toBeInTheDocument();
    // Repuesto is a Combobox now (search-as-you-type), not a native <select>
    // -- options only mount in the DOM once the popup is open.
    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    expect(await screen.findByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit with manual fields", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem agregado");
  });

  it("blocks submission and shows the cross-field error when neither a repuesto nor manual descripcion+precio is given", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(
      await screen.findByText("Selecciona un repuesto del inventario o completa descripción y precio manualmente"),
    ).toBeInTheDocument();
    expect(mockAddItemOrdenAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockAddItemOrdenAction.mockResolvedValue({ error: "El repuesto seleccionado no tiene stock suficiente.", success: false });
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El repuesto seleccionado no tiene stock suficiente.");
  });

  it("shows a '+ Crear repuesto nuevo' option in the combo, which opens the create dialog instead of selecting it as a repuestoId", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "+ Crear repuesto nuevo" }));

    expect(await screen.findByRole("heading", { name: "Nuevo repuesto" })).toBeInTheDocument();
  });

  it("selects the newly created repuesto, closes the dialog, and refreshes the route after creating one inline", async () => {
    mockCreateRepuestoAction.mockResolvedValue({ error: null, success: true, repuestoId: "r2" });
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "+ Crear repuesto nuevo" }));
    await userEvent.type(await screen.findByLabelText("Código"), "FRN-002");
    await userEvent.type(screen.getByLabelText("Nombre"), "Bujía");
    await userEvent.type(screen.getByLabelText("Precio de compra"), "5");
    await userEvent.type(screen.getByLabelText("Precio de venta"), "9");
    await userEvent.selectOptions(screen.getByLabelText("Bodega"), "b1");
    await userEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));

    expect(await screen.findByLabelText("Repuesto del inventario (opcional)")).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Nuevo repuesto" })).not.toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
