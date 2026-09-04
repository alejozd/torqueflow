import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockCreateEntradaMercanciaAction = vi.fn();
vi.mock("@/app/actions/entrada-mercancia-actions", () => ({
  createEntradaMercanciaAction: (...args: unknown[]) => mockCreateEntradaMercanciaAction(...args),
}));

import { NuevaEntradaMercanciaForm } from "./nueva-entrada-mercancia-form";

// NuevaEntradaMercanciaForm renders a DialogClose-wrapped Cancel button that
// requires a Dialog ancestor (same as every dialog-only form in this app) --
// render through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

const proveedores = [{ id: "p1", nombre: "Repuestos El Motor" }] as never;
const bodegas = [{ id: "b1", nombre: "Bodega principal" }] as never;

// Proveedor is a Combobox now (search-as-you-type), not a native <select> --
// options only mount in the DOM once the popup is open.
async function selectCombobox(labelText: string, optionName: string | RegExp) {
  await userEvent.click(screen.getByLabelText(labelText));
  await userEvent.click(await screen.findByRole("option", { name: optionName }));
}

describe("NuevaEntradaMercanciaForm", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCreateEntradaMercanciaAction.mockReset();
    mockCreateEntradaMercanciaAction.mockResolvedValue({ error: null, success: true, entradaId: "e1" });
  });

  it("renders the proveedor and bodega selects", async () => {
    renderInDialog(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    expect(screen.getByLabelText("Proveedor")).toBeInTheDocument();
    expect(screen.getByLabelText("Bodega")).toBeInTheDocument();

    // Both Bodega (Select) and Proveedor's (Combobox) popups mark the rest of
    // the page inert while open, so each check must run on its own, and the
    // Proveedor check must run last, after every other assertion in this test.
    await userEvent.click(screen.getByRole("combobox", { name: "Bodega" }));
    expect(await screen.findByRole("option", { name: "Bodega principal" })).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Proveedor"));
    expect(await screen.findByRole("option", { name: "Repuestos El Motor" })).toBeInTheDocument();
  });

  it("navigates to the new entrada's detail page after a successful submit", async () => {
    renderInDialog(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    await selectCombobox("Proveedor", "Repuestos El Motor");
    const bodegaTrigger = screen.getByRole("combobox", { name: "Bodega" });
    await userEvent.click(bodegaTrigger);
    await userEvent.click(await screen.findByRole("option", { name: "Bodega principal" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear entrada" }));

    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/entradas-mercancia/e1"));
  });

  it("blocks submission and shows a field error when nothing is selected, without calling the server", async () => {
    renderInDialog(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear entrada" }));

    expect(document.getElementById("proveedorId-error")).toHaveTextContent("Selecciona un proveedor");
    expect(mockCreateEntradaMercanciaAction).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows the server error and does not navigate when the action refuses an otherwise valid submission", async () => {
    mockCreateEntradaMercanciaAction.mockResolvedValue({
      error: "Tu plan no permite más bodegas.",
      success: false,
      entradaId: null,
    });
    renderInDialog(<NuevaEntradaMercanciaForm proveedores={proveedores} bodegas={bodegas} />);

    await selectCombobox("Proveedor", "Repuestos El Motor");
    const bodegaTrigger = screen.getByRole("combobox", { name: "Bodega" });
    await userEvent.click(bodegaTrigger);
    await userEvent.click(await screen.findByRole("option", { name: "Bodega principal" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear entrada" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tu plan no permite más bodegas.");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
