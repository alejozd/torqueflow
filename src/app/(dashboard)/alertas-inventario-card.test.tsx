import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AlertaInventarioRow, AlertasInventario } from "@/lib/dashboard/alertas-inventario";

const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: vi.fn() } }));

import { AlertasInventarioCard } from "./alertas-inventario-card";

function alerta(overrides: Partial<AlertaInventarioRow> & { id: string; nombre: string }): AlertaInventarioRow {
  return {
    codigo: overrides.id.toUpperCase(),
    stockActual: 2,
    stockMinimo: 5,
    comprometido: 0,
    disponible: 2,
    severidad: "CRITICO",
    frenaOrdenes: false,
    ordenes: [],
    precioCompra: 1000,
    bodega: { id: "b1", nombre: "Principal" },
    proveedor: { id: "p1", nombre: "Bosch Colombia", telefono: null, email: null },
    consumoSemanal: [0, 0, 0, 0, 0, 0, 1, 2],
    consumoDiario: 0,
    diasCobertura: null,
    cantidadSugerida: 8,
    costoSugerido: 8000,
    ultimaCompra: null,
    ...overrides,
  };
}

function datos(alertas: AlertaInventarioRow[]): AlertasInventario {
  return {
    alertas,
    resumen: {
      total: alertas.length,
      sinDisponible: alertas.filter((a) => a.severidad === "SIN_DISPONIBLE").length,
      criticos: alertas.filter((a) => a.severidad === "CRITICO").length,
      bajoMinimo: alertas.filter((a) => a.severidad === "BAJO_MINIMO").length,
      ordenesFrenadas: [],
      seAgotanEn7Dias: 0,
      costoReposicion: alertas.reduce((s, a) => s + a.costoSugerido, 0),
    },
  };
}

const motor = alerta({
  id: "m1",
  nombre: "Motor de arranque",
  stockActual: 1,
  comprometido: 2,
  disponible: -1,
  severidad: "SIN_DISPONIBLE",
  frenaOrdenes: true,
  ordenes: [{ id: "o1", estado: "EN_PROCESO", placa: "abc123", vehiculo: "Mazda 3", cantidad: 2 }],
});
const filtro = alerta({ id: "f1", nombre: "Filtro de aceite", proveedor: { id: "p2", nombre: "Autopartes Norte", telefono: null, email: null } });

describe("AlertasInventarioCard", () => {
  beforeEach(() => {
    mockToastSuccess.mockReset();
  });

  it("shows a calm empty state when nothing is below its minimum", () => {
    render(<AlertasInventarioCard data={datos([])} />);
    expect(screen.getByText("Todo en orden")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("groups by proveedor with a Registrar entrada link preselecting proveedor and bodega", () => {
    render(<AlertasInventarioCard data={datos([motor, filtro])} />);

    const links = screen.getAllByRole("link", { name: /Registrar entrada/ });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/entradas-mercancia?nueva=1&proveedorId=p1&bodegaId=b1",
      "/entradas-mercancia?nueva=1&proveedorId=p2&bodegaId=b1",
    ]);
    expect(screen.getByText("Frena Mazda 3 · ABC-123")).toBeInTheDocument();
  });

  it("filters to rows blocking ordenes on the Frenan órdenes tab", async () => {
    render(<AlertasInventarioCard data={datos([motor, filtro])} />);

    await userEvent.click(screen.getByRole("tab", { name: /Frenan órdenes/ }));

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Motor de arranque")).toBeInTheDocument();
    expect(within(panel).queryByText("Filtro de aceite")).not.toBeInTheDocument();
  });

  it("copies an order grouped by proveedor using the adjusted quantities", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<AlertasInventarioCard data={datos([motor, filtro])} />);

    await user.click(screen.getByLabelText("Seleccionar Motor de arranque"));
    await user.click(screen.getByLabelText("Más Motor de arranque"));
    await user.click(screen.getByLabelText("Seleccionar Filtro de aceite"));
    await user.click(screen.getByRole("button", { name: /Copiar pedido/ }));

    expect(writeText).toHaveBeenCalledWith(
      "Pedido para Bosch Colombia:\n- 9 x Motor de arranque (M1)\n\nPedido para Autopartes Norte:\n- 8 x Filtro de aceite (F1)",
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("Pedido copiado al portapapeles");
  });

  it("reveals purchase history and links to the ordenes using the repuesto", async () => {
    render(<AlertasInventarioCard data={datos([motor])} />);

    await userEvent.click(screen.getByLabelText("Detalle de Motor de arranque"));

    expect(screen.getByText("Sin compras registradas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mazda 3 · ABC-123 (2)" })).toHaveAttribute("href", "/ordenes/o1");
  });
});
