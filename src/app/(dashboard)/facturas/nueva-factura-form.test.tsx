import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockCrearFacturaAction = vi.fn();
vi.mock("@/app/actions/factura-actions", () => ({
  crearFacturaAction: (...args: unknown[]) => mockCrearFacturaAction(...args),
}));

import { NuevaFacturaForm } from "./nueva-factura-form";

// NuevaFacturaForm renders a DialogClose-wrapped Cancel button that requires
// a Dialog ancestor (same as every dialog-only form in this app) -- render
// through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

const ordenes = [
  { id: "o1", placa: "WGT-451", clienteNombre: "María Gómez", clienteDocumento: "43128905", total: 890000 },
  { id: "o2", placa: "PLR-902", clienteNombre: "Jorge Cardona", clienteDocumento: "79445210", total: 320000 },
];

describe("NuevaFacturaForm", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCrearFacturaAction.mockReset();
  });

  it("shows the empty-state message instead of a useless empty picker", () => {
    renderInDialog(<NuevaFacturaForm ordenes={[]} />);

    expect(
      screen.getByText("No hay órdenes terminadas o entregadas pendientes de facturar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar factura" })).not.toBeInTheDocument();
  });

  it("lists every orden by placa, cliente, and total once the picker is open", async () => {
    renderInDialog(<NuevaFacturaForm ordenes={ordenes} />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: /WGT-451 — María Gómez/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /PLR-902 — Jorge Cardona/ })).toBeInTheDocument();
  });

  it("filters the orden options by cliente, cédula, or placa as you type", async () => {
    renderInDialog(<NuevaFacturaForm ordenes={ordenes} />);

    await userEvent.type(screen.getByRole("combobox"), "79445210");

    expect(await screen.findByRole("option", { name: /PLR-902 — Jorge Cardona/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /WGT-451/ })).not.toBeInTheDocument();
  });

  it("submits the selected ordenId and navigates to the new factura on success", async () => {
    mockCrearFacturaAction.mockResolvedValue({ error: null, success: true, facturaId: "f1" });
    renderInDialog(<NuevaFacturaForm ordenes={ordenes} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: /PLR-902 — Jorge Cardona/ }));
    await userEvent.click(screen.getByRole("button", { name: "Generar factura" }));

    expect(mockCrearFacturaAction).toHaveBeenCalledWith(
      "o2",
      { error: null, success: false, facturaId: null },
      expect.any(FormData),
    );
    expect(mockPush).toHaveBeenCalledWith("/facturas/f1");
  });

  it("shows the server error and does not navigate when the action fails", async () => {
    mockCrearFacturaAction.mockResolvedValue({ error: "Orden no encontrada", success: false, facturaId: null });
    renderInDialog(<NuevaFacturaForm ordenes={ordenes} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: /WGT-451 — María Gómez/ }));
    await userEvent.click(screen.getByRole("button", { name: "Generar factura" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Orden no encontrada");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
