import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPagar = vi.fn();
vi.mock("@/app/actions/liquidacion-actions", () => ({
  pagarLiquidacionAction: (...args: unknown[]) => mockPagar(...args),
  actualizarAjusteLiquidacionAction: vi.fn(),
  anularLiquidacionAction: vi.fn(),
  generarLiquidacionesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PagarLiquidacionDialog } from "./pagar-liquidacion-dialog";

describe("PagarLiquidacionDialog", () => {
  beforeEach(() => {
    mockPagar.mockReset();
    mockPagar.mockResolvedValue({ error: null, success: true });
  });

  it("abre el diálogo con el monto y el periodo de la liquidación", async () => {
    render(<PagarLiquidacionDialog liquidacionId="l1" nombre="Ana" periodo="octubre de 2026" total={72000} />);

    await userEvent.click(screen.getByRole("button", { name: "Pagar" }));

    expect(await screen.findByRole("heading", { name: "Pagar liquidación de Ana" })).toBeInTheDocument();
    expect(screen.getByText(/octubre de 2026/)).toBeInTheDocument();
  });

  it("paga en efectivo con la fecha de hoy por defecto", async () => {
    render(<PagarLiquidacionDialog liquidacionId="l1" nombre="Ana" periodo="octubre de 2026" total={72000} />);

    await userEvent.click(screen.getByRole("button", { name: "Pagar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pagar liquidación" }));

    await waitFor(() => expect(mockPagar).toHaveBeenCalledTimes(1));
    const [liquidacionId, , formData] = mockPagar.mock.calls[0] as [string, unknown, FormData];
    expect(liquidacionId).toBe("l1");
    expect(formData.get("metodoPago")).toBe("EFECTIVO");
    expect(formData.get("fecha")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formData.get("referencia")).toBe("");
  });

  it("permite elegir otro método y escribir una referencia", async () => {
    render(<PagarLiquidacionDialog liquidacionId="l1" nombre="Ana" periodo="octubre de 2026" total={72000} />);

    await userEvent.click(screen.getByRole("button", { name: "Pagar" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "Método de pago" }));
    await userEvent.click(await screen.findByRole("option", { name: "Transferencia" }));
    await userEvent.type(screen.getByLabelText("Referencia (opcional)"), "TRF-99");
    await userEvent.click(screen.getByRole("button", { name: "Pagar liquidación" }));

    await waitFor(() => expect(mockPagar).toHaveBeenCalledTimes(1));
    const formData = mockPagar.mock.calls[0]![2] as FormData;
    expect(formData.get("metodoPago")).toBe("TRANSFERENCIA");
    expect(formData.get("referencia")).toBe("TRF-99");
  });

  it("muestra el error de la action (por ejemplo, ya está pagada)", async () => {
    mockPagar.mockResolvedValue({ error: "Solo se puede pagar una liquidación pendiente", success: false });
    render(<PagarLiquidacionDialog liquidacionId="l1" nombre="Ana" periodo="octubre de 2026" total={72000} />);

    await userEvent.click(screen.getByRole("button", { name: "Pagar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pagar liquidación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo se puede pagar una liquidación pendiente");
  });
});
