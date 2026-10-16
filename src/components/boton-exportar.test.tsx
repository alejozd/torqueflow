import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(new FormData(form).get("desde")).toBe("2026-10-01");
    expect(new FormData(form).get("hasta")).toBe("2026-10-17");
    expect(screen.getByRole("button", { name: "Descargar Excel" })).toHaveAttribute("type", "submit");
  });

  it("el atajo «Mes pasado» cambia el rango que se envía", async () => {
    const user = userEvent.setup();
    const { container } = render(<BotonExportar reporte="ventas" etiqueta="Exportar ventas" />);
    await user.click(screen.getByRole("button", { name: "Mes pasado" }));

    const datos = new FormData(container.querySelector("form")!);
    expect(datos.get("desde")).toBe("2026-09-01");
    expect(datos.get("hasta")).toBe("2026-09-30");
  });

  it("un rango válido se envía tal cual (la descarga la hace el navegador)", () => {
    const { container } = render(<BotonExportar reporte="arqueos" etiqueta="Exportar arqueos" />);

    expect(fireEvent.submit(container.querySelector("form")!)).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el desplegable de fechas se cierra con Escape o con un clic fuera", () => {
    const { container } = render(
      <div>
        <p>afuera</p>
        <BotonExportar reporte="ventas" etiqueta="Exportar ventas" />
      </div>,
    );
    const desplegable = container.querySelector("details")!;

    desplegable.open = true;
    fireEvent.keyDown(screen.getByRole("button", { name: "Hoy" }), { key: "Escape" });
    expect(desplegable.open).toBe(false);

    desplegable.open = true;
    fireEvent.pointerDown(screen.getByText("afuera"));
    expect(desplegable.open).toBe(false);

    // Un clic dentro no lo cierra.
    desplegable.open = true;
    fireEvent.pointerDown(screen.getByRole("button", { name: "Mes pasado" }));
    expect(desplegable.open).toBe(true);
  });

  it("Escape dentro del calendario abierto cierra solo el calendario", async () => {
    const user = userEvent.setup();
    const { container } = render(<BotonExportar reporte="ventas" etiqueta="Exportar ventas" />);
    const desplegable = container.querySelector("details")!;
    desplegable.open = true;

    await user.click(screen.getByRole("button", { name: /^Periodo/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(desplegable.open).toBe(true);
  });
});
