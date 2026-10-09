import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EliminarConConfirmacion } from "./eliminar-con-confirmacion";

function renderEliminar(accion: () => Promise<{ error: string | null; success: boolean }>, onEliminado = vi.fn()) {
  render(
    <EliminarConConfirmacion
      etiqueta="Eliminar cliente"
      confirmacion="¿Eliminar a Ana?"
      accion={accion}
      onEliminado={onEliminado}
    />,
  );
  return onEliminado;
}

describe("EliminarConConfirmacion", () => {
  it("asks for confirmation before calling the action", async () => {
    const accion = vi.fn().mockResolvedValue({ error: null, success: true });
    const onEliminado = renderEliminar(accion);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar cliente/ }));
    expect(accion).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar a Ana?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await vi.waitFor(() => expect(onEliminado).toHaveBeenCalledTimes(1));
  });

  it("shows the refusal reason and does not report success", async () => {
    const accion = vi.fn().mockResolvedValue({
      error: "No se puede eliminar el cliente porque tiene historial: 2 órdenes.",
      success: false,
    });
    const onEliminado = renderEliminar(accion);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar cliente/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("tiene historial: 2 órdenes");
    expect(onEliminado).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Eliminar cliente/ })).toBeInTheDocument();
  });

  it("lets the user back out without calling the action", async () => {
    const accion = vi.fn();
    renderEliminar(accion);

    await userEvent.click(screen.getByRole("button", { name: /Eliminar cliente/ }));
    await userEvent.click(screen.getByRole("button", { name: "No" }));

    expect(accion).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Eliminar cliente/ })).toBeInTheDocument();
  });
});
