import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAbonarProveedor = vi.fn();
vi.mock("@/app/actions/cuenta-por-pagar-actions", () => ({
  abonarProveedorAction: (...args: unknown[]) => mockAbonarProveedor(...args),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { AbonoProveedorDialog, type ProveedorAbono } from "./abono-proveedor-dialog";

const pesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Las entradas de Distribuidora Gates del mockup; llegan en el orden de la lista (más vieja primero no garantizado).
const GATES: ProveedorAbono = {
  proveedorId: "prov-gates",
  proveedorNombre: "Distribuidora Gates",
  cuentas: [
    { cuentaId: "g2", fecha: dia("2026-09-27"), fechaTexto: "27 sept 2026", dias: 19, saldo: 4029365 },
    { cuentaId: "g1", fecha: dia("2026-08-07"), fechaTexto: "7 ago 2026", dias: 70, saldo: 3948632 },
    { cuentaId: "g3", fecha: dia("2026-10-06"), fechaTexto: "6 oct 2026", dias: 10, saldo: 1815989 },
  ],
};

function pintar(props: Partial<Parameters<typeof AbonoProveedorDialog>[0]> = {}) {
  const onRegistrado = vi.fn();
  render(
    <AbonoProveedorDialog
      proveedor={GATES}
      cajaAbierta
      open
      onOpenChange={vi.fn()}
      onRegistrado={onRegistrado}
      {...props}
    />,
  );
  return { onRegistrado };
}

const campoMonto = () => screen.getByLabelText("¿Cuánto le vas a pagar en total?");
const botonConfirmar = () => screen.getByRole("button", { name: /^(Escribe el monto|Registrar )/ });
const filas = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("AbonoProveedorDialog", () => {
  beforeEach(() => {
    mockAbonarProveedor.mockReset();
    mockAbonarProveedor.mockResolvedValue({
      error: null,
      success: true,
      montoRegistrado: 5000000,
      cuentaIds: ["g1", "g2"],
      saldoRestante: 4793986,
    });
  });

  it("muestra lo que se debe y empieza sin monto: no se puede enviar", async () => {
    pintar();

    expect(await screen.findByRole("dialog", { name: "Abonar a Distribuidora Gates" })).toBeInTheDocument();
    expect(screen.getByText(pesos(9793986), { selector: "dd" })).toBeInTheDocument();
    expect(botonConfirmar()).toHaveTextContent("Escribe el monto");
    expect(botonConfirmar()).toBeDisabled();
  });

  it("«Así se reparte» va de la más vieja a la más nueva y el botón dice monto y entradas", async () => {
    pintar();
    await userEvent.type(campoMonto(), "5000000");

    const [vieja, media, nueva] = filas();
    expect(vieja).toHaveTextContent("Entrada del 7 ago 2026");
    expect(vieja).toHaveTextContent(pesos(3948632));
    expect(vieja).toHaveTextContent("✓ Queda pagada");
    expect(media).toHaveTextContent(pesos(1051368));
    expect(media).toHaveTextContent(`debe ${pesos(2977997)}`);
    expect(nueva).toHaveTextContent("—");
    expect(botonConfirmar()).toHaveTextContent(`Registrar ${pesos(5000000)} en 2 entradas`);

    await userEvent.click(botonConfirmar());
    await waitFor(() => expect(mockAbonarProveedor).toHaveBeenCalledTimes(1));
    const [proveedorId, , formData] = mockAbonarProveedor.mock.calls[0] as [string, unknown, FormData];
    expect(proveedorId).toBe("prov-gates");
    expect(formData.get("monto")).toBe("5000000");
    expect(formData.get("metodoPago")).toBe("TRANSFERENCIA");
  });

  it("botones rápidos: todo, y lo de más de 60 días", async () => {
    pintar();
    await userEvent.click(screen.getByRole("button", { name: /Lo de más de 60 días/ }));
    expect(campoMonto()).toHaveValue("3.948.632");
    expect(botonConfirmar()).toHaveTextContent("en 1 entrada");

    await userEvent.click(screen.getByRole("button", { name: /^Todo ·/ }));
    expect(campoMonto()).toHaveValue("9.793.986");
    expect(filas().every((fila) => fila.textContent?.includes("✓ Queda pagada"))).toBe(true);
  });

  it("no deja pagar más de lo que se le debe", async () => {
    pintar();
    await userEvent.type(campoMonto(), "9793987");

    expect(screen.getByText(`No puedes pagar más de lo que le debes (${pesos(9793986)}).`)).toBeInTheDocument();
    expect(botonConfirmar()).toBeDisabled();
  });

  it("efectivo con la caja cerrada se bloquea antes de enviar", async () => {
    pintar({ cajaAbierta: false });
    await userEvent.type(campoMonto(), "1000");
    await userEvent.click(screen.getByRole("button", { name: "Efectivo" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/La caja está cerrada/);
    expect(botonConfirmar()).toBeDisabled();
  });

  it("éxito: cuánto se pagó, en cuántas entradas y lo que queda; avisa a la lista con las cuentas tocadas", async () => {
    const { onRegistrado } = pintar();
    await userEvent.type(campoMonto(), "5000000");
    await userEvent.click(botonConfirmar());

    const estado = await screen.findByRole("status");
    expect(estado).toHaveTextContent(
      `${pesos(5000000)} a Distribuidora Gates por transferencia, repartido en 2 entradas`,
    );
    expect(estado).toHaveTextContent(`Todavía le debes ${pesos(4793986)}`);
    expect(onRegistrado).toHaveBeenCalledWith(["g1", "g2"]);
  });
});
