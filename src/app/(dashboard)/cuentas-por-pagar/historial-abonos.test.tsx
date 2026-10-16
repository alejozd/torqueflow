import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistorialAbonos, type AbonoHistorial } from "./historial-abonos";

const ABONO: AbonoHistorial = {
  id: "pg1",
  cuando: "Hoy, 1:58 p. m.",
  monto: 200000,
  metodo: "Transferencia",
  referencia: "004581233",
  registradoPor: "Admin Dev",
};

describe("HistorialAbonos", () => {
  it("cerrado muestra solo cuántos abonos hay; al tocar se despliegan", async () => {
    render(<HistorialAbonos abonos={[ABONO, { ...ABONO, id: "pg2", referencia: null }]} abiertoInicial={false} />);

    const boton = screen.getByRole("button", { name: "2 abonos registrados" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("por Admin Dev")).not.toBeInTheDocument();

    await userEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Transferencia · ref. 004581233")).toBeInTheDocument();
    expect(screen.getByText("Transferencia · sin referencia")).toBeInTheDocument();
    expect(screen.getAllByText("por Admin Dev")).toHaveLength(2);
  });

  it("viene abierto cuando el último abono es de hoy", () => {
    render(<HistorialAbonos abonos={[ABONO]} abiertoInicial />);

    expect(screen.getByRole("button", { name: "1 abono registrado" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hoy, 1:58 p. m.")).toBeInTheDocument();
  });

  it("sin abonos no pinta nada", () => {
    const { container } = render(<HistorialAbonos abonos={[]} abiertoInicial={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
