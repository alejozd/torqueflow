import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InsigniaDian } from "./estado-dian";

describe("InsigniaDian", () => {
  it("muestra el estado en lenguaje sencillo", () => {
    render(<InsigniaDian estado="RECHAZADO" />);
    expect(screen.getByText("Rechazada por la DIAN")).toBeInTheDocument();
  });

  it("sin enviar", () => {
    render(<InsigniaDian estado="SIN_ENVIAR" />);
    expect(screen.getByText("Sin enviar a la DIAN")).toBeInTheDocument();
  });

  it("aceptada fuera de producción dice el ambiente", () => {
    render(<InsigniaDian estado="ACEPTADO" ambiente="PRUEBAS" />);
    expect(screen.getByText("Aceptada en Pruebas")).toBeInTheDocument();
    expect(screen.queryByText("Aceptada por la DIAN")).toBeNull();
  });

  it("aceptada en producción", () => {
    render(<InsigniaDian estado="ACEPTADO" ambiente="PRODUCCION" />);
    expect(screen.getByText("Aceptada por la DIAN")).toBeInTheDocument();
  });
});
