import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResumenEconomico } from "./resumen-economico";

const textoPesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

describe("ResumenEconomico", () => {
  it("pinta filas, subtotal, descuento en rojo, IVA y el total con su etiqueta", () => {
    render(
      <ResumenEconomico
        encabezado="2 productos · 3 unidades"
        filas={[{ etiqueta: "Repuestos", valor: 100000, colorPunto: "bg-primary" }]}
        subtotal={100000}
        descuento={5000}
        etiquetaDescuento="Descuento 5 %"
        iva={18050}
        total={113050}
        etiquetaTotal="Total a cobrar"
        editorDescuento={<span>editor</span>}
      />,
    );
    expect(screen.getByText("2 productos · 3 unidades")).toBeInTheDocument();
    expect(screen.getByText("Repuestos")).toBeInTheDocument();
    expect(screen.getByText("Descuento 5 %")).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
    expect(screen.getByText("Total a cobrar")).toBeInTheDocument();
    expect(screen.getByTestId("total-resumen")).toHaveTextContent(textoPesos(113050));
  });

  it("con el IVA incluido no muestra filas de IVA y lo dice junto al total", () => {
    render(
      <ResumenEconomico
        modoIva="incluido"
        subtotal={119000}
        descuento={0}
        etiquetaDescuento="Descuento"
        iva={19000}
        desgloseIva={[{ ivaPct: 19, base: 100000, iva: 19000 }]}
        total={119000}
        etiquetaTotal="Total cotizado"
      />,
    );
    expect(screen.queryByText(/IVA 19 %/)).not.toBeInTheDocument();
    expect(screen.queryByText("IVA (19 %)")).not.toBeInTheDocument();
    expect(screen.getByText("IVA incluido")).toBeInTheDocument();
    expect(screen.getByTestId("total-resumen")).toHaveTextContent(textoPesos(119000));
  });

  it("sin descuento no muestra la fila roja", () => {
    render(
      <ResumenEconomico subtotal={0} descuento={0} etiquetaDescuento="Descuento" iva={0} total={0} etiquetaTotal="Total" />,
    );
    expect(screen.queryByText("Descuento")).not.toBeInTheDocument();
  });
});
