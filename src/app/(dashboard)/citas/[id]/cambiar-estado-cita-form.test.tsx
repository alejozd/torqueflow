import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/actions/cita-actions", () => ({
  cambiarEstadoCitaAction: vi.fn(),
}));

import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";

describe("CambiarEstadoCitaForm", () => {
  it("offers the four estados and preselects the current one", () => {
    render(<CambiarEstadoCitaForm citaId="cita-1" estadoActual="CONFIRMADA" />);

    const select = screen.getByLabelText<HTMLSelectElement>("Estado");
    expect(select.value).toBe("CONFIRMADA");
    for (const estado of ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA"]) {
      expect(screen.getByRole("option", { name: estado })).toBeInTheDocument();
    }
  });

  it("renders the submit button", () => {
    render(<CambiarEstadoCitaForm citaId="cita-1" estadoActual="PROGRAMADA" />);

    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();
  });
});
