import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockEnviarCorreo = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  enviarComprobanteCorreoAction: (...args: unknown[]) => mockEnviarCorreo(...args),
}));
const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

import { VentaCobrada, urlComprobante, type VentaCobradaDatos } from "./venta-cobrada";

const textoPesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

const VENTA: VentaCobradaDatos = {
  ventaId: "v1",
  numero: 1043,
  total: 260015,
  pagos: [{ metodoPago: "EFECTIVO", monto: 260015 }],
  vueltas: 39985,
  saldoPendiente: 0,
  cliente: null,
  urlWhatsapp: null,
};

function pintar(cambios: Partial<VentaCobradaDatos> = {}) {
  const onNuevaVenta = vi.fn();
  render(<VentaCobrada venta={{ ...VENTA, ...cambios }} onNuevaVenta={onNuevaVenta} />);
  return { onNuevaVenta };
}

describe("VentaCobrada", () => {
  beforeEach(() => {
    mockEnviarCorreo.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    window.open = vi.fn() as unknown as typeof window.open;
  });

  it("dice número, total, métodos y vueltas; Consumidor final sin cliente", () => {
    pintar();
    expect(screen.getByText(/cobrada/)).toHaveTextContent("Venta #1043 cobrada");
    expect(screen.getByTestId("detalle-venta")).toHaveTextContent(
      `Consumidor final · ${textoPesos(260015)} · Efectivo · Vueltas ${textoPesos(39985)}`,
    );
  });

  it("pago mixto sin vueltas y con saldo: lista los métodos y lo que queda debiendo", () => {
    pintar({
      pagos: [
        { metodoPago: "EFECTIVO", monto: 100000 },
        { metodoPago: "TARJETA", monto: 60015 },
      ],
      vueltas: 0,
      saldoPendiente: 100000,
      cliente: { nombre: "Ana Gómez", correo: null },
    });
    expect(screen.getByText(/registrada/)).toHaveTextContent("Venta #1043 registrada");
    const detalle = screen.getByTestId("detalle-venta");
    expect(detalle).toHaveTextContent(`Ana Gómez · ${textoPesos(260015)} · Efectivo + Tarjeta · Queda debiendo ${textoPesos(100000)}`);
    expect(detalle).not.toHaveTextContent("Vueltas");
  });

  it("Imprimir abre el comprobante; sin teléfono ni correo no ofrece WhatsApp ni correo", () => {
    pintar();
    expect(screen.getByRole("link", { name: "Imprimir comprobante" })).toHaveAttribute(
      "href",
      "/mostrador/v1/comprobante?imprimir=1",
    );
    expect(screen.queryByRole("link", { name: "Enviar por WhatsApp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar por correo" })).not.toBeInTheDocument();
  });

  it("con teléfono ofrece WhatsApp (wa.me) y con correo ofrece el envío por correo", () => {
    pintar({
      cliente: { nombre: "Ana Gómez", correo: "ana@correo.co" },
      urlWhatsapp: "https://wa.me/573105551234?text=hola",
    });
    const whatsapp = screen.getByRole("link", { name: "Enviar por WhatsApp" });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/573105551234?text=hola");
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "Enviar por correo" })).toBeInTheDocument();
  });

  it("Enviar por correo llama a la acción y avisa el resultado", async () => {
    mockEnviarCorreo.mockResolvedValueOnce({ error: null, success: true });
    pintar({ cliente: { nombre: "Ana Gómez", correo: "ana@correo.co" } });

    await userEvent.click(screen.getByRole("button", { name: "Enviar por correo" }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith("Comprobante enviado a ana@correo.co"));
    expect(mockEnviarCorreo).toHaveBeenCalledWith("v1");

    mockEnviarCorreo.mockResolvedValueOnce({ error: "Sin SMTP", success: false });
    await userEvent.click(screen.getByRole("button", { name: "Enviar por correo" }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Sin SMTP"));
  });

  it("Nueva venta arranca con el foco: Enter la dispara", async () => {
    const { onNuevaVenta } = pintar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Nueva venta" })).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    expect(onNuevaVenta).toHaveBeenCalledTimes(1);
  });

  it("Enter fuera de un botón también es nueva venta", async () => {
    const { onNuevaVenta } = pintar();
    await userEvent.click(document.body);
    await userEvent.keyboard("{Enter}");
    expect(onNuevaVenta).toHaveBeenCalledTimes(1);
  });

  it("P (fuera de un campo) imprime el comprobante", async () => {
    pintar();
    await userEvent.click(document.body);
    await userEvent.keyboard("p");
    expect(window.open).toHaveBeenCalledWith("/mostrador/v1/comprobante?imprimir=1", "_blank", "noopener");
  });

  it("P escribiendo en un campo no imprime", async () => {
    render(
      <>
        <input aria-label="Nota" />
        <VentaCobrada venta={VENTA} onNuevaVenta={vi.fn()} />
      </>,
    );
    await userEvent.type(screen.getByLabelText("Nota"), "p");
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe("urlComprobante", () => {
  it("sin impresión es la ruta sola y nunca lleva vueltas", () => {
    expect(urlComprobante({ ventaId: "v9" })).toBe("/mostrador/v9/comprobante");
  });
});
