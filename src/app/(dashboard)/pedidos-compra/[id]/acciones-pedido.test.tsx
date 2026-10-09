import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockEnviarEmail = vi.fn();
const mockRegistrarWhatsapp = vi.fn();
const mockCancelar = vi.fn();
const mockRecibir = vi.fn();
vi.mock("@/app/actions/pedido-compra-actions", () => ({
  enviarPedidoCompraEmailAction: (...args: unknown[]) => mockEnviarEmail(...args),
  registrarEnvioWhatsappPedidoAction: (...args: unknown[]) => mockRegistrarWhatsapp(...args),
  cancelarPedidoCompraAction: (...args: unknown[]) => mockCancelar(...args),
  recibirPedidoCompraAction: (...args: unknown[]) => mockRecibir(...args),
}));

import { AccionesPedido } from "./acciones-pedido";

const items = [
  { id: "i1", codigo: "FLT-001", nombre: "Filtro", cantidad: 6 },
  { id: "i2", codigo: "BJ-4", nombre: "Bujía", cantidad: 4 },
];

function renderAcciones(overrides: Partial<Parameters<typeof AccionesPedido>[0]> = {}) {
  return render(
    <AccionesPedido
      pedidoId="pc1"
      numero={7}
      permitidas={{ enviar: true, recibir: true, cancelar: true }}
      proveedorTieneEmail
      urlWhatsapp="https://wa.me/573105550142?text=hola"
      items={items}
      {...overrides}
    />,
  );
}

describe("AccionesPedido", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockEnviarEmail.mockReset().mockResolvedValue({ error: null });
    mockRegistrarWhatsapp.mockReset().mockResolvedValue({ error: null });
    mockCancelar.mockReset().mockResolvedValue({ error: null });
    mockRecibir.mockReset().mockResolvedValue({ error: null, entradaId: "e1" });
  });

  it("opens wa.me in the click handler and then records the send", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderAcciones();

    await userEvent.click(screen.getByRole("button", { name: /Enviar por WhatsApp/ }));

    expect(open).toHaveBeenCalledWith("https://wa.me/573105550142?text=hola", "_blank", "noopener");
    await vi.waitFor(() => expect(mockRegistrarWhatsapp).toHaveBeenCalledWith("pc1"));
  });

  it("disables each channel when the proveedor lacks that contact", () => {
    renderAcciones({ proveedorTieneEmail: false, urlWhatsapp: null });
    expect(screen.getByRole("button", { name: /Enviar por correo/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Enviar por WhatsApp/ })).toBeDisabled();
  });

  it("receives with the adjusted quantities and goes to the new entrada", async () => {
    renderAcciones();

    await userEvent.click(screen.getByRole("button", { name: /Recibir mercancía/ }));
    const bujia = await screen.findByLabelText(/Bujía/);
    await userEvent.clear(bujia);
    await userEvent.type(bujia, "0");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar recepción" }));

    await vi.waitFor(() =>
      expect(mockRecibir).toHaveBeenCalledWith("pc1", [
        { itemId: "i1", cantidad: 6 },
        { itemId: "i2", cantidad: 0 },
      ]),
    );
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith("/entradas-mercancia/e1"));
  });

  it("asks for confirmation before cancelling", async () => {
    renderAcciones();

    await userEvent.click(screen.getByRole("button", { name: /Cancelar pedido/ }));
    expect(mockCancelar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));

    await vi.waitFor(() => expect(mockCancelar).toHaveBeenCalledWith("pc1"));
  });

  it("renders nothing for a closed pedido", () => {
    const { container } = renderAcciones({ permitidas: { enviar: false, recibir: false, cancelar: false } });
    expect(container).toBeEmptyDOMElement();
  });
});
