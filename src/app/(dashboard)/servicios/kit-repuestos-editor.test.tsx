import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAgregar = vi.fn();
const mockActualizarCantidad = vi.fn();
const mockQuitar = vi.fn();
vi.mock("@/app/actions/servicio-actions", () => ({
  crearServicioAction: vi.fn(),
  actualizarServicioAction: vi.fn(),
  toggleServicioActivoAction: vi.fn(),
  agregarRepuestoAServicioAction: (...args: unknown[]) => mockAgregar(...args),
  actualizarCantidadRepuestoServicioAction: (...args: unknown[]) => mockActualizarCantidad(...args),
  quitarRepuestoDeServicioAction: (...args: unknown[]) => mockQuitar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import type { ServicioVista } from "@/app/actions/servicio-actions";
import { KitRepuestosEditor } from "./kit-repuestos-editor";

const servicio: ServicioVista = {
  id: "s1",
  nombre: "Cambio de aceite",
  descripcion: null,
  precioManoObra: 45000,
  activo: true,
  repuestos: [{ repuestoId: "r1", codigo: "FA-1", nombre: "Filtro de aceite", cantidad: 2, precioVenta: 25000 }],
  totalEstimado: 95000,
};

const repuestos: RepuestoOption[] = [
  { id: "r1", codigo: "FA-1", nombre: "Filtro de aceite", precioVenta: 25000, precioCompra: 10000, stockActual: 5, stockMinimo: 1 },
  { id: "r2", codigo: "AC-5", nombre: "Aceite 5W30", precioVenta: 40000, precioCompra: 30000, stockActual: 10, stockMinimo: 2 },
];

describe("KitRepuestosEditor", () => {
  beforeEach(() => {
    mockAgregar.mockReset();
    mockAgregar.mockResolvedValue({ error: null, success: true, cantidad: 1 });
    mockActualizarCantidad.mockReset();
    mockActualizarCantidad.mockResolvedValue({ error: null });
    mockQuitar.mockReset();
    mockQuitar.mockResolvedValue({ error: null });
  });

  it("muestra la tabla del kit con código, precio de venta y subtotal", () => {
    render(<KitRepuestosEditor servicio={servicio} repuestos={repuestos} />);

    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("FA-1")).toBeInTheDocument();
    // Precio de venta actual del repuesto y subtotal (2 x 25000). Con separador
    // de miles: la comparación exacta de texto no es fiable porque Intl mete un
    // espacio fino entre "$" y las cifras.
    expect(tabla).toHaveTextContent(/25\.000/);
    expect(tabla).toHaveTextContent(/50\.000/);
  });

  it("sin repuestos avisa que el servicio es solo mano de obra", () => {
    render(<KitRepuestosEditor servicio={{ ...servicio, repuestos: [] }} repuestos={repuestos} />);

    expect(screen.getByText(/todavía no tiene repuestos/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("agrega el repuesto elegido en el combo con su cantidad", async () => {
    render(<KitRepuestosEditor servicio={servicio} repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("combobox", { name: /Agregar repuesto de tu sede/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Aceite 5W30/ }));
    await userEvent.click(screen.getByRole("button", { name: "Agregar al kit" }));

    await waitFor(() => expect(mockAgregar).toHaveBeenCalledTimes(1));
    const [servicioId, , formData] = mockAgregar.mock.calls[0] as [string, unknown, FormData];
    expect(servicioId).toBe("s1");
    expect(formData.get("repuestoId")).toBe("r2");
    expect(formData.get("cantidad")).toBe("1");
  });

  it("muestra el error de la action cuando el repuesto no es de la sede", async () => {
    mockAgregar.mockResolvedValue({ error: "Repuesto no encontrado en tu sede activa", success: false, cantidad: null });
    render(<KitRepuestosEditor servicio={servicio} repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("combobox", { name: /Agregar repuesto de tu sede/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Filtro de aceite/ }));
    await userEvent.click(screen.getByRole("button", { name: "Agregar al kit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Repuesto no encontrado en tu sede activa");
  });

  it("guarda la cantidad editada de un repuesto del kit", async () => {
    render(<KitRepuestosEditor servicio={servicio} repuestos={repuestos} />);

    const input = screen.getByLabelText("Cantidad de Filtro de aceite");
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockActualizarCantidad).toHaveBeenCalledWith("s1", "r1", 5));
  });

  it("quitar pide confirmación antes de llamar la action", async () => {
    render(<KitRepuestosEditor servicio={servicio} repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(screen.getByText("¿Quitar del kit?")).toBeInTheDocument();
    expect(mockQuitar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(mockQuitar).toHaveBeenCalledWith("s1", "r1"));
  });
});
