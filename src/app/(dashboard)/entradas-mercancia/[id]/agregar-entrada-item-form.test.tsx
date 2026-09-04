import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddEntradaItemAction = vi.fn();
vi.mock("@/app/actions/entrada-mercancia-actions", () => ({
  addEntradaItemAction: (...args: unknown[]) => mockAddEntradaItemAction(...args),
}));

import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";

const repuestos = [{ id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite" }] as never;

// Repuesto is a Combobox now (search-as-you-type), not a native <select> --
// options only mount in the DOM once the popup is open.
async function selectCombobox(labelText: string, optionName: string | RegExp) {
  await userEvent.click(screen.getByLabelText(labelText));
  await userEvent.click(await screen.findByRole("option", { name: optionName }));
}

describe("AgregarEntradaItemForm", () => {
  beforeEach(() => {
    mockAddEntradaItemAction.mockReset();
    mockAddEntradaItemAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders the repuesto select, cantidad, and precio fields", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    expect(screen.getByLabelText("Repuesto")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Repuesto"));
    expect(await screen.findByRole("option", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio de compra unitario")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await selectCombobox("Repuesto", /Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.type(screen.getByLabelText("Precio de compra unitario"), "8");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ítem registrado, stock actualizado");
  });

  it("clears repuesto, cantidad, and precio after a successful submit", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await selectCombobox("Repuesto", /Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.type(screen.getByLabelText("Precio de compra unitario"), "8");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    await screen.findByRole("status");

    expect(screen.getByLabelText("Repuesto")).toHaveValue("");
    expect(screen.getByLabelText("Cantidad")).toHaveValue(null);
    expect(screen.getByLabelText("Precio de compra unitario")).toHaveValue(null);
  });

  it("clears the fields again after a second consecutive successful submit", async () => {
    // A real server action returns a fresh object on every invocation. Use a
    // distinct mockResolvedValueOnce per call (instead of the shared
    // mockResolvedValue from beforeEach) so this test faithfully mirrors
    // production and doesn't accidentally pass because both calls resolved
    // to the exact same object reference.
    mockAddEntradaItemAction.mockReset();
    mockAddEntradaItemAction.mockResolvedValueOnce({ error: null, success: true });
    mockAddEntradaItemAction.mockResolvedValueOnce({ error: null, success: true });

    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await selectCombobox("Repuesto", /Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.type(screen.getByLabelText("Precio de compra unitario"), "8");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    await screen.findByRole("status");

    // Second submission with different values -- proves the reset isn't just
    // residual empty state left over from the first submit. This is the
    // assertion that distinguishes the correct `[state, reset]` effect
    // dependency from the buggy `[state.success, reset]` alternative: under
    // the bug, `state.success` is already `true` from the first submission,
    // so it doesn't change value on the second success and the effect never
    // re-runs, leaving these fields populated.
    await selectCombobox("Repuesto", /Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "3");
    await userEvent.type(screen.getByLabelText("Precio de compra unitario"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    // Note: unlike the first submission, role="status" is already present in
    // the DOM (state.success was true after the first submit and stays true
    // after the second), so findByRole("status") would resolve immediately
    // without waiting for the second action to actually finish. vi.waitFor on
    // the field values themselves is the assertion that genuinely waits for
    // -- and proves -- the second reset.
    await vi.waitFor(() => {
      expect(screen.getByLabelText("Repuesto")).toHaveValue("");
      expect(screen.getByLabelText("Cantidad")).toHaveValue(null);
      expect(screen.getByLabelText("Precio de compra unitario")).toHaveValue(null);
    });
  });

  it("blocks submission and shows field errors when nothing is filled, without calling the server", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    expect(document.getElementById("repuestoId-error")).toHaveTextContent("Selecciona un repuesto");
    expect(mockAddEntradaItemAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockAddEntradaItemAction.mockResolvedValue({ error: "No puedes agregar ítems a una entrada anulada.", success: false });
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await selectCombobox("Repuesto", /Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.type(screen.getByLabelText("Precio de compra unitario"), "8");
    await userEvent.click(screen.getByRole("button", { name: "Registrar ítem" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No puedes agregar ítems a una entrada anulada.");
  });
});
