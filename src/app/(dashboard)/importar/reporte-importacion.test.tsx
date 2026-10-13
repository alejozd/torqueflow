import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReporteImportacion } from "./reporte-importacion";
import type { ResultadoImportacion } from "@/lib/importacion/resultado";

const RESULTADO: ResultadoImportacion = {
  error: null,
  resumen: [
    { hoja: "Clientes", leidas: 2, creadas: 1, existentes: 1, rechazadas: 0, estado: "ok", motivo: null },
    { hoja: "Repuestos", leidas: 3, creadas: 0, existentes: 0, rechazadas: 1, estado: "ok", motivo: null },
    {
      hoja: "Servicios",
      leidas: 0,
      creadas: 0,
      existentes: 0,
      rechazadas: 0,
      estado: "omitida",
      motivo: "Solo un administrador puede importar servicios",
    },
  ],
  filas: [
    {
      hoja: "Clientes",
      fila: 2,
      columna: null,
      valor: "documento 1",
      motivo: "Ya existe en el sistema",
      tipo: "ya_existia",
    },
    {
      hoja: "Repuestos",
      fila: 4,
      columna: "Precio compra",
      valor: null,
      motivo: '"abc" no es un número',
      tipo: "rechazada",
    },
  ],
  filasOcultas: 0,
};

describe("ReporteImportacion", () => {
  it("resume lo creado, lo que ya existía y lo rechazado", () => {
    render(<ReporteImportacion resultado={RESULTADO} />);

    expect(screen.getByRole("status")).toHaveTextContent("Se creó 1 registro.");
    expect(screen.getByRole("status")).toHaveTextContent("1 fila ya existía.");
    expect(screen.getByRole("status")).toHaveTextContent("1 fila quedó por fuera.");

    // La primera tabla es el resumen por hoja; la segunda, las filas a revisar.
    const resumen = screen.getAllByRole("table")[0] as HTMLElement;
    expect(within(resumen).getByText("Clientes")).toBeInTheDocument();
    // Clientes y Repuestos terminan bien; Servicios se omite.
    expect(within(resumen).getAllByText("Listo")).toHaveLength(2);
    expect(within(resumen).getByText("Omitida")).toBeInTheDocument();
    expect(within(resumen).getByText("Servicios: Solo un administrador puede importar servicios")).toBeInTheDocument();
  });

  it("lista las filas para revisar con su hoja, fila, columna y motivo", () => {
    render(<ReporteImportacion resultado={RESULTADO} />);

    expect(screen.getByText("Filas para revisar")).toBeInTheDocument();
    expect(screen.getByText("Ya existía")).toBeInTheDocument();
    expect(screen.getByText("Rechazada")).toBeInTheDocument();
    expect(screen.getByText('"abc" no es un número')).toBeInTheDocument();
    expect(screen.getByText("Precio compra")).toBeInTheDocument();
  });

  it("avisa cuando hay más novedades de las que caben", () => {
    render(<ReporteImportacion resultado={{ ...RESULTADO, filasOcultas: 12 }} />);

    expect(screen.getByText(/Y 12 filas más con novedades/)).toBeInTheDocument();
  });

  it("sin nada que revisar no pinta la tabla de novedades", () => {
    render(
      <ReporteImportacion
        resultado={{
          ...RESULTADO,
          filas: [],
          resumen: [{ hoja: "Clientes", leidas: 1, creadas: 1, existentes: 0, rechazadas: 0, estado: "ok", motivo: null }],
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Se creó 1 registro.");
    expect(screen.queryByText("Filas para revisar")).not.toBeInTheDocument();
  });

  it("dice claramente cuando no se creó nada", () => {
    render(
      <ReporteImportacion
        resultado={{
          ...RESULTADO,
          filas: [],
          resumen: [{ hoja: "Clientes", leidas: 1, creadas: 0, existentes: 1, rechazadas: 0, estado: "ok", motivo: null }],
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("No se creó nada nuevo.");
    expect(screen.getByRole("status")).toHaveTextContent("1 fila ya existía.");
  });
});
