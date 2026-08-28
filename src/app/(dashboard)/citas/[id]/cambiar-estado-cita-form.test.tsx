import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/cita-actions", () => ({
  cambiarEstadoCitaAction: vi.fn(),
}));

import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";

const ESTADOS: [string, string][] = [
  ["PROGRAMADA", "Programada"],
  ["CONFIRMADA", "Confirmada"],
  ["CANCELADA", "Cancelada"],
  ["COMPLETADA", "Completada"],
];

describe("CambiarEstadoCitaForm", () => {
  it("offers the four estados and preselects the current one", () => {
    render(<CambiarEstadoCitaForm citaId="cita-1" estadoActual="CONFIRMADA" />);

    for (const [estado, label] of ESTADOS) {
      const radio = screen.getByRole<HTMLInputElement>("radio", { name: label });
      expect(radio.value).toBe(estado);
      expect(radio.checked).toBe(estado === "CONFIRMADA");
    }
  });

  it("marks only the current estado as Actual", () => {
    render(<CambiarEstadoCitaForm citaId="cita-1" estadoActual="PROGRAMADA" />);

    expect(screen.getAllByText("Actual")).toHaveLength(1);
  });

  it("renders the submit button", () => {
    render(<CambiarEstadoCitaForm citaId="cita-1" estadoActual="PROGRAMADA" />);

    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();
  });
});
