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

const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite", precioVenta: 12.5 }] as never;
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
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    expect(screen.getByLabelText("Repuesto del inventario (opcional)")).toBeInTheDocument();
    // Repuesto is a Combobox now (search-as-you-type), not a native <select>
    // -- options only mount in the DOM once the popup is open.
    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    expect(await screen.findByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit with manual fields", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem agregado");
  });

  it("blocks submission and shows the cross-field error when neither a repuesto nor descripcion is given", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.type(screen.getByLabelText("Precio unitario"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(
      await screen.findByText("Selecciona un repuesto del inventario o completa la descripción manualmente"),
    ).toBeInTheDocument();
    expect(mockAddItemOrdenAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockAddItemOrdenAction.mockResolvedValue({ error: "El repuesto seleccionado no tiene stock suficiente.", success: false });
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El repuesto seleccionado no tiene stock suficiente.");
  });

  it("shows a '+ Crear repuesto nuevo' option in the combo, which opens the create dialog instead of selecting it as a repuestoId", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "+ Crear repuesto nuevo" }));

    expect(await screen.findByRole("heading", { name: "Nuevo repuesto" })).toBeInTheDocument();
  });

  it("selects the newly created repuesto, closes the dialog, and refreshes the route after creating one inline", async () => {
    mockCreateRepuestoAction.mockResolvedValue({ error: null, success: true, repuestoId: "r2" });
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "+ Crear repuesto nuevo" }));
    await userEvent.type(await screen.findByLabelText("Código"), "FRN-002");
    await userEvent.type(screen.getByLabelText("Nombre"), "Bujía");
    await userEvent.type(screen.getByLabelText("Precio de compra"), "5");
    await userEvent.type(screen.getByLabelText("Precio de venta"), "9");
    await userEvent.selectOptions(screen.getByLabelText("Bodega"), "b1");
    await userEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));

    // Empty, not the new repuesto's label: this test doesn't simulate a real
    // router.refresh() re-fetch (would need new server-provided repuestos), so
    // the Combobox's items list still only has the original fixture data --
    // Base UI correctly shows no label for a selected id with no matching option.
    expect(await screen.findByLabelText("Repuesto del inventario (opcional)")).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "Nuevo repuesto" })).not.toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not show '+ Crear repuesto nuevo' option when puedeCrearRepuesto is false", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={false} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    expect(screen.queryByRole("option", { name: "+ Crear repuesto nuevo" })).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
  });

  it("hides Descripción and prefills Precio unitario with the repuesto's suggested price when a repuesto is selected", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: /Filtro de aceite/ }));

    expect(screen.queryByLabelText("Descripción")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Precio unitario")).toHaveValue(12.5);
  });

  it("submits the price the user typed after overriding the prefilled suggested price", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: /Filtro de aceite/ }));
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    const precioInput = screen.getByLabelText("Precio unitario");
    await userEvent.clear(precioInput);
    await userEvent.type(precioInput, "20");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    await screen.findByRole("status");
    const submittedFormData = mockAddItemOrdenAction.mock.calls[0][2] as FormData;
    expect(submittedFormData.get("precioUnitario")).toBe("20");
  });

  it("keeps a user-overridden price after the repuestos prop is replaced with a new array of the same underlying data", async () => {
    const { rerender } = render(
      <AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />,
    );

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: /Filtro de aceite/ }));

    const precioInput = screen.getByLabelText("Precio unitario");
    await userEvent.clear(precioInput);
    await userEvent.type(precioInput, "20");
    expect(precioInput).toHaveValue(20);

    // Simulate a sibling form on the same page (mano de obra, cambiar estado)
    // calling revalidatePath -- the server page re-fetches and hands down a
    // brand-new `repuestos` array with new object identities for the same
    // underlying repuesto (same id, same precioVenta). The effect must not
    // key off that object identity and stomp the price the user just typed.
    const refreshedRepuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite", precioVenta: 12.5 }] as never;
    rerender(
      <AgregarItemForm
        ordenId="o1"
        repuestos={refreshedRepuestos}
        bodegas={bodegas}
        proveedores={proveedores}
        puedeCrearRepuesto={true}
      />,
    );

    expect(screen.getByLabelText("Precio unitario")).toHaveValue(20);
  });

  it("prefills the suggested price for a newly created repuesto once it arrives via the post-refresh repuestos prop", async () => {
    mockCreateRepuestoAction.mockResolvedValue({ error: null, success: true, repuestoId: "r2" });
    const { rerender } = render(
      <AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />,
    );

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "+ Crear repuesto nuevo" }));
    await userEvent.type(await screen.findByLabelText("Código"), "FRN-002");
    await userEvent.type(screen.getByLabelText("Nombre"), "Bujía");
    await userEvent.type(screen.getByLabelText("Precio de compra"), "5");
    await userEvent.type(screen.getByLabelText("Precio de venta"), "9");
    await userEvent.selectOptions(screen.getByLabelText("Bodega"), "b1");
    await userEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);

    // Simulate the router.refresh() completing: the server page re-fetches
    // and hands down a new `repuestos` array that now includes the
    // just-created repuesto.
    const refreshedRepuestos = [
      { id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite", precioVenta: 12.5 },
      { id: "r2", codigo: "FRN-002", nombre: "Bujía", precioVenta: 9 },
    ] as never;
    rerender(
      <AgregarItemForm
        ordenId="o1"
        repuestos={refreshedRepuestos}
        bodegas={bodegas}
        proveedores={proveedores}
        puedeCrearRepuesto={true}
      />,
    );

    expect(await screen.findByLabelText("Precio unitario")).toHaveValue(9);
  });
});
