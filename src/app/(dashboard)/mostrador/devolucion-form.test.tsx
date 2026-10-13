import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDevolver = vi.fn();
vi.mock("@/app/actions/devolucion-mostrador-actions", () => ({
  crearDevolucionAction: (...args: unknown[]) => mockDevolver(...args),
}));

import { DevolucionForm } from "./devolucion-form";
import type { VentaMostradorDia } from "@/app/actions/venta-mostrador-actions";

function venta(items: VentaMostradorDia["items"]): VentaMostradorDia {
  return {
    id: "v1",
    numero: 3,
    total: 59500,
    saldoPendiente: 0,
    estado: "PAGADA",
    clienteNombre: null,
    createdAt: new Date("2026-10-17T15:00:00Z"),
    items,
  };
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
});
