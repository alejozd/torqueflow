import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDevolver = vi.fn();
vi.mock("@/app/actions/devolucion-mostrador-actions", () => ({
  crearDevolucionAction: (...args: unknown[]) => mockDevolver(...args),
}));

import { DevolucionForm, type VentaDevolvible } from "./devolucion-form";

/** Venta pagada de 2 × 25.000 con IVA = 59.500. */
function venta(items: VentaDevolvible["items"], cambios: Partial<VentaDevolvible> = {}): VentaDevolvible {
  return { id: "v1", subtotal: 50000, total: 59500, saldoPendiente: 0, totalDevuelto: 0, items, ...cambios };
}

const ITEM = { id: "i1", descripcion: "Filtro de aceite", cantidad: 2, devueltoCantidad: 0, precioUnitario: 25000 };

describe("DevolucionForm", () => {
  beforeEach(() => {
    mockDevolver.mockReset().mockResolvedValue({ error: null, success: true, numero: 4 });
  });

  it("no ofrece devolver lo que ya se devolvió por completo", () => {
    render(<DevolucionForm venta={venta([{ ...ITEM, devueltoCantidad: 2 }])} />);

    expect(screen.getByText(/ya se devolvió por completo/i)).toBeInTheDocument();
  });

  it("topa la cantidad en lo que queda por devolver", async () => {
    render(<DevolucionForm venta={venta([{ ...ITEM, devueltoCantidad: 1 }])} />);

    const cantidad = screen.getByLabelText("Cantidad a devolver de Filtro de aceite");
    expect(cantidad).toHaveAttribute("max", "1");

    await userEvent.type(cantidad, "5");
    expect(cantidad).toHaveValue(1);
  });

  it("envía solo las líneas con cantidad y exige confirmación antes de sacar el dinero", async () => {
    render(<DevolucionForm venta={venta([ITEM])} />);

    // Sin nada elegido no hay nada que devolver.
    expect(screen.getByRole("button", { name: "Devolver" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Cantidad a devolver de Filtro de aceite"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Devolver" }));
    // El primer clic solo abre la confirmación: no se envía nada.
    expect(mockDevolver).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Sí, devolver" }));

    expect(mockDevolver).toHaveBeenCalledTimes(1);
    expect(mockDevolver.mock.calls[0]![0]).toBe("v1");
    const formData = mockDevolver.mock.calls[0]![2] as FormData;
    expect(JSON.parse(String(formData.get("lineas")))).toEqual([{ ventaItemId: "i1", cantidad: 1 }]);
    expect(formData.get("metodoPago")).toBe("EFECTIVO");
  });

  it("antes de confirmar dice cuánto sale del cajón", async () => {
    render(<DevolucionForm venta={venta([ITEM])} />);

    await userEvent.type(screen.getByLabelText("Cantidad a devolver de Filtro de aceite"), "1");

    // 25.000 + 19 % de IVA.
    expect(screen.getByTestId("resumen-devolucion")).toHaveTextContent(/Sale del cajón\s*\$\s*29\.750/);
    await userEvent.click(screen.getByRole("button", { name: "Devolver" }));
    expect(screen.getByText(/Sale \$\s*29\.750 del cajón; 1 unidad vuelve a la bodega/)).toBeInTheDocument();
  });

  it("en una venta a crédito primero baja la deuda y no sale dinero", async () => {
    render(<DevolucionForm venta={venta([ITEM], { saldoPendiente: 59500 })} />);

    await userEvent.click(screen.getByRole("button", { name: "Devolver todo" }));

    expect(screen.getByLabelText("Cantidad a devolver de Filtro de aceite")).toHaveValue(2);
    const resumen = screen.getByTestId("resumen-devolucion");
    expect(resumen).toHaveTextContent(/Baja de la deuda\s*\$\s*59\.500/);
    expect(resumen).toHaveTextContent(/Sale del cajón\s*\$\s*0/);
  });

  it("al registrar la devolución vuelve las cantidades a cero y avisa para refrescar", async () => {
    const onExito = vi.fn();
    render(<DevolucionForm venta={venta([ITEM])} onExito={onExito} />);

    await userEvent.type(screen.getByLabelText("Cantidad a devolver de Filtro de aceite"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Devolver" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, devolver" }));

    expect(await screen.findByText("Devolución #4 registrada.")).toBeInTheDocument();
    expect(onExito).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Cantidad a devolver de Filtro de aceite")).toHaveValue(0);
    expect(screen.getByRole("button", { name: "Devolver" })).toBeDisabled();
  });
});
