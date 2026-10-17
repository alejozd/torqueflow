import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrear = vi.fn();
const mockBuscar = vi.fn();
const mockBuscarCliente = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  crearVentaMostradorAction: (...args: unknown[]) => mockCrear(...args),
  buscarParaMostradorAction: (...args: unknown[]) => mockBuscar(...args),
  buscarClientesMostradorAction: (...args: unknown[]) => mockBuscarCliente(...args),
  enviarComprobanteCorreoAction: vi.fn(),
}));

/** Lo que responde el servidor al cobrar bien (tarea 7: datos de la tarjeta de venta cobrada). */
const VENTA_OK = {
  error: null,
  success: true,
  numero: 9,
  ventaId: "v9",
  total: 113050,
  pagos: [{ metodoPago: "EFECTIVO", monto: 113050 }],
  vueltas: 6950,
  saldoPendiente: 0,
  cliente: null,
  urlWhatsapp: null,
};
vi.mock("@/app/actions/cliente-actions", () => ({ createClienteAction: vi.fn() }));

import type { RepuestoMostrador } from "@/app/actions/venta-mostrador-actions";
import { PestanasMostrador } from "./pestanas-mostrador";
import { VenderMostrador } from "./vender-mostrador";

const REPUESTOS: RepuestoMostrador[] = [
  { id: "r1", codigo: "FLT-001", nombre: "Filtro de aceite", precioVenta: 100000, stockActual: 4, disponible: 3 },
];

const textoPesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

function pintar(topeDescuento: number | null = 10) {
  render(
    <VenderMostrador
      efectivoBloqueado={false}
      topeDescuento={topeDescuento}
    />,
  );
}

async function agregarFiltro() {
  await userEvent.type(screen.getByLabelText("Buscar repuesto"), "Filtro");
  await userEvent.click(await screen.findByRole("option", { name: /Filtro de aceite/ }));
}

const botonCobrar = () => screen.getByRole("button", { name: /^Cobrar \$/ });

describe("VenderMostrador", () => {
  beforeEach(() => {
    mockCrear.mockReset().mockResolvedValue(VENTA_OK);
    mockBuscarCliente
      .mockReset()
      .mockResolvedValue([
        { id: "c1", nombre: "Ana Pérez", documento: "123", telefono: null, placas: [], saldoMostrador: 0 },
      ]);
    mockBuscar
      .mockReset()
      .mockImplementation(async (q: string) =>
        REPUESTOS.filter((r) => r.nombre.toLowerCase().includes(q.trim().toLowerCase())).map((r) => ({ ...r, exacto: false })),
      );
  });

  it("vacío: Consumidor final, total en cero y Cobrar deshabilitado con su motivo", () => {
    pintar();
    expect(screen.getByTestId("cliente-actual")).toHaveTextContent("Consumidor final");
    expect(screen.getByTestId("total-resumen")).toHaveTextContent(textoPesos(0));
    expect(botonCobrar()).toBeDisabled();
    expect(screen.getByText("Agrega al menos un producto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dejar a crédito" })).not.toBeInTheDocument();
  });

  it("cobra con descuento: manda líneas, pagos, descuento en pesos y lo recibido; al cobrar sale la tarjeta de venta cobrada", async () => {
    pintar();
    await agregarFiltro();
    await userEvent.type(screen.getByLabelText("Descuento"), "5");
    // 100.000 − 5 % = 95.000 + IVA 19 % = 113.050
    expect(screen.getByTestId("total-resumen")).toHaveTextContent(textoPesos(113050));

    await userEvent.type(screen.getByLabelText("Recibido"), "120000");
    await userEvent.click(botonCobrar());

    await waitFor(() => expect(mockCrear).toHaveBeenCalled());
    const datos = mockCrear.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(datos.get("lineas")))).toEqual([
      { repuestoId: "r1", descripcion: "Filtro de aceite", cantidad: 1, precioUnitario: 100000 },
    ]);
    expect(JSON.parse(String(datos.get("pagos")))).toEqual([{ metodoPago: "EFECTIVO", monto: 113050 }]);
    expect(datos.get("descuento")).toBe("5000");
    expect(datos.get("totalEsperado")).toBe("113050");
    expect(datos.get("recibidoEfectivo")).toBe("120000");
    expect(datos.get("clienteId")).toBeNull();

    // El carrito se reemplaza por la tarjeta de éxito, con el foco en "Nueva venta".
    const tarjeta = await screen.findByRole("status", { name: "Venta #9 cobrada" });
    expect(tarjeta).toHaveTextContent(`Consumidor final · ${textoPesos(113050)} · Efectivo · Vueltas ${textoPesos(6950)}`);
    expect(screen.queryByRole("row", { name: "Filtro de aceite" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Buscar repuesto")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Descuento")).toHaveValue(null);
    await waitFor(() => expect(screen.getByRole("button", { name: "Nueva venta" })).toHaveFocus());
  });

  it("Enter en la venta cobrada arranca una venta limpia con el foco en el buscador", async () => {
    mockCrear.mockResolvedValue({ ...VENTA_OK, cliente: { nombre: "Ana Pérez", correo: null } });
    pintar();
    await agregarFiltro();
    await userEvent.type(screen.getByLabelText("Buscar cliente"), "ana");
    await userEvent.click(await screen.findByRole("option", { name: /Ana Pérez/ }));
    await userEvent.type(screen.getByLabelText("Recibido"), "200000");
    await userEvent.click(botonCobrar());
    await waitFor(() => expect(screen.getByRole("button", { name: "Nueva venta" })).toHaveFocus());

    await userEvent.keyboard("{Enter}");

    expect(screen.queryByRole("status", { name: /Venta #9/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Buscar repuesto")).toHaveFocus());
    expect(screen.getByTestId("cliente-actual")).toHaveTextContent("Consumidor final");
    expect(screen.queryByRole("row", { name: "Filtro de aceite" })).not.toBeInTheDocument();
  });

  it("si el servidor responde stock insuficiente, el carrito no se vacía y la fila se marca", async () => {
    mockCrear.mockResolvedValue({
      error: 'No hay stock suficiente de "Filtro de aceite"',
      success: false,
      repuestosSinStock: ["r1"],
    });
    pintar();
    await agregarFiltro();
    expect(screen.getByRole("row", { name: "Filtro de aceite" })).not.toHaveAttribute("data-sin-stock");
    await userEvent.click(botonCobrar());

    expect(await screen.findByText('No hay stock suficiente de "Filtro de aceite"')).toBeInTheDocument();
    const fila = screen.getByRole("row", { name: "Filtro de aceite" });
    expect(fila).toHaveAttribute("data-sin-stock", "true");
    expect(fila).toHaveAttribute("aria-invalid", "true");
    expect(fila).toHaveTextContent("Ya no hay stock suficiente");
  });

  it("la marca de stock se va al cambiar la cantidad y no vuelve al dejarla igual", async () => {
    mockCrear.mockResolvedValue({ error: "Sin stock", success: false, repuestosSinStock: ["r1"] });
    pintar();
    await agregarFiltro();
    await userEvent.click(botonCobrar());
    await screen.findByText("Sin stock");
    expect(screen.getByRole("row", { name: "Filtro de aceite" })).toHaveAttribute("data-sin-stock", "true");

    await userEvent.click(screen.getByRole("button", { name: "Más Filtro de aceite" }));
    expect(screen.getByRole("row", { name: "Filtro de aceite" })).not.toHaveAttribute("data-sin-stock");
    await userEvent.click(screen.getByRole("button", { name: "Menos Filtro de aceite" }));
    expect(screen.getByRole("row", { name: "Filtro de aceite" })).not.toHaveAttribute("data-sin-stock");
  });

  it("la marca de stock se va al quitar la fila y no vuelve al agregarla de nuevo", async () => {
    mockCrear.mockResolvedValue({ error: "Sin stock", success: false, repuestosSinStock: ["r1"] });
    pintar();
    await agregarFiltro();
    await userEvent.click(botonCobrar());
    await screen.findByText("Sin stock");

    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro de aceite" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    expect(screen.queryByRole("row", { name: "Filtro de aceite" })).not.toBeInTheDocument();
    await agregarFiltro();
    expect(screen.getByRole("row", { name: "Filtro de aceite" })).not.toHaveAttribute("data-sin-stock");
  });

  it("si el éxito llega sin id o número de venta no inventa la tarjeta", async () => {
    mockCrear.mockResolvedValue({ error: null, success: true, numero: 9 });
    pintar();
    await agregarFiltro();
    await userEvent.click(botonCobrar());

    await waitFor(() => expect(screen.queryByRole("row", { name: "Filtro de aceite" })).not.toBeInTheDocument());
    expect(screen.queryByRole("status", { name: /Venta #/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Buscar repuesto")).toBeInTheDocument();
  });

  it("el Cobrar de la barra angosta lleva al cobro sin cambiar el método elegido", async () => {
    pintar();
    await agregarFiltro();
    await userEvent.click(screen.getByRole("button", { name: "Tarjeta" }));
    await userEvent.click(screen.getByRole("button", { name: "Cobrar" }));

    expect(screen.getByRole("button", { name: "Tarjeta" })).toHaveAttribute("aria-pressed", "true");
    expect(botonCobrar()).toHaveFocus();
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it("RECEPCION ve su tope y no puede cobrar con un descuento mayor", async () => {
    pintar();
    await agregarFiltro();
    expect(screen.getByText("Máximo 10 %")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Descuento"), "15");
    expect(screen.getAllByText("Tu descuento máximo es 10 %").length).toBeGreaterThan(0);
    expect(botonCobrar()).toBeDisabled();
  });

  it("sin tope (descuento sin tope)", async () => {
    pintar(null);
    await agregarFiltro();
    expect(screen.queryByText(/Máximo/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Descuento"), "15");
    expect(botonCobrar()).toBeEnabled();
  });

  it("la tecla ? fuera de un campo muestra la lista de atajos", async () => {
    pintar();
    await userEvent.click(document.body);
    await userEvent.keyboard("?");
    expect(await screen.findByRole("dialog", { name: "Atajos de teclado" })).toHaveTextContent("F9 o Ctrl+Enter");
  });

  it("con cliente elegido manda clienteId; al quitarlo, la marca de crédito no vuelve al elegir otro", async () => {
    pintar();
    await agregarFiltro();
    await userEvent.type(screen.getByLabelText("Buscar cliente"), "ana");
    await userEvent.click(await screen.findByRole("option", { name: /Ana Pérez/ }));
    await userEvent.click(screen.getByRole("button", { name: "Dejar a crédito" }));
    expect(screen.getByRole("button", { name: "Registrar a crédito" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Quitar cliente/ }));
    await userEvent.type(screen.getByLabelText("Buscar cliente"), "ana");
    await userEvent.click(await screen.findByRole("option", { name: /Ana Pérez/ }));
    expect(screen.queryByRole("button", { name: "Registrar a crédito" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Recibido"), "200000");
    await userEvent.click(botonCobrar());
    await waitFor(() => expect(mockCrear).toHaveBeenCalled());
    expect((mockCrear.mock.calls[0][1] as FormData).get("clienteId")).toBe("c1");
  });

  it("F2 lleva el foco al buscador de cliente", async () => {
    pintar();
    await userEvent.keyboard("{F2}");
    await waitFor(() => expect(screen.getByLabelText("Buscar cliente")).toHaveFocus());
  });

  it("con la pestaña Ventas a la vista los atajos de vender no toman teclas", async () => {
    render(
      <PestanasMostrador
        inicial="ventas"
        ventasHoy={0}
        vender={<VenderMostrador efectivoBloqueado={false} topeDescuento={10} />}
        ventas={<p>Panel de ventas</p>}
      />,
    );

    await userEvent.keyboard("{F2}");
    await userEvent.click(document.body);
    await userEvent.keyboard("?");

    expect(screen.getByLabelText("Buscar cliente")).not.toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Atajos de teclado" })).not.toBeInTheDocument();

    // De vuelta en Vender, los atajos vuelven a funcionar.
    await userEvent.click(screen.getByRole("tab", { name: "Vender" }));
    await userEvent.keyboard("{F2}");
    await waitFor(() => expect(screen.getByLabelText("Buscar cliente")).toHaveFocus());
  });

  it("\"Devolver algo de esta venta\" lleva a la pestaña Ventas", async () => {
    mockCrear.mockResolvedValue(VENTA_OK);
    render(
      <PestanasMostrador
        inicial="vender"
        ventasHoy={0}
        vender={<VenderMostrador efectivoBloqueado={false} topeDescuento={10} />}
        ventas={<p>Panel de ventas</p>}
      />,
    );
    await agregarFiltro();
    await userEvent.type(screen.getByLabelText("Recibido"), "200000");
    await userEvent.click(botonCobrar());

    await userEvent.click(await screen.findByRole("button", { name: "Devolver algo de esta venta" }));

    expect(screen.getByRole("tab", { name: /Ventas/ })).toHaveAttribute("aria-selected", "true");
    // Enter ya no es "nueva venta": la tarjeta sigue ahí.
    await userEvent.click(document.body);
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("status", { name: /Venta #9/, hidden: true })).toBeInTheDocument();
  });
});
