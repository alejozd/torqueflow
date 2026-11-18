import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockFormFactura = vi.fn();
vi.mock("./generar-factura-form", () => ({
  GenerarFacturaForm: (props: unknown) => {
    mockFormFactura(props);
    return <button type="button">Generar factura</button>;
  },
}));

import { CuentaOrden } from "./cuenta-orden";

const BASE = { ordenId: "o1", repuestos: 149401, manoDeObra: 250000, total: 399401, factura: null };

describe("CuentaOrden", () => {
  it("resta los anticipos y muestra el saldo por cobrar", () => {
    render(<CuentaOrden {...BASE} estado="BORRADOR" anticipos={100000} />);
    expect(screen.getByText("Saldo por cobrar").nextSibling).toHaveTextContent("299.401");
  });

  it("si los anticipos pasan el total, el saldo es a favor del cliente", () => {
    render(<CuentaOrden {...BASE} estado="BORRADOR" anticipos={500000} />);
    expect(screen.getByText("Saldo a favor del cliente").nextSibling).toHaveTextContent("100.599");
  });

  it("muestra el total con el IVA incluido, sin filas de IVA", () => {
    render(<CuentaOrden {...BASE} estado="EN_PROCESO" anticipos={0} />);
    expect(screen.getByText("Total (IVA incluido)").nextSibling).toHaveTextContent("399.401");
    expect(screen.queryByText(/IVA 19 %/)).not.toBeInTheDocument();
  });

  it("mientras se arma la orden, la factura espera a que termine", () => {
    render(<CuentaOrden {...BASE} estado="EN_PROCESO" anticipos={0} />);
    expect(screen.getByText("Factura: al terminar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generar factura" })).not.toBeInTheDocument();
  });

  it("muestra el descuento heredado de la cotización y lo pasa a la factura", () => {
    render(
      <CuentaOrden
        {...BASE}
        total={359461}
        descuento={39940}
        etiquetaDescuento="Descuento de la cotización #45 (10 %)"
        estado="TERMINADA"
        anticipos={0}
      />,
    );
    expect(screen.getByText("Descuento de la cotización #45 (10 %)").nextSibling).toHaveTextContent("39.940");
    expect(screen.getByText("Saldo por cobrar").nextSibling).toHaveTextContent("359.461");
    expect(mockFormFactura).toHaveBeenCalledWith(expect.objectContaining({ descuentoInicial: 39940 }));
  });

  it("terminada sin factura ofrece generarla; con factura, enlaza a ella", () => {
    const { rerender } = render(<CuentaOrden {...BASE} estado="TERMINADA" anticipos={0} />);
    expect(screen.getByRole("button", { name: "Generar factura" })).toBeInTheDocument();
    rerender(<CuentaOrden {...BASE} estado="ENTREGADA" anticipos={0} factura={{ id: "f1", numero: 42 }} />);
    expect(screen.getByRole("link", { name: "Ver factura #42" })).toHaveAttribute("href", "/facturas/f1");
  });
});
