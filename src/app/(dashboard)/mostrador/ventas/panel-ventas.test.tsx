import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockListar = vi.fn();
const mockObtener = vi.fn();
const mockCobrar = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  listarVentasMostradorAction: (...args: unknown[]) => mockListar(...args),
  obtenerVentaMostradorAction: (...args: unknown[]) => mockObtener(...args),
  cobrarVentaMostradorAction: (...args: unknown[]) => mockCobrar(...args),
  enviarComprobanteCorreoAction: vi.fn(),
}));
const mockDevolver = vi.fn();
vi.mock("@/app/actions/devolucion-mostrador-actions", () => ({
  crearDevolucionAction: (...args: unknown[]) => mockDevolver(...args),
}));

import type { ResumenVentasHoy, VentaMostradorFila } from "@/app/actions/venta-mostrador-actions";
import { PestanasMostrador } from "../pestanas-mostrador";
import { PanelVentas } from "./panel-ventas";

const RESUMEN: ResumenVentasHoy = {
  vendido: 119000,
  numeroVentas: 2,
  efectivo: 59500,
  porCobrar: 20000,
  ventasPorCobrar: 1,
  devuelto: 0,
};

function fila(cambios: Partial<VentaMostradorFila> = {}): VentaMostradorFila {
  return {
    id: "v1",
    numero: 7,
    createdAt: new Date("2026-10-17T15:00:00Z"),
    clienteNombre: null,
    subtotal: 50000,
    total: 59500,
    saldoPendiente: 0,
    totalDevuelto: 0,
    estado: "PAGADA",
    metodos: "Efectivo",
    items: [{ id: "i1", descripcion: "Filtro de aceite", cantidad: 2, devueltoCantidad: 0, precioUnitario: 25000 }],
    devolucion: { permitido: true, motivo: null },
    ...cambios,
  };
}

const PAGADA = fila();
const A_CREDITO = fila({
  id: "v2",
  numero: 8,
  clienteNombre: "Ana Gómez",
  saldoPendiente: 20000,
  estado: "A_CREDITO",
  metodos: "Efectivo",
  items: [
    { id: "i2", descripcion: "Bujía", cantidad: 4, devueltoCantidad: 0, precioUnitario: 10000 },
    { id: "i3", descripcion: "Aceite 20W50", cantidad: 1, devueltoCantidad: 0, precioUnitario: 9000 },
  ],
});

function pintar(ventasHoy: VentaMostradorFila[] = [PAGADA, A_CREDITO], ventaEnlazada: VentaMostradorFila | null = null) {
  render(<PanelVentas ventasHoy={ventasHoy} resumen={RESUMEN} ventaEnlazada={ventaEnlazada} />);
}

const filaDe = (numero: number) => screen.getByRole("row", { name: new RegExp(`#${numero}`) });

describe("PanelVentas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListar.mockResolvedValue({ ventas: [], error: null });
    mockObtener.mockResolvedValue(null);
    mockCobrar.mockResolvedValue({ error: null, success: true, numero: 8 });
  });

  it("muestra los KPI del día en una fila y las ventas con su estado y productos resumidos", () => {
    pintar();

    expect(screen.getByText("Vendido hoy")).toBeInTheDocument();
    expect(screen.getByText("Nº ventas")).toBeInTheDocument();
    expect(screen.getByText("Efectivo por mostrador")).toBeInTheDocument();
    expect(screen.getByText("Por cobrar")).toBeInTheDocument();
    expect(screen.getByText("Devuelto hoy")).toBeInTheDocument();

    expect(within(filaDe(7)).getByText("Pagada")).toBeInTheDocument();
    expect(within(filaDe(7)).getByText("Consumidor final")).toBeInTheDocument();
    expect(within(filaDe(8)).getByText("A crédito")).toBeInTheDocument();
    expect(within(filaDe(8)).getByText("Bujía ×4, +1 más")).toBeInTheDocument();
  });

  it("busca por número, cliente o producto", async () => {
    pintar();
    const buscar = screen.getByLabelText("Buscar ventas");

    await userEvent.type(buscar, "aceite 20");
    expect(screen.queryByRole("row", { name: /#7/ })).not.toBeInTheDocument();
    expect(filaDe(8)).toBeInTheDocument();

    await userEvent.clear(buscar);
    await userEvent.type(buscar, "#7");
    expect(filaDe(7)).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /#8/ })).not.toBeInTheDocument();

    await userEvent.clear(buscar);
    await userEvent.type(buscar, "ana");
    expect(filaDe(8)).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /#7/ })).not.toBeInTheDocument();
  });

  it("Ayer y Últimos 30 días piden las ventas de ese rango al servidor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T20:00:00Z"));
    try {
      mockListar.mockResolvedValue({ ventas: [fila({ id: "v0", numero: 3, createdAt: new Date("2026-10-16T15:00:00Z") })], error: null });
      pintar();

      await userEvent.click(screen.getByRole("button", { name: "Ayer" }));
      expect(mockListar).toHaveBeenLastCalledWith({ desde: "2026-10-16", hasta: "2026-10-16" });
      expect(await screen.findByRole("row", { name: /#3/ })).toBeInTheDocument();
      expect(screen.queryByRole("row", { name: /#7/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Últimos 30 días" }));
      expect(mockListar).toHaveBeenLastCalledWith({ desde: "2026-09-17", hasta: "2026-10-17" });

      // Hoy vuelve a lo que mandó el servidor sin pedir nada.
      mockListar.mockClear();
      await userEvent.click(screen.getByRole("button", { name: "Hoy" }));
      expect(mockListar).not.toHaveBeenCalled();
      expect(filaDe(7)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Cobrar saldo abre el panel lateral con el cobro de esa venta", async () => {
    pintar();
    expect(within(filaDe(7)).queryByRole("button", { name: /Cobrar saldo/ })).not.toBeInTheDocument();

    await userEvent.click(within(filaDe(8)).getByRole("button", { name: "Cobrar saldo de la venta #8" }));

    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveTextContent("Cobrar saldo de la venta #8");
    expect(within(panel).getByLabelText("Monto")).toHaveValue(20000);
    await userEvent.click(within(panel).getByRole("button", { name: "Cobrar" }));
    await waitFor(() => expect(mockCobrar).toHaveBeenCalledTimes(1));
    expect(mockCobrar.mock.calls[0]![0]).toBe("v2");
  });

  it("Devolver abre la devolución; si no se puede, el botón está apagado con el motivo", async () => {
    const vieja = fila({
      id: "v3",
      numero: 9,
      devolucion: { permitido: false, motivo: "Esta venta es de una caja ya cerrada: solo un administrador puede devolverla" },
    });
    pintar([PAGADA, vieja]);

    const bloqueado = within(filaDe(9)).getByRole("button", { name: "Devolver de la venta #9" });
    expect(bloqueado).toBeDisabled();
    expect(bloqueado).toHaveAttribute("title", expect.stringContaining("caja ya cerrada"));

    await userEvent.click(within(filaDe(7)).getByRole("button", { name: "Devolver de la venta #7" }));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByLabelText("Cantidad a devolver de Filtro de aceite")).toBeInTheDocument();
  });

  it("una venta devuelta del todo no ofrece Devolver", () => {
    pintar([
      fila({
        estado: "DEVUELTA",
        items: [{ id: "i1", descripcion: "Filtro de aceite", cantidad: 2, devueltoCantidad: 2, precioUnitario: 25000 }],
      }),
    ]);

    expect(within(filaDe(7)).getByText("Devuelta")).toBeInTheDocument();
    expect(within(filaDe(7)).queryByRole("button", { name: /Devolver/ })).not.toBeInTheDocument();
    expect(within(filaDe(7)).getByRole("link", { name: /Imprimir/ })).toHaveAttribute(
      "href",
      "/mostrador/v1/comprobante?imprimir=1",
    );
  });

  it("el enlace ?venta= abre el cobro aunque la venta no sea de hoy", async () => {
    const vieja = fila({ id: "v5", numero: 2, saldoPendiente: 15000, estado: "A_CREDITO", devolucion: { permitido: false, motivo: "x" } });
    render(
      <PestanasMostrador
        inicial="ventas"
        ventasHoy={2}
        solicitudInicial={{ ventaId: "v5", accion: "cobrar", clave: 0 }}
        vender={<p>Vender</p>}
        ventas={<PanelVentas ventasHoy={[PAGADA]} resumen={RESUMEN} ventaEnlazada={vieja} />}
      />,
    );

    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveTextContent("Cobrar saldo de la venta #2");
    expect(within(panel).getByLabelText("Monto")).toHaveValue(15000);
  });

  it("una venta pedida que no está cargada se trae del servidor", async () => {
    mockObtener.mockResolvedValue(fila({ id: "v9", numero: 12 }));
    render(
      <PestanasMostrador
        inicial="ventas"
        ventasHoy={1}
        solicitudInicial={{ ventaId: "v9", accion: "devolver", clave: 0 }}
        vender={<p>Vender</p>}
        ventas={<PanelVentas ventasHoy={[PAGADA]} resumen={RESUMEN} ventaEnlazada={null} />}
      />,
    );

    expect(mockObtener).toHaveBeenCalledWith("v9");
    const panel = await screen.findByRole("dialog");
    await waitFor(() => expect(panel).toHaveTextContent("Devolver de la venta #12"));
  });
});
