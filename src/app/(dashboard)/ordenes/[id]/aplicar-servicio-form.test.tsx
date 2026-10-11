import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAplicar = vi.fn();
vi.mock("@/app/actions/servicio-actions", () => ({
  aplicarServicioAOrdenAction: (...args: unknown[]) => mockAplicar(...args),
}));

const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: vi.fn() } }));

import type { ServicioVista } from "@/app/actions/servicio-actions";
import { AplicarServicioForm } from "./aplicar-servicio-form";

const servicios: ServicioVista[] = [
  {
    id: "s1",
    nombre: "Cambio de aceite",
    descripcion: null,
    precioManoObra: 45000,
    activo: true,
    repuestos: [
      { repuestoId: "r1", codigo: "FA-1", nombre: "Filtro de aceite", cantidad: 1, precioVenta: 25000 },
      { repuestoId: "r2", codigo: "AC-5", nombre: "Aceite 5W30", cantidad: 2, precioVenta: 40000 },
    ],
    totalEstimado: 150000,
  },
  {
    id: "s2",
    nombre: "Alineación",
    descripcion: null,
    precioManoObra: 30000,
    activo: true,
    repuestos: [],
    totalEstimado: 30000,
  },
];

describe("AplicarServicioForm", () => {
  beforeEach(() => {
    mockAplicar.mockReset();
    mockAplicar.mockResolvedValue({ error: null, success: true, agregados: { manoDeObra: true, repuestos: 2 } });
    mockToastSuccess.mockReset();
  });

  it("ofrece los servicios activos indicando kit y total estimado", async () => {
    render(<AplicarServicioForm ordenId="o1" servicios={servicios} />);

    await userEvent.click(screen.getByRole("combobox", { name: /Aplicar servicio del catálogo/ }));

    expect(await screen.findByRole("option", { name: /Cambio de aceite — Kit · 2 repuestos/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Alineación/ })).toBeInTheDocument();
  });

  it("aplica el servicio elegido y avisa qué se agregó", async () => {
    render(<AplicarServicioForm ordenId="o1" servicios={servicios} />);

    await userEvent.click(screen.getByRole("combobox", { name: /Aplicar servicio del catálogo/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Cambio de aceite/ }));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar servicio" }));

    await waitFor(() => expect(mockAplicar).toHaveBeenCalledTimes(1));
    const [ordenId, , formData] = mockAplicar.mock.calls[0] as [string, unknown, FormData];
    expect(ordenId).toBe("o1");
    expect(formData.get("servicioId")).toBe("s1");
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Servicio agregado: mano de obra y 2 repuestos"));
  });

  it("avisa solo los repuestos cuando el kit no tiene mano de obra propia", async () => {
    mockAplicar.mockResolvedValue({ error: null, success: true, agregados: { manoDeObra: false, repuestos: 3 } });
    render(<AplicarServicioForm ordenId="o1" servicios={servicios} />);

    await userEvent.click(screen.getByRole("combobox", { name: /Aplicar servicio del catálogo/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Alineación/ }));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar servicio" }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Servicio agregado: 3 repuestos"));
  });

  it("muestra el error de la action", async () => {
    mockAplicar.mockResolvedValue({ error: "El servicio no tiene nada que agregar", success: false, agregados: null });
    render(<AplicarServicioForm ordenId="o1" servicios={servicios} />);

    await userEvent.click(screen.getByRole("combobox", { name: /Aplicar servicio del catálogo/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Alineación/ }));
    await userEvent.click(screen.getByRole("button", { name: "Aplicar servicio" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El servicio no tiene nada que agregar");
  });

  it("sin servicios activos no ofrece nada", () => {
    render(<AplicarServicioForm ordenId="o1" servicios={[]} />);

    expect(screen.queryByRole("button", { name: "Aplicar servicio" })).not.toBeInTheDocument();
  });
});
