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
