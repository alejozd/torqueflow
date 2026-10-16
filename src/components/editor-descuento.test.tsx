import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DESCUENTO_VACIO,
  EditorDescuentoLocal,
  evaluarDescuento,
  montoDescuento,
  type DescuentoLocal,
} from "./editor-descuento";

describe("montoDescuento / evaluarDescuento", () => {
  it("convierte porcentaje y monto en pesos", () => {
    expect(montoDescuento(230000, { tipo: "PORCENTAJE", valor: "5" })).toBe(11500);
    expect(montoDescuento(230000, { tipo: "MONTO", valor: "7000" })).toBe(7000);
    expect(montoDescuento(230000, DESCUENTO_VACIO)).toBe(0);
  });

  it("el porcentaje se trunca al centavo para no pasar el tope", () => {
    const { porcentaje, error } = evaluarDescuento(33333.35, { tipo: "PORCENTAJE", valor: "10" }, 10);
    expect(porcentaje).toBeLessThanOrEqual(10);
    expect(error).toBeNull();
  });

  it("con tope bloquea lo que lo pasa; sin tope (ADMIN) no", () => {
    expect(evaluarDescuento(100000, { tipo: "MONTO", valor: "15000" }, 10).error).toBe("Tu descuento máximo es 10 %");
    expect(evaluarDescuento(100000, { tipo: "MONTO", valor: "15000" }, null).error).toBeNull();
    expect(evaluarDescuento(100000, { tipo: "MONTO", valor: "150000" }, null).error).toBe(
      "El descuento no puede ser mayor que el subtotal",
    );
  });
});

describe("EditorDescuentoLocal", () => {
  function Arnes({ tope, onCambio }: { tope: number | null; onCambio: (d: DescuentoLocal) => void }) {
    const [descuento, setDescuento] = useState(DESCUENTO_VACIO);
    const { error } = evaluarDescuento(100000, descuento, tope);
    return (
      <EditorDescuentoLocal
        descuento={descuento}
        onCambiar={(d) => {
          setDescuento(d);
          onCambio(d);
        }}
        tope={tope}
        error={error}
      />
    );
  }

  it("muestra el tope de RECEPCION y avisa al pasarlo, sin guardar nada", async () => {
    const onCambio = vi.fn();
    render(<Arnes tope={10} onCambio={onCambio} />);
    expect(screen.getByText("Máximo 10 %")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Descuento"), "12");
    expect(screen.getByText("Tu descuento máximo es 10 %")).toBeInTheDocument();
    expect(screen.getByLabelText("Descuento")).toHaveAttribute("aria-invalid", "true");

    await userEvent.click(screen.getByRole("button", { name: "Descuento por monto fijo" }));
    expect(onCambio).toHaveBeenLastCalledWith({ tipo: "MONTO", valor: "" });
  });

  it("ADMIN no ve tope", () => {
    render(<Arnes tope={null} onCambio={vi.fn()} />);
    expect(screen.queryByText(/Máximo/)).not.toBeInTheDocument();
  });
});
