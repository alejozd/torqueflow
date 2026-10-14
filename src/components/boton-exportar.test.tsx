import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BotonExportar } from "./boton-exportar";

describe("BotonExportar", () => {
  beforeEach(() => {
    // 17 de octubre de 2026 en Bogotá.
    vi.useFakeTimers({ now: new Date("2026-10-17T15:00:00Z"), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("un reporte sin rango es un enlace de descarga directo", () => {
    render(<BotonExportar reporte="cartera" etiqueta="Exportar a Excel" />);

    expect(screen.getByRole("link", { name: "Exportar a Excel" })).toHaveAttribute("href", "/api/exportar/cartera");
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
  });

  it("ventas pide el rango antes de descargar, con el mes en curso por defecto", () => {
    const { container } = render(<BotonExportar reporte="ventas" etiqueta="Exportar ventas" />);

    expect(screen.getByText("Exportar ventas")).toBeInTheDocument();
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute("action", "/api/exportar/ventas");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByLabelText("Desde")).toHaveAttribute("name", "desde");
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Hasta")).toHaveAttribute("name", "hasta");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-17");
    expect(screen.getByRole("button", { name: "Descargar Excel" })).toHaveAttribute("type", "submit");
  });

  it("un rango inválido no se envía y muestra el error en línea", () => {
    const { container } = render(<BotonExportar reporte="arqueos" etiqueta="Exportar arqueos" />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-01" } });

    // fireEvent devuelve false cuando el manejador cancela el envío.
    expect(fireEvent.submit(container.querySelector("form")!)).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent(/posterior/);
  });

  it("un rango válido se envía tal cual (la descarga la hace el navegador)", () => {
    const { container } = render(<BotonExportar reporte="arqueos" etiqueta="Exportar arqueos" />);

    expect(fireEvent.submit(container.querySelector("form")!)).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
