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
  const onOtroAbono = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <AbonoCuentaDialog
      cuenta={PIRELLI}
      cajaAbierta
      open
      onOpenChange={onOpenChange}
      onOtroAbono={onOtroAbono}
      {...props}
    />,
  );
  return { onOtroAbono, onOpenChange };
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

  it("un monto mayor a lo que se debe muestra el error junto al campo y no deja enviar", async () => {
    pintar();
    await userEvent.type(campoMonto(), "5000000");

    expect(campoMonto()).toHaveAttribute("aria-invalid", "true");
    const error = screen.getByText(`No puedes abonar más de lo que se debe (${pesos(4873557)}).`);
    expect(campoMonto()).toHaveAttribute("aria-describedby", error.id);
    expect(botonConfirmar()).toBeDisabled();
  });

  it("efectivo con la caja cerrada: alerta con el enlace para abrirla y el botón desactivado", async () => {
    pintar({ cajaAbierta: false });
    await userEvent.click(screen.getByRole("button", { name: /Pagar todo ·/ }));
    expect(botonConfirmar()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Efectivo" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/La caja está cerrada/);
    expect(screen.getByRole("link", { name: /Abrir caja/ })).toHaveAttribute("href", "/caja");
    expect(botonConfirmar()).toBeDisabled();

    // Otro método no toca el cajón.
    await userEvent.click(screen.getByRole("button", { name: "Tarjeta" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(botonConfirmar()).toBeEnabled();
  });

  it("si el servidor responde que la caja está cerrada, lo muestra en el mismo lugar", async () => {
    mockAbonar.mockResolvedValue({ error: "Abre la caja antes de pagar en efectivo a un proveedor", success: false });
    pintar();
    await userEvent.type(campoMonto(), "1000");
    await userEvent.click(screen.getByRole("button", { name: "Efectivo" }));
    await userEvent.click(botonConfirmar());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Abre la caja antes de pagar en efectivo a un proveedor, o elige otro método.",
    );
    expect(botonConfirmar()).toBeDisabled();
  });

  it("mientras registra el botón dice «Registrando…»", async () => {
    let terminar: (valor: unknown) => void = () => {};
    mockAbonar.mockReturnValue(new Promise((resolver) => (terminar = resolver)));
    pintar();
    await userEvent.type(campoMonto(), "1000");
    await userEvent.click(botonConfirmar());

    expect(await screen.findByRole("button", { name: "Registrando…" })).toBeDisabled();
    // Una acción que nunca termina dejaría colgadas las transiciones de los tests siguientes.
    terminar({ error: null, success: true });
    await screen.findByRole("status");
  });

  it("éxito: ✓, lo que se pagó con su referencia y lo que queda; «Hacer otro abono» sigue con el saldo nuevo", async () => {
    const { onOtroAbono } = pintar();
    await userEvent.type(campoMonto(), "300000");
    await userEvent.type(screen.getByLabelText(/Referencia/), "004581233");
    await userEvent.click(botonConfirmar());

    const estado = await screen.findByRole("status");
    expect(estado).toHaveTextContent("Abono registrado");
    expect(estado).toHaveTextContent(`${pesos(300000)} a Pirelli por transferencia · ref. 004581233`);
    expect(estado).toHaveTextContent(`todavía debes ${pesos(4573557)}`);

    await userEvent.click(screen.getByRole("button", { name: "Hacer otro abono" }));
    expect(onOtroAbono).toHaveBeenCalledWith({ ...PIRELLI, pagado: 500000, saldo: 4573557 });
  });

  it("éxito pagando todo: la entrada quedó pagada y «Listo» cierra", async () => {
    const { onOpenChange } = pintar();
    await userEvent.click(screen.getByRole("button", { name: /Pagar todo ·/ }));
    await userEvent.click(botonConfirmar());

    expect(await screen.findByRole("status")).toHaveTextContent(/quedó pagada. La encuentras en «Pagadas»/);
    expect(screen.queryByRole("button", { name: "Hacer otro abono" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
