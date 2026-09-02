import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    await userEvent.click(screen.getByRole("combobox", { name: "Bodega" }));
    await userEvent.click(await screen.findByRole("option", { name: "Bodega principal" }));
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
    await userEvent.click(screen.getByRole("combobox", { name: "Bodega" }));
    await userEvent.click(await screen.findByRole("option", { name: "Bodega principal" }));
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

  it("shows the 'Ítem manual (sin repuesto)' option in the combo's default option list", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    expect(await screen.findByRole("option", { name: "Ítem manual (sin repuesto)" })).toBeInTheDocument();
  });

  it("keeps the 'Ítem manual (sin repuesto)' option visible when typing something that doesn't match any repuesto", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.type(screen.getByLabelText("Repuesto del inventario (opcional)"), "tornillo");

    expect(await screen.findByRole("option", { name: "Ítem manual (sin repuesto)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Filtro de aceite/ })).not.toBeInTheDocument();
  });

  it("clears the repuesto field when 'Ítem manual (sin repuesto)' is selected after a repuesto was already selected", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    // First, select a repuesto
    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: /Filtro de aceite/ }));

    // Verify Descripción is hidden
    expect(screen.queryByLabelText("Descripción")).not.toBeInTheDocument();

    // Now select "Ítem manual (sin repuesto)"
    await userEvent.click(screen.getByLabelText("Repuesto del inventario (opcional)"));
    await userEvent.click(await screen.findByRole("option", { name: "Ítem manual (sin repuesto)" }));

    // Verify repuesto field is now empty and Descripción reappears
    expect(screen.getByLabelText("Repuesto del inventario (opcional)")).toHaveValue("");
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("clears all form fields after a successful manual item submission", async () => {
    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    // Fill in manual item fields
    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");

    // Submit the form
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    // Wait for success state to resolve
    await screen.findByRole("status");

    // Assert fields are cleared back to empty
    expect(screen.getByLabelText("Descripción")).toHaveValue("");
    expect(screen.getByLabelText("Cantidad")).toHaveValue(null);
    expect(screen.getByLabelText("Precio unitario")).toHaveValue(null);
  });

  it("clears all form fields again after a second consecutive successful manual item submission", async () => {
    // A real server action returns a fresh object on every invocation. Use a
    // distinct mockResolvedValueOnce per call (instead of the shared
    // mockResolvedValue from beforeEach) so this test faithfully mirrors
    // production and doesn't accidentally pass because both calls resolved
    // to the exact same object reference.
    mockAddItemOrdenAction.mockReset();
    mockAddItemOrdenAction.mockResolvedValueOnce({ error: null, success: true });
    mockAddItemOrdenAction.mockResolvedValueOnce({ error: null, success: true });

    render(<AgregarItemForm ordenId="o1" repuestos={repuestos} bodegas={bodegas} proveedores={proveedores} puedeCrearRepuesto={true} />);

    // First submission
    await userEvent.type(screen.getByLabelText("Descripción"), "Filtro de aceite");
    await userEvent.type(screen.getByLabelText("Cantidad"), "2");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "15.5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    await screen.findByRole("status");

    expect(screen.getByLabelText("Descripción")).toHaveValue("");
    expect(screen.getByLabelText("Cantidad")).toHaveValue(null);
    expect(screen.getByLabelText("Precio unitario")).toHaveValue(null);

    // Second submission with different values -- proves the reset isn't just
    // residual empty state left over from the first submit. This is the
    // assertion that distinguishes the correct `[state, reset]` effect
    // dependency from the buggy `[state.success, reset]` alternative: under
    // the bug, `state.success` is already `true` from the first submission,
    // so it doesn't change value on the second success and the effect never
    // re-runs, leaving these fields populated.
    await userEvent.type(screen.getByLabelText("Descripción"), "Bujía de encendido");
    await userEvent.type(screen.getByLabelText("Cantidad"), "4");
    await userEvent.type(screen.getByLabelText("Precio unitario"), "8.75");
    await userEvent.click(screen.getByRole("button", { name: "Agregar ítem" }));

    // Note: unlike the first submission, `role="status"` is already present
    // in the DOM (state.success was true after the first submit and stays
    // true after the second), so `findByRole("status")` would resolve
    // immediately without waiting for the second action to actually finish.
    // waitFor on the field values themselves is the assertion that genuinely
    // waits for -- and proves -- the second reset.
    await waitFor(() => {
      expect(screen.getByLabelText("Descripción")).toHaveValue("");
      expect(screen.getByLabelText("Cantidad")).toHaveValue(null);
      expect(screen.getByLabelText("Precio unitario")).toHaveValue(null);
    });
    expect(mockAddItemOrdenAction).toHaveBeenCalledTimes(2);
  });
});
