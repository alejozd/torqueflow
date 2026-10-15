import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockActualizar = vi.fn();
vi.mock("@/app/actions/cotizacion-actions", () => ({
  actualizarDescuentoCotizacionAction: (...args: unknown[]) => mockActualizar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DescuentoCotizacionForm } from "./descuento-cotizacion-form";

beforeEach(() => {
  mockActualizar.mockReset().mockResolvedValue({ error: null, success: true });
});

describe("DescuentoCotizacionForm", () => {
  it("envía un descuento por porcentaje", async () => {
    render(<DescuentoCotizacionForm cotizacionId="q1" descuentoTipo="PORCENTAJE" descuentoPct={5} descuentoMonto={0} />);
    const campo = screen.getByLabelText("Descuento comercial");

    await userEvent.clear(campo);
    await userEvent.type(campo, "10");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(mockActualizar).toHaveBeenCalled());
    const formData = mockActualizar.mock.calls[0][2] as FormData;
    expect(formData.get("descuentoTipo")).toBe("PORCENTAJE");
    expect(formData.get("descuentoPct")).toBe("10");
  });

  it("al cambiar a monto fijo muestra el monto guardado y lo envía", async () => {
    render(<DescuentoCotizacionForm cotizacionId="q1" descuentoTipo="PORCENTAJE" descuentoPct={5} descuentoMonto={20000} />);

    await userEvent.click(screen.getByRole("button", { name: "Descuento por monto fijo" }));
    expect(screen.getByLabelText("Descuento comercial")).toHaveValue(20000);
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(mockActualizar).toHaveBeenCalled());
    const formData = mockActualizar.mock.calls[0][2] as FormData;
    expect(formData.get("descuentoTipo")).toBe("MONTO");
    expect(formData.get("descuentoMonto")).toBe("20000");
    expect(formData.get("descuentoPct")).toBeNull();
  });
});
