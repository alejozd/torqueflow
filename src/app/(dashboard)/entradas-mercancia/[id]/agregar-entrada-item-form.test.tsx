import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAddEntradaItemAction = vi.fn();
vi.mock("@/app/actions/entrada-mercancia-actions", () => ({
  addEntradaItemAction: (...args: unknown[]) => mockAddEntradaItemAction(...args),
}));

import { AgregarEntradaItemForm } from "./agregar-entrada-item-form";

const repuestos = [
  { id: "r1", codigo: "FRN-001", nombre: "Filtro de aceite", precioVenta: 20000, precioCompra: 8000, stockActual: 10, stockMinimo: 5 },
  { id: "r2", codigo: "PAS-002", nombre: "Pastillas de freno", precioVenta: 50000, precioCompra: 30000, stockActual: 2, stockMinimo: 5 },
] as never;

// The catalog is a collapsible picker now (not an always-visible list) --
// open it via the "Repuesto" toggle button before a catalog row is queryable.
async function seleccionarRepuesto(nombreRegex: RegExp) {
  await userEvent.click(screen.getByLabelText("Repuesto"));
  await userEvent.click(await screen.findByRole("button", { name: nombreRegex }));
}

describe("AgregarEntradaItemForm", () => {
  beforeEach(() => {
    mockAddEntradaItemAction.mockReset();
    mockAddEntradaItemAction.mockResolvedValue({ error: null, success: true, entradaId: "e1" });
  });

  it("renders the repuesto toggle, cantidad, costo unit., and the agregar button, with the catalog collapsed", () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    expect(screen.getByLabelText("Repuesto")).toHaveTextContent("Selecciona un repuesto");
    expect(screen.getByLabelText("Cantidad")).toBeInTheDocument();
    expect(screen.getByLabelText("Costo unit.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Filtro de aceite/ })).not.toBeInTheDocument();
  });

  it("opens the catalog when the repuesto toggle is clicked, and filters it by código or nombre", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await userEvent.click(screen.getByLabelText("Repuesto"));

    expect(screen.getByRole("button", { name: /Filtro de aceite/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pastillas de freno/ })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Buscar repuesto"), "PAS-002");

    expect(screen.getByRole("button", { name: /Pastillas de freno/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Filtro de aceite/ })).not.toBeInTheDocument();
  });

  it("selecting a repuesto closes the picker, prefills its last cost, and shows the current stock flow", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await seleccionarRepuesto(/Filtro de aceite/);

    expect(screen.getByLabelText("Repuesto")).toHaveTextContent("Filtro de aceite");
    expect(screen.queryByRole("button", { name: /Pastillas de freno/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Costo unit.")).toHaveValue(8000);
    // Stock flow reads "actual -> actual" before any cantidad is entered.
    expect(screen.getByText("10 → 10")).toBeInTheDocument();
    expect(screen.getByText(/Último costo/)).toBeInTheDocument();
  });

  it("computes subtotal, stock flow, variación, and the weighted-average costo medio as cantidad/costo change", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await seleccionarRepuesto(/Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "10");

    // Same cost as last time (prefilled 8000): no variación, subtotal 80.000,
    // stock 10 -> 20, weighted average stays 8.000 (both sides at the same
    // cost). Money assertions use a regex: Intl.NumberFormat inserts a
    // non-breaking space between "$" and the amount, not a plain " ".
    expect(screen.getByText(/^\$\s*80\.000$/)).toBeInTheDocument();
    expect(screen.getByText("10 → 20")).toBeInTheDocument();
    expect(screen.getByText("+0.0%")).toBeInTheDocument();

    // Now receive at a higher cost: weighted average = (10*8000 + 10*10000) / 20 = 9.000.
    await userEvent.clear(screen.getByLabelText("Costo unit."));
    await userEvent.type(screen.getByLabelText("Costo unit."), "10000");

    expect(screen.getByText("+25.0%")).toBeInTheDocument();
    expect(screen.getByText(/^\$\s*9\.000$/)).toBeInTheDocument();
  });

  it("shows a low-quantity warning only while cantidad is 1 or 2", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await seleccionarRepuesto(/Filtro de aceite/);
    expect(screen.queryByText(/Cantidad muy baja/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Aumentar cantidad"));
    expect(screen.getByText(/Cantidad muy baja/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Aumentar cantidad"));
    expect(screen.getByText(/Cantidad muy baja/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Aumentar cantidad"));
    expect(screen.queryByText(/Cantidad muy baja/)).not.toBeInTheDocument();
  });

  it("clears repuesto, cantidad, and precio after a successful submit", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await seleccionarRepuesto(/Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await screen.findByRole("status");

    // The repuesto selection is a react-hook-form controlled field (unlike
    // cantidad/precio, which are uncontrolled register()ed inputs reset
    // imperatively via the DOM ref) -- its cleared value needs one more
    // render tick to propagate, hence waitFor instead of a bare assertion.
    await vi.waitFor(() => {
      expect(screen.getByLabelText("Repuesto")).toHaveTextContent("Selecciona un repuesto");
    });
    expect(screen.getByLabelText("Cantidad")).toHaveValue(null);
    expect(screen.getByLabelText("Costo unit.")).toHaveValue(null);
  });

  it("clears the fields again after a second consecutive successful submit", async () => {
    // A real server action returns a fresh object on every invocation. Use a
    // distinct mockResolvedValueOnce per call (instead of the shared
    // mockResolvedValue from beforeEach) so this test faithfully mirrors
    // production and doesn't accidentally pass because both calls resolved
    // to the exact same object reference.
    mockAddEntradaItemAction.mockReset();
    mockAddEntradaItemAction.mockResolvedValueOnce({ error: null, success: true, entradaId: "e1" });
    mockAddEntradaItemAction.mockResolvedValueOnce({ error: null, success: true, entradaId: "e1" });

    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await seleccionarRepuesto(/Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await screen.findByRole("status");

    // Second submission with different values -- proves the reset isn't just
    // residual empty state left over from the first submit. This is the
    // assertion that distinguishes the correct `[state, reset]` effect
    // dependency from the buggy `[state.success, reset]` alternative: under
    // the bug, `state.success` is already `true` from the first submission,
    // so it doesn't change value on the second success and the effect never
    // re-runs, leaving these fields populated.
    await seleccionarRepuesto(/Pastillas de freno/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await vi.waitFor(() => {
      expect(screen.getByLabelText("Repuesto")).toHaveTextContent("Selecciona un repuesto");
      expect(screen.getByLabelText("Cantidad")).toHaveValue(null);
      expect(screen.getByLabelText("Costo unit.")).toHaveValue(null);
    });
  });

  it("blocks submission and shows field errors when nothing is filled, without calling the server", async () => {
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(document.getElementById("repuestoId-error")).toHaveTextContent("Selecciona un repuesto");
    expect(mockAddEntradaItemAction).not.toHaveBeenCalled();
  });

  it("shows the server error when the action refuses an otherwise valid submission", async () => {
    mockAddEntradaItemAction.mockResolvedValue({
      error: "No puedes agregar ítems a una entrada anulada.",
      success: false,
      entradaId: "e1",
    });
    render(<AgregarEntradaItemForm entradaId="e1" repuestos={repuestos} />);

    await seleccionarRepuesto(/Filtro de aceite/);
    await userEvent.type(screen.getByLabelText("Cantidad"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No puedes agregar ítems a una entrada anulada.");
  });
});
