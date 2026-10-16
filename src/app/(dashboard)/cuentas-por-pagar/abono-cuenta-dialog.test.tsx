import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAbonar = vi.fn();
vi.mock("@/app/actions/cuenta-por-pagar-actions", () => ({
  abonarCuentaPorPagarAction: (...args: unknown[]) => mockAbonar(...args),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { AbonoCuentaDialog, type CuentaAbono } from "./abono-cuenta-dialog";

const pesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

const PIRELLI: CuentaAbono = {
  cuentaId: "c1",
  proveedorNombre: "Pirelli",
  entradaId: "e1",
  fechaTexto: "4 sept 2026",
  referencias: 3,
  total: 5073557,
  pagado: 200000,
  saldo: 4873557,
};

function pintar(props: Partial<Parameters<typeof AbonoCuentaDialog>[0]> = {}) {
  render(<AbonoCuentaDialog cuenta={PIRELLI} open onOpenChange={vi.fn()} {...props} />);
}

const campoMonto = () => screen.getByLabelText("¿Cuánto vas a pagar?");
const botonConfirmar = () => screen.getByRole("button", { name: /^(Escribe el monto|Registrar abono|Pagar todo:)/ });

describe("AbonoCuentaDialog", () => {
  beforeEach(() => {
    mockAbonar.mockReset();
    mockAbonar.mockResolvedValue({ error: null, success: true });
  });

  it("abre con el resumen de la entrada y el monto vacío: no se puede enviar", async () => {
    pintar();

    expect(await screen.findByRole("dialog", { name: "Abonar a Pirelli" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver entrada/ })).toHaveAttribute("href", "/entradas-mercancia/e1");
    expect(campoMonto()).toHaveValue("");
    expect(botonConfirmar()).toHaveTextContent("Escribe el monto");
    expect(botonConfirmar()).toBeDisabled();
  });

  it("escribe con separador de miles y el botón dice la cifra; envía el número limpio", async () => {
    pintar();
    await userEvent.type(campoMonto(), "200000");

    expect(campoMonto()).toHaveValue("200.000");
    expect(botonConfirmar()).toHaveTextContent(`Registrar abono de ${pesos(200000)}`);
    expect(screen.getByText(/le quedarás debiendo/)).toHaveTextContent(pesos(4673557));

    await userEvent.type(screen.getByLabelText(/Referencia/), "004581233");
    await userEvent.click(botonConfirmar());
    await waitFor(() => expect(mockAbonar).toHaveBeenCalledTimes(1));
    const [cuentaId, , formData] = mockAbonar.mock.calls[0] as [string, unknown, FormData];
    expect(cuentaId).toBe("c1");
    expect(formData.get("monto")).toBe("200000");
    expect(formData.get("metodoPago")).toBe("TRANSFERENCIA");
    expect(formData.get("referencia")).toBe("004581233");
  });

  it("los botones rápidos llenan el monto: la mitad y pagar todo", async () => {
    pintar();
    await userEvent.click(screen.getByRole("button", { name: /La mitad/ }));
    expect(campoMonto()).toHaveValue("2.436.779");
    expect(screen.getByRole("button", { name: /La mitad/ })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: /Pagar todo ·/ }));
    expect(campoMonto()).toHaveValue("4.873.557");
    expect(botonConfirmar()).toHaveTextContent(`Pagar todo: ${pesos(4873557)}`);
    expect(screen.getByText(/la entrada queda pagada/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Otro valor" }));
    expect(campoMonto()).toHaveValue("");
    expect(campoMonto()).toHaveFocus();
  });

  it("el método se elige con botones segmentados; en efectivo avisa que sale de la caja", async () => {
    pintar();
    const efectivo = screen.getByRole("button", { name: "Efectivo" });
    expect(screen.getByRole("button", { name: "Transferencia" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(efectivo);
    expect(efectivo).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/El dinero sale de la caja abierta/)).toBeInTheDocument();
  });
});
