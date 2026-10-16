import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrear = vi.fn();
const mockBuscar = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  crearVentaMostradorAction: (...args: unknown[]) => mockCrear(...args),
  buscarParaMostradorAction: (...args: unknown[]) => mockBuscar(...args),
}));

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
      clientes={[{ id: "c1", nombre: "Ana Pérez" }]}
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
});
