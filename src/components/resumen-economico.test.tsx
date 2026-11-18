import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResumenEconomico } from "./resumen-economico";

const textoPesos = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(n)
    .replace(/\s/g, " ");

describe("ResumenEconomico", () => {
  it("en una cotización de antes del IVA incluido muestra el IVA sumado aparte para que el total cuadre", () => {
    render(
      <ResumenEconomico
        subtotal={511881}
        descuento={0}
        etiquetaDescuento="Descuento"
        iva={0}
        total={581503}
        etiquetaTotal="Total cotizado"
        modoIva="incluido"
        ivaAparte={69622}
      />,
    );
    expect(screen.getByText("IVA sumado aparte").nextSibling).toHaveTextContent("69.622");
    expect(screen.getByText("Cotizada antes del IVA incluido")).toBeInTheDocument();
  });

  it("sin IVA aparte no muestra esa fila", () => {
    render(
      <ResumenEconomico subtotal={100} descuento={0} etiquetaDescuento="Descuento" iva={0} total={100} etiquetaTotal="Total" modoIva="incluido" />,
    );
    expect(screen.queryByText("IVA sumado aparte")).toBeNull();
    expect(screen.getByText("IVA incluido")).toBeInTheDocument();
  });

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

  it("en el Mostrador dice qué IVA va incluido en el total, por tarifa", () => {
    render(
      <ResumenEconomico
        subtotal={119000}
        descuento={0}
        etiquetaDescuento="Descuento"
        iva={19000}
        desgloseIva={[{ ivaPct: 19, base: 100000, iva: 19000 }]}
        total={119000}
        etiquetaTotal="Total a cobrar"
      />,
    );
    expect(screen.getByText(/Incluye IVA 19 % sobre/)).toBeInTheDocument();
    expect(screen.getByTestId("total-resumen")).toHaveTextContent(textoPesos(119000));
  });

  it("sin descuento no muestra la fila roja", () => {
    render(
      <ResumenEconomico subtotal={0} descuento={0} etiquetaDescuento="Descuento" iva={0} total={0} etiquetaTotal="Total" />,
    );
    expect(screen.queryByText("Descuento")).not.toBeInTheDocument();
  });
});
