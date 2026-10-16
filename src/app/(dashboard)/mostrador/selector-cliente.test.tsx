import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockBuscar = vi.fn();
vi.mock("@/app/actions/venta-mostrador-actions", () => ({
  buscarClientesMostradorAction: (...args: unknown[]) => mockBuscar(...args),
}));
const mockCrear = vi.fn();
vi.mock("@/app/actions/cliente-actions", () => ({
  createClienteAction: (...args: unknown[]) => mockCrear(...args),
}));

import type { ClienteMostrador } from "@/app/actions/venta-mostrador-actions";
import { SelectorCliente } from "./selector-cliente";
import { useAtajosMostrador } from "./use-atajos-mostrador";

const ANA: ClienteMostrador = {
  id: "c1",
  nombre: "Ana Pérez",
  documento: "1020304050",
  telefono: "3001112233",
  placas: ["JKT482"],
  saldoMostrador: 45000,
};

function Arnes({ inicial = null }: { inicial?: ClienteMostrador | null }) {
  const [cliente, setCliente] = useState<ClienteMostrador | null>(inicial);
  const ref = useRef<HTMLInputElement>(null);
  useAtajosMostrador({
    focusBuscador: () => {},
    irACobrar: () => {},
    descuento: () => {},
    buscarCliente: () => ref.current?.focus(),
  });
  return <SelectorCliente cliente={cliente} onCambiar={setCliente} inputRef={ref} />;
}

describe("SelectorCliente", () => {
  beforeEach(() => {
    mockBuscar.mockReset().mockResolvedValue([ANA]);
    mockCrear.mockReset();
  });

  it("arranca como Consumidor final", () => {
    render(<Arnes />);
    expect(screen.getByTestId("cliente-actual")).toHaveTextContent("Consumidor final");
    expect(screen.queryByRole("button", { name: /Quitar cliente/ })).not.toBeInTheDocument();
  });

  it("busca en el servidor, elige y muestra la tarjeta con documento, teléfono y saldo en ámbar", async () => {
    render(<Arnes />);
    await userEvent.type(screen.getByLabelText("Buscar cliente"), "jkt");
    await userEvent.click(await screen.findByRole("option", { name: /Ana Pérez/ }));

    expect(mockBuscar).toHaveBeenLastCalledWith("jkt");
    const tarjeta = screen.getByTestId("cliente-actual");
    expect(tarjeta).toHaveTextContent("Ana Pérez");
    expect(tarjeta).toHaveTextContent("Doc. 1020304050");
    expect(tarjeta).toHaveTextContent("3001112233");
    expect(screen.getByText(/Debe .*45\.000 en el mostrador/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribir por WhatsApp" })).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/573001112233"),
    );
  });

  it("sin saldo no muestra deuda", async () => {
    render(<Arnes inicial={{ ...ANA, saldoMostrador: 0 }} />);
    expect(screen.queryByText(/en el mostrador/)).not.toBeInTheDocument();
  });

  it("Quitar cliente vuelve a Consumidor final", async () => {
    render(<Arnes inicial={ANA} />);
    await userEvent.click(screen.getByRole("button", { name: /Quitar cliente/ }));
    expect(screen.getByTestId("cliente-actual")).toHaveTextContent("Consumidor final");
  });

  it("F2 enfoca el buscador de cliente", async () => {
    render(<Arnes />);
    await userEvent.click(document.body);
    await userEvent.keyboard("{F2}");
    await waitFor(() => expect(screen.getByLabelText("Buscar cliente")).toHaveFocus());
  });

  it("crear cliente rápido: manda nombre, teléfono y documento y deja al cliente elegido", async () => {
    mockCrear.mockResolvedValue({
      error: null,
      success: true,
      cliente: { id: "c9", nombre: "Luis Gómez", telefono: "3115556677", documento: "99887766" },
    });
    render(<Arnes />);
    await userEvent.click(screen.getByRole("button", { name: /Nuevo cliente/ }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Luis Gómez");
    await userEvent.type(screen.getByLabelText("Teléfono"), "3115556677");
    await userEvent.type(screen.getByLabelText("Documento"), "99887766");
    await userEvent.click(screen.getByRole("button", { name: "Crear y usar" }));

    await waitFor(() => expect(screen.getByTestId("cliente-actual")).toHaveTextContent("Luis Gómez"));
    const datos = mockCrear.mock.calls[0][1] as FormData;
    expect(datos.get("nombre")).toBe("Luis Gómez");
    expect(datos.get("telefono")).toBe("3115556677");
    expect(datos.get("documento")).toBe("99887766");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si la validación falla muestra el error y deja el diálogo abierto", async () => {
    mockCrear.mockResolvedValue({ error: "El nombre es obligatorio", success: false });
    render(<Arnes />);
    await userEvent.click(screen.getByRole("button", { name: /Nuevo cliente/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear y usar" }));

    expect(await screen.findByText("El nombre es obligatorio")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("cliente-actual")).toHaveTextContent("Consumidor final");
  });
});
