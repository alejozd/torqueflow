import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AlertaInventarioRow, AlertasInventario } from "@/lib/dashboard/alertas-inventario";

const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: vi.fn() } }));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const mockCrearPedidos = vi.fn();
vi.mock("@/app/actions/pedido-compra-actions", () => ({
  crearPedidosCompraAction: (...args: unknown[]) => mockCrearPedidos(...args),
}));

const mockPosponer = vi.fn();
const mockReactivar = vi.fn();
vi.mock("@/app/actions/alertas-inventario-actions", () => ({
  posponerAlertaInventarioAction: (...args: unknown[]) => mockPosponer(...args),
  reactivarAlertaInventarioAction: (...args: unknown[]) => mockReactivar(...args),
}));

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
    proveedor: { id: "p1", nombre: "Bosch Colombia", telefono: null, email: null, diasEntrega: 3 },
    diasEntrega: 3,
    multiploCompra: 1,
    objetivoReposicion: 10,
    seAgotaAntesDeEntrega: false,
    pospuestaHasta: null,
    enCamino: null,
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
      pospuestas: alertas.filter((a) => a.pospuestaHasta).length,
      pedidosEnCamino: [],
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
const filtro = alerta({ id: "f1", nombre: "Filtro de aceite", proveedor: { id: "p2", nombre: "Autopartes Norte", telefono: null, email: null, diasEntrega: 3 } });

describe("AlertasInventarioCard", () => {
  beforeEach(() => {
    mockToastSuccess.mockReset();
    mockPosponer.mockReset().mockResolvedValue({ error: null });
    mockPush.mockReset();
    mockCrearPedidos.mockReset().mockResolvedValue({ error: null, pedidoIds: ["pc1"] });
    mockReactivar.mockReset().mockResolvedValue({ error: null });
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
    await user.click(screen.getByRole("button", { name: "Copiar" }));

    expect(writeText).toHaveBeenCalledWith(
      "Pedido para Bosch Colombia:\n- 9 x Motor de arranque (M1)\n\nPedido para Autopartes Norte:\n- 8 x Filtro de aceite (F1)",
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("Pedido copiado al portapapeles");
  });

  it("warns when the repuesto runs out before delivery and steps the quantity by pack size", async () => {
    const bujia = alerta({
      id: "b1",
      nombre: "Bujía",
      disponible: 2,
      diasCobertura: 2,
      seAgotaAntesDeEntrega: true,
      multiploCompra: 4,
      cantidadSugerida: 8,
    });
    render(<AlertasInventarioCard data={datos([bujia])} />);

    expect(screen.getByText("Se agota en ~2 días, antes de la entrega")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Más Bujía"));
    expect(screen.getByLabelText("Cantidad a pedir de Bujía")).toHaveTextContent("12");
    await userEvent.click(screen.getByLabelText("Menos Bujía"));
    await userEvent.click(screen.getByLabelText("Menos Bujía"));
    expect(screen.getByLabelText("Cantidad a pedir de Bujía")).toHaveTextContent("4");
    // Down to 0 to leave a selected line out of the pedido, never negative.
    await userEvent.click(screen.getByLabelText("Menos Bujía"));
    await userEvent.click(screen.getByLabelText("Menos Bujía"));
    expect(screen.getByLabelText("Cantidad a pedir de Bujía")).toHaveTextContent("0");
  });

  it("moves snoozed alerts to a Pospuestas tab and lets them be reactivated", async () => {
    const pospuesta = alerta({ id: "p1", nombre: "Correa", pospuestaHasta: "2026-10-16T15:00:00.000Z" });
    render(<AlertasInventarioCard data={datos([filtro, pospuesta])} />);

    expect(within(screen.getByRole("tabpanel")).queryByText("Correa")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Pospuestas/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Correa")).toBeInTheDocument();
    expect(within(panel).getByText(/Pospuesta hasta el 16/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Detalle de Correa"));
    await userEvent.click(screen.getByRole("button", { name: /Reactivar alerta/ }));
    expect(mockReactivar).toHaveBeenCalledWith("p1");
  });

  it("falls back to Por urgencia when the last pospuesta is reactivated", async () => {
    const pospuesta = alerta({ id: "p1", nombre: "Correa", pospuestaHasta: "2026-10-16T15:00:00.000Z" });
    const { rerender } = render(<AlertasInventarioCard data={datos([filtro, pospuesta])} />);
    await userEvent.click(screen.getByRole("tab", { name: /Pospuestas/ }));

    rerender(<AlertasInventarioCard data={datos([filtro, { ...pospuesta, pospuestaHasta: null }])} />);

    expect(screen.queryByRole("tab", { name: /Pospuestas/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Por urgencia/ })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("tabpanel")).getByText("Correa")).toBeInTheDocument();
  });

  it("creates a pedido from the selection, leaving out lines at 0, and opens it", async () => {
    const user = userEvent.setup();
    render(<AlertasInventarioCard data={datos([motor, filtro])} />);

    await user.click(screen.getByLabelText("Seleccionar Motor de arranque"));
    await user.click(screen.getByLabelText("Seleccionar Filtro de aceite"));
    for (let i = 0; i < 8; i++) await user.click(screen.getByLabelText("Menos Filtro de aceite"));
    await user.click(screen.getByRole("button", { name: /Crear pedido/ }));

    await vi.waitFor(() => expect(mockCrearPedidos).toHaveBeenCalledWith([{ repuestoId: "m1", cantidad: 8 }]));
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/pedidos-compra/pc1"));
  });

  it("shows units on their way and lists pedidos en camino in their own tab", async () => {
    const enCamino = alerta({
      id: "e1",
      nombre: "Bujía",
      enCamino: { cantidad: 8, pedidos: [{ id: "pc9", numero: 9, fechaEsperada: "2026-10-12T15:00:00.000Z" }] },
    });
    const data = datos([enCamino]);
    data.resumen.pedidosEnCamino = [
      { id: "pc9", numero: 9, proveedorNombre: "Bosch Colombia", fechaEsperada: "2026-10-12T15:00:00.000Z", referencias: 2, total: 50000 },
    ];
    render(<AlertasInventarioCard data={data} />);

    expect(screen.getByText(/En camino 8 uds · llega el 12/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /En camino/ }));
    expect(screen.getByRole("link", { name: /#9.*Bosch Colombia/ })).toHaveAttribute("href", "/pedidos-compra/pc9");
  });

  it("snoozes an alert for 7 days from its detail", async () => {
    render(<AlertasInventarioCard data={datos([filtro])} />);

    await userEvent.click(screen.getByLabelText("Detalle de Filtro de aceite"));
    await userEvent.click(screen.getByRole("button", { name: /Posponer 7 días/ }));

    expect(mockPosponer).toHaveBeenCalledWith("f1");
    await vi.waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Alerta de Filtro de aceite pospuesta 7 días"));
  });

  it("reveals purchase history and links to the ordenes using the repuesto", async () => {
    render(<AlertasInventarioCard data={datos([motor])} />);

    await userEvent.click(screen.getByLabelText("Detalle de Motor de arranque"));

    expect(screen.getByText("Sin compras registradas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mazda 3 · ABC-123 (2)" })).toHaveAttribute("href", "/ordenes/o1");
  });
});
