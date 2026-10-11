import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockToggle = vi.fn();
const mockQuitar = vi.fn();
vi.mock("@/app/actions/servicio-actions", () => ({
  crearServicioAction: vi.fn(),
  actualizarServicioAction: vi.fn(),
  toggleServicioActivoAction: (...args: unknown[]) => mockToggle(...args),
  agregarRepuestoAServicioAction: vi.fn(),
  actualizarCantidadRepuestoServicioAction: vi.fn(),
  quitarRepuestoDeServicioAction: (...args: unknown[]) => mockQuitar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { ServicioVista } from "@/app/actions/servicio-actions";
import type { RepuestoOption } from "@/app/actions/repuesto-actions";
import { ServiciosSection } from "./servicios-section";

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });

const servicios: ServicioVista[] = [
  {
    id: "s1",
    nombre: "Cambio de aceite",
    descripcion: "Aceite y filtro",
    precioManoObra: 45000,
    activo: true,
    repuestos: [{ repuestoId: "r1", codigo: "FA-1", nombre: "Filtro de aceite", cantidad: 2, precioVenta: 25000 }],
    totalEstimado: 95000,
  },
  {
    id: "s2",
    nombre: "Alineación",
    descripcion: null,
    precioManoObra: 30000,
    activo: false,
    repuestos: [],
    totalEstimado: 30000,
  },
];

const repuestos: RepuestoOption[] = [
  { id: "r1", codigo: "FA-1", nombre: "Filtro de aceite", precioVenta: 25000, precioCompra: 10000, stockActual: 5, stockMinimo: 1 },
];

describe("ServiciosSection", () => {
  beforeEach(() => {
    mockToggle.mockReset();
    mockToggle.mockResolvedValue({ error: null });
  });

  it("lista los servicios con precio, total estimado e insignias", () => {
    render(<ServiciosSection servicios={servicios} repuestos={repuestos} />);

    const filas = screen.getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]!.textContent).toContain("Cambio de aceite");
    expect(filas[0]!.textContent).toContain("Kit · 1");
    expect(filas[0]!.textContent).toContain(formatoMoneda.format(45000));
    expect(filas[0]!.textContent).toContain(formatoMoneda.format(95000));
    expect(filas[1]!.textContent).toContain("Inactivo");
  });

  it("un servicio sin repuestos no muestra la insignia de kit", () => {
    render(<ServiciosSection servicios={[servicios[1]!]} repuestos={repuestos} />);

    expect(screen.getByText("Alineación")).toBeInTheDocument();
    expect(screen.queryByText(/^Kit · /)).not.toBeInTheDocument();
  });

  it("desactivar un servicio activo llama la action", async () => {
    render(<ServiciosSection servicios={servicios} repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith("s1"));
  });

  it("activar un servicio inactivo llama la action", async () => {
    render(<ServiciosSection servicios={servicios} repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Activar" }));

    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith("s2"));
  });

  it("expande el kit de un servicio y muestra su tabla de repuestos", async () => {
    render(<ServiciosSection servicios={servicios} repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Repuestos del kit (1)" }));

    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("FA-1")).toBeInTheDocument();
    expect(within(tabla).getByText("Filtro de aceite")).toBeInTheDocument();
    expect(within(tabla).getByLabelText("Cantidad de Filtro de aceite")).toHaveValue(2);
  });

  it("abre el diálogo de nuevo servicio", async () => {
    render(<ServiciosSection servicios={servicios} repuestos={repuestos} />);

    await userEvent.click(screen.getByRole("button", { name: "Nuevo servicio" }));

    expect(await screen.findByRole("heading", { name: "Nuevo servicio" })).toBeInTheDocument();
  });

  it("sin servicios invita a crear el primero", () => {
    render(<ServiciosSection servicios={[]} repuestos={repuestos} />);

    expect(screen.getByText(/Todavía no hay servicios en el catálogo/)).toBeInTheDocument();
  });
});
