import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrearFactura = vi.fn();
const mockPush = vi.fn();
vi.mock("@/app/actions/factura-actions", () => ({ crearFacturaAction: (...args: unknown[]) => mockCrearFactura(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { GenerarFacturaForm } from "./generar-factura-form";

describe("GenerarFacturaForm", () => {
  beforeEach(() => {
    mockCrearFactura.mockReset();
    mockPush.mockReset();
  });

  it("asks before invoicing, then creates the factura and navigates to it", async () => {
    mockCrearFactura.mockResolvedValue({ error: null, success: true, facturaId: "f1" });
    render(<GenerarFacturaForm ordenId="o1" />);

    await userEvent.click(screen.getByRole("button", { name: "Generar factura" }));
    expect(mockCrearFactura).not.toHaveBeenCalled();
    expect(
      screen.getByText("¿Generar la factura? Se descuenta el stock de los repuestos y la orden ya no se podrá editar."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, facturar" }));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/facturas/f1"));
  });

  it("'No' cancels without invoicing", async () => {
    render(<GenerarFacturaForm ordenId="o1" />);

    await userEvent.click(screen.getByRole("button", { name: "Generar factura" }));
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(mockCrearFactura).not.toHaveBeenCalled();
  });
});
