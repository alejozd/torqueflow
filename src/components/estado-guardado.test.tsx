import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EstadoGuardado } from "./estado-guardado";

describe("EstadoGuardado", () => {
  it("no pinta nada mientras no se ha guardado", () => {
    const { container } = render(<EstadoGuardado fase="inactivo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("avisa mientras guarda y cuando quedó guardado", () => {
    const { rerender } = render(<EstadoGuardado fase="guardando" />);
    expect(screen.getByRole("status")).toHaveTextContent("Guardando…");
    rerender(<EstadoGuardado fase="guardado" />);
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
  });

  it("muestra el error de la acción", () => {
    render(<EstadoGuardado fase="error" error="La orden ya no se puede modificar" />);
    expect(screen.getByRole("alert")).toHaveTextContent("La orden ya no se puede modificar");
  });
});
