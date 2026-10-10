import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/actions/cita-actions", () => ({
  cambiarEstadoCitaAction: vi.fn(),
}));

import { cambiarEstadoCitaAction } from "@/app/actions/cita-actions";
import { CambiarEstadoCitaForm } from "./cambiar-estado-cita-form";

const mockCambiarEstado = vi.mocked(cambiarEstadoCitaAction);

const ESTADOS: [string, string][] = [
  ["PROGRAMADA", "Programada"],
  ["CONFIRMADA", "Confirmada"],
  ["CANCELADA", "Cancelada"],
  ["COMPLETADA", "Completada"],
];

describe("CambiarEstadoCitaForm", () => {
  beforeEach(() => {
    mockCambiarEstado.mockReset();
  });

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

  it("asks before cancelling the cita", async () => {
    mockCambiarEstado.mockResolvedValue({ error: null, success: true });
    render(<CambiarEstadoCitaForm citaId="c1" estadoActual="PROGRAMADA" />);

    await userEvent.click(screen.getByLabelText("Cancelada"));
    await userEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
    expect(mockCambiarEstado).not.toHaveBeenCalled();
    expect(screen.getByText("¿Cancelar la cita? Se puede volver a programar después.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    await vi.waitFor(() => expect(mockCambiarEstado).toHaveBeenCalled());
  });

  it("does not ask for other estados", async () => {
    mockCambiarEstado.mockResolvedValue({ error: null, success: true });
    render(<CambiarEstadoCitaForm citaId="c1" estadoActual="PROGRAMADA" />);

    await userEvent.click(screen.getByLabelText("Confirmada"));
    await userEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));

    await vi.waitFor(() => expect(mockCambiarEstado).toHaveBeenCalled());
  });
});
