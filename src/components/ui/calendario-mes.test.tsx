// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarioMes } from "./calendario-mes";

const HOY = "2026-10-16";
const dia = (n: number) => document.querySelector<HTMLButtonElement>(`[data-dia="2026-10-${String(n).padStart(2, "0")}"]`)!;

describe("CalendarioMes", () => {
  it("marca la seleccionada con aria-pressed y hoy con aria-current", () => {
    render(<CalendarioMes seleccionada="2026-10-16" hoy={HOY} onElegir={() => {}} />);
    const boton = screen.getByRole("button", { name: /viernes 16 de octubre/i });
    expect(boton).toHaveAttribute("aria-pressed", "true");
    expect(boton).toHaveAttribute("aria-current", "date");
    expect(dia(20)).toHaveAttribute("aria-pressed", "false");
  });

  it("deshabilita días y mes siguiente fuera de max", () => {
    render(<CalendarioMes seleccionada="2026-10-16" hoy={HOY} max="2026-10-16" onElegir={() => {}} />);
    expect(dia(17)).toBeDisabled();
    expect(dia(16)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mes anterior" })).toBeEnabled();
  });

  it("la flecha derecha enfoca el día siguiente", async () => {
    const user = userEvent.setup();
    render(<CalendarioMes seleccionada="2026-10-16" hoy={HOY} onElegir={() => {}} />);
    dia(16).focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(dia(17)).toHaveFocus());
  });

  it("pinta el rango: tramo y extremos", () => {
    render(<CalendarioMes seleccionada={null} hoy={HOY} rango={{ desde: "2026-10-05", hasta: "2026-10-09" }} onElegir={() => {}} />);
    expect(dia(7)).toHaveAttribute("data-tramo");
    expect(dia(5)).toHaveAttribute("aria-pressed", "true");
    expect(dia(9)).toHaveAttribute("aria-pressed", "true");
    expect(dia(5)).not.toHaveAttribute("data-tramo");
  });

  it("llama onElegir con el día pulsado", async () => {
    const user = userEvent.setup();
    const onElegir = vi.fn();
    render(<CalendarioMes seleccionada="2026-10-16" hoy={HOY} onElegir={onElegir} />);
    await user.click(dia(20));
    expect(onElegir).toHaveBeenCalledWith("2026-10-20");
  });

  it("sin citasPorDia no muestra la leyenda de citas", () => {
    const { rerender } = render(<CalendarioMes seleccionada="2026-10-16" hoy={HOY} onElegir={() => {}} />);
    expect(screen.queryByText(/ya hay citas ese día/)).not.toBeInTheDocument();
    rerender(<CalendarioMes seleccionada="2026-10-16" hoy={HOY} citasPorDia={() => 0} onElegir={() => {}} />);
    expect(screen.getByText(/ya hay citas ese día/)).toBeInTheDocument();
  });
});
