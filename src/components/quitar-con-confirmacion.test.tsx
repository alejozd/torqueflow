import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockToastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() } }));

import { QuitarConConfirmacion } from "./quitar-con-confirmacion";

describe("QuitarConConfirmacion", () => {
  beforeEach(() => mockToastError.mockReset());

  it("asks before calling the action, then calls onQuitado", async () => {
    const accion = vi.fn().mockResolvedValue({ error: null, success: true });
    const onQuitado = vi.fn();
    render(<QuitarConConfirmacion etiqueta="Quitar Filtro" pregunta="¿Quitar Filtro?" accion={accion} onQuitado={onQuitado} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro" }));
    expect(accion).not.toHaveBeenCalled();
    expect(screen.getByText("¿Quitar Filtro?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));
    await vi.waitFor(() => expect(onQuitado).toHaveBeenCalledTimes(1));
  });

  it("toasts the refusal and goes back to the icon button", async () => {
    const accion = vi.fn().mockResolvedValue({ error: "No se puede modificar una orden en estado ENTREGADA.", success: false });
    render(<QuitarConConfirmacion etiqueta="Quitar Filtro" pregunta="¿Quitar Filtro?" accion={accion} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro" }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));

    await vi.waitFor(() => expect(mockToastError).toHaveBeenCalledWith("No se puede modificar una orden en estado ENTREGADA."));
    expect(screen.getByRole("button", { name: "Quitar Filtro" })).toBeInTheDocument();
  });

  it("'No' backs out without calling the action", async () => {
    const accion = vi.fn();
    render(<QuitarConConfirmacion etiqueta="Quitar Filtro" pregunta="¿Quitar Filtro?" accion={accion} />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar Filtro" }));
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(accion).not.toHaveBeenCalled();
  });
});
