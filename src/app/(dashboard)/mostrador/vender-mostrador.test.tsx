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
}));
vi.mock("@/app/actions/cliente-actions", () => ({ createClienteAction: vi.fn() }));

import type { RepuestoMostrador } from "@/app/actions/venta-mostrador-actions";
import { VenderMostrador } from "./vender-mostrador";

const REPUESTOS: RepuestoMostrador[] = [
  { id: "r1", codigo: "FLT-001", nombre: "Filtro de aceite", precioVenta: 100000, stockActual: 4, disponible: 3 },
];

const textoPesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

function pintar(rol: "ADMIN" | "RECEPCION" = "RECEPCION") {
  render(
    <VenderMostrador
      efectivoBloqueado={false}
      rol={rol}
      descuentoMaxRecepcion={10}
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
    mockCrear.mockReset().mockResolvedValue({ error: null, success: true, numero: 9 });
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

  it("cobra con descuento: manda líneas, pagos, descuento en pesos y lo recibido; al cobrar vacía el carrito", async () => {
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
    expect(datos.get("recibidoEfectivo")).toBe("120000");
    expect(datos.get("clienteId")).toBeNull();

    expect(await screen.findByText("Venta #9 registrada.")).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: "Filtro de aceite" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Descuento")).toHaveValue(null);
    await waitFor(() => expect(screen.getByLabelText("Buscar repuesto")).toHaveFocus());
  });

  it("si el servidor responde un error, el carrito no se vacía", async () => {
    mockCrear.mockResolvedValue({ error: 'No hay stock suficiente de "Filtro de aceite"', success: false });
    pintar();
    await agregarFiltro();
    await userEvent.click(botonCobrar());

    expect(await screen.findByText('No hay stock suficiente de "Filtro de aceite"')).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Filtro de aceite" })).toBeInTheDocument();
  });

  it("RECEPCION ve su tope y no puede cobrar con un descuento mayor", async () => {
    pintar();
    await agregarFiltro();
    expect(screen.getByText("Máximo 10 %")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Descuento"), "15");
    expect(screen.getAllByText("Tu descuento máximo es 10 %").length).toBeGreaterThan(0);
    expect(botonCobrar()).toBeDisabled();
  });

  it("ADMIN no tiene tope", async () => {
    pintar("ADMIN");
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
});
