import { describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TarjetaCobro, type TarjetaCobroHandle } from "./tarjeta-cobro";
import { useAtajosMostrador } from "./use-atajos-mostrador";

const pesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
/** Igual que `pesos` pero con espacio normal: Testing Library normaliza el espacio duro del texto. */
const textoPesos = (n: number) => pesos(n).replace(/\s/g, " ");

function pintar(props: Partial<Parameters<typeof TarjetaCobro>[0]> = {}) {
  const onCobrar = vi.fn();
  render(
    <TarjetaCobro
      total={260015}
      hayCliente={false}
      efectivoBloqueado={false}
      motivoBloqueo={null}
      ocupado={false}
      onCobrar={onCobrar}
      {...props}
    />,
  );
  return { onCobrar };
}

const botonCobrar = () => screen.getByRole("button", { name: /^Cobrar/ });

describe("TarjetaCobro", () => {
  it("efectivo: lo recibido da las vueltas y se cobra el total con lo recibido", async () => {
    const { onCobrar } = pintar();
    await userEvent.type(screen.getByLabelText("Recibido"), "300000");

    expect(screen.getByTestId("vueltas")).toHaveTextContent(textoPesos(39985));
    await userEvent.click(botonCobrar());
    expect(onCobrar).toHaveBeenCalledWith({
      pagos: [{ metodoPago: "EFECTIVO", monto: 260015 }],
      recibidoEfectivo: 300000,
    });
  });

  it("atajos de billetes: Justo y los siguientes billetes redondos", async () => {
    pintar();
    await userEvent.click(screen.getByRole("button", { name: pesos(300000) }));
    expect(screen.getByLabelText("Recibido")).toHaveValue(300000);
    expect(screen.getByRole("button", { name: pesos(270000) })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Justo" }));
    expect(screen.getByLabelText("Recibido")).toHaveValue(260015);
    expect(screen.getByTestId("vueltas")).toHaveTextContent(textoPesos(0));
  });

  it("sin cliente, recibir menos que el total avisa lo que falta y no deja cobrar", async () => {
    pintar();
    await userEvent.type(screen.getByLabelText("Recibido"), "200000");
    expect(screen.getAllByText(`Faltan ${textoPesos(60015)}`).length).toBeGreaterThan(0);
    expect(botonCobrar()).toBeDisabled();
  });

  it("con cliente, recibir menos deja el resto como saldo", async () => {
    const { onCobrar } = pintar({ hayCliente: true });
    await userEvent.type(screen.getByLabelText("Recibido"), "200000");
    expect(screen.getByText(`Queda debiendo ${textoPesos(60015)}`)).toBeInTheDocument();
    await userEvent.click(botonCobrar());
    expect(onCobrar).toHaveBeenCalledWith({
      pagos: [{ metodoPago: "EFECTIVO", monto: 200000 }],
      recibidoEfectivo: 200000,
    });
  });

  it("pago mixto: la última fila se autocompleta con lo que falta", async () => {
    const { onCobrar } = pintar();
    await userEvent.click(screen.getByRole("button", { name: "Tarjeta" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Agregar otro método" }));

    const primero = screen.getByLabelText("Monto del pago 1");
    expect(primero).toHaveValue(260015);
    await userEvent.clear(primero);
    await userEvent.type(primero, "150000");

    expect(screen.getByLabelText("Método del pago 2")).toHaveValue("EFECTIVO");
    expect(screen.getByLabelText("Monto del pago 2")).toHaveValue(110015);
    await userEvent.click(botonCobrar());
    expect(onCobrar).toHaveBeenCalledWith({
      pagos: [
        { metodoPago: "TARJETA", monto: 150000 },
        { metodoPago: "EFECTIVO", monto: 110015 },
      ],
      recibidoEfectivo: null,
    });
  });

  it("dejar a crédito solo aparece con cliente y avisa cuánto queda debiendo", async () => {
    pintar();
    expect(screen.queryByRole("button", { name: "Dejar a crédito" })).not.toBeInTheDocument();
  });

  it("a crédito no manda pagos", async () => {
    const { onCobrar } = pintar({ hayCliente: true });
    await userEvent.click(screen.getByRole("button", { name: "Dejar a crédito" }));
    expect(screen.getByText(`Queda debiendo ${textoPesos(260015)}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Registrar a crédito" }));
    expect(onCobrar).toHaveBeenCalledWith({ pagos: [], recibidoEfectivo: null });
  });

  it("con la caja cerrada el efectivo se deshabilita con su motivo y arranca en tarjeta", async () => {
    const { onCobrar } = pintar({ efectivoBloqueado: true });
    expect(screen.getByRole("button", { name: "Efectivo" })).toBeDisabled();
    expect(screen.getByText(/Caja cerrada: abre la caja para cobrar en efectivo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tarjeta" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Recibido")).not.toBeInTheDocument();
    await userEvent.click(botonCobrar());
    expect(onCobrar).toHaveBeenCalledWith({ pagos: [{ metodoPago: "TARJETA", monto: 260015 }], recibidoEfectivo: null });
  });

  it("sin productos el botón Cobrar se deshabilita con el motivo", () => {
    pintar({ total: 0, motivoBloqueo: "Agrega al menos un producto" });
    expect(botonCobrar()).toBeDisabled();
    expect(screen.getByText("Agrega al menos un producto")).toBeInTheDocument();
  });

  it("F9 lleva a Recibido con Efectivo elegido y, ya en el cobro, cobra", async () => {
    const onCobrar = vi.fn();
    function Arnes() {
      const ref = useRef<TarjetaCobroHandle>(null);
      useAtajosMostrador({
        focusBuscador: () => {},
        buscarCliente: () => {},
        descuento: () => {},
        irACobrar: () => ref.current?.irACobrar(),
      });
      return (
        <TarjetaCobro
          ref={ref}
          total={50000}
          hayCliente={false}
          efectivoBloqueado={false}
          motivoBloqueo={null}
          ocupado={false}
          onCobrar={onCobrar}
        />
      );
    }
    render(<Arnes />);
    await userEvent.click(screen.getByRole("button", { name: "Tarjeta" }));
    await userEvent.click(document.body);

    await userEvent.keyboard("{F9}");
    await waitFor(() => expect(screen.getByLabelText("Recibido")).toHaveFocus());
    expect(screen.getByRole("button", { name: "Efectivo" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.keyboard("{F9}");
    expect(onCobrar).toHaveBeenCalledWith({ pagos: [{ metodoPago: "EFECTIVO", monto: 50000 }], recibidoEfectivo: null });
  });
});
