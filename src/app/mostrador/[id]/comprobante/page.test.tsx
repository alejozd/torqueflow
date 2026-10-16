import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ComprobanteVenta } from "@/lib/mostrador/comprobante";

const mockGetComprobante = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  getComprobanteVentaMostrador: (...args: unknown[]) => mockGetComprobante(...args),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import ComprobanteVentaPage from "./page";

const pesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n).replace(/\s/g, " ");

const VENTA: ComprobanteVenta = {
  id: "v1",
  tallerNombre: "Taller Pérez",
  sedeNombre: "Sede Norte",
  numero: 1043,
  fecha: new Date("2026-10-16T02:30:00.000Z"),
  cliente: { nombre: "Ana Gómez", documento: "1020", telefono: null, email: null },
  lineas: [{ id: "i1", descripcion: "Filtro de aceite", cantidad: 2, precioUnitario: 25000 }],
  subtotal: 50000,
  descuento: 5000,
  iva: 8550,
  total: 53550,
  pagos: [
    { metodoPago: "EFECTIVO", monto: 33550 },
    { metodoPago: "TARJETA", monto: 10000 },
  ],
  saldoPendiente: 10000,
};

async function pintar(consulta: Record<string, string> = {}, id = "v1") {
  return render(
    await ComprobanteVentaPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(consulta) }),
  );
}

const fila = (etiqueta: string) => screen.getByText(etiqueta).parentElement!;

describe("ComprobanteVentaPage", () => {
  beforeEach(() => {
    mockGetComprobante.mockReset().mockResolvedValue(VENTA);
    window.print = vi.fn();
  });

  it("muestra taller, sede, número, fecha y hora de Bogotá, cliente, líneas y totales", async () => {
    await pintar();

    expect(mockGetComprobante).toHaveBeenCalledWith("v1");
    expect(screen.getByRole("heading", { name: "Taller Pérez" })).toBeInTheDocument();
    expect(screen.getByText("Sede Norte")).toBeInTheDocument();
    expect(screen.getByText("Comprobante de venta #1043")).toBeInTheDocument();
    expect(screen.getByText(/15\/10\/2026, 9:30/)).toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("Filtro de aceite")).toBeInTheDocument();
    expect(within(tabla).getByText(pesos(50000))).toBeInTheDocument();
    expect(fila("Subtotal")).toHaveTextContent(pesos(50000));
    expect(fila("Descuento")).toHaveTextContent(pesos(5000));
    expect(fila("IVA")).toHaveTextContent(pesos(8550));
    expect(fila("Total")).toHaveTextContent(pesos(53550));
    expect(screen.getByText("Documento no válido como factura electrónica")).toBeInTheDocument();
  });

  it("lista los pagos por método y el saldo pendiente", async () => {
    await pintar();

    expect(fila("Efectivo")).toHaveTextContent(pesos(33550));
    expect(fila("Tarjeta")).toHaveTextContent(pesos(10000));
    expect(fila("Saldo pendiente")).toHaveTextContent(pesos(10000));
    expect(screen.queryByText("Vueltas")).not.toBeInTheDocument();
  });

  it("muestra lo recibido y las vueltas si llegan en la URL y hubo efectivo", async () => {
    await pintar({ vueltas: "6450" });

    expect(fila("Recibido en efectivo")).toHaveTextContent(pesos(40000));
    expect(fila("Vueltas")).toHaveTextContent(pesos(6450));
  });

  it("ignora vueltas inválidas o sin pago en efectivo", async () => {
    await pintar({ vueltas: "-5" });
    expect(screen.queryByText("Vueltas")).not.toBeInTheDocument();

    mockGetComprobante.mockResolvedValue({ ...VENTA, pagos: [{ metodoPago: "TARJETA", monto: 53550 }] });
    await pintar({ vueltas: "1000" });
    expect(screen.queryByText("Vueltas")).not.toBeInTheDocument();
  });

  it("sin cliente dice Consumidor final; sin pagos, a crédito; sin descuento ni saldo no los muestra", async () => {
    mockGetComprobante.mockResolvedValue({ ...VENTA, cliente: null, pagos: [], descuento: 0, saldoPendiente: 0 });
    await pintar();

    expect(screen.getByText("Consumidor final")).toBeInTheDocument();
    expect(fila("Forma de pago")).toHaveTextContent("A crédito");
    expect(screen.queryByText("Descuento")).not.toBeInTheDocument();
    expect(screen.queryByText("Saldo pendiente")).not.toBeInTheDocument();
  });

  it("el volver y el botón de imprimir no salen en la impresión; ?imprimir=1 imprime al cargar", async () => {
    const { container } = await pintar({ imprimir: "1" });

    expect(screen.getByRole("link", { name: "← Volver al mostrador" })).toHaveAttribute("href", "/mostrador");
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
    expect(container.querySelector(".print\\:hidden")).not.toBeNull();
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("sin ?imprimir no abre el diálogo solo", async () => {
    await pintar();
    expect(window.print).not.toHaveBeenCalled();
  });

  it("si la venta no es de la sede activa (o no existe), no hay página", async () => {
    mockGetComprobante.mockResolvedValue(null);
    await expect(pintar({}, "ajena")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
