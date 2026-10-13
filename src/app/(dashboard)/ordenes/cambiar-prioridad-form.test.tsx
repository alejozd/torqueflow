import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCambiar = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  cambiarPrioridadAction: (...args: unknown[]) => mockCambiar(...args),
}));

import { CambiarPrioridadForm } from "./cambiar-prioridad-form";

describe("CambiarPrioridadForm", () => {
  beforeEach(() => {
    mockCambiar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("muestra la prioridad actual y deshabilita guardar hasta que cambie", async () => {
    render(<CambiarPrioridadForm ordenId="o1" prioridad="NORMAL" />);

    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();

    await userEvent.click(screen.getByLabelText("Prioridad"));
    await userEvent.click(await screen.findByRole("option", { name: "Urgente" }));

    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("envía la prioridad elegida a la acción", async () => {
    render(<CambiarPrioridadForm ordenId="o1" prioridad="NORMAL" />);

    await userEvent.click(screen.getByLabelText("Prioridad"));
    await userEvent.click(await screen.findByRole("option", { name: "Alta" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mockCambiar).toHaveBeenCalledTimes(1);
    expect(mockCambiar.mock.calls[0]![0]).toBe("o1");
    const formData = mockCambiar.mock.calls[0]![2] as FormData;
    expect(formData.get("prioridad")).toBe("ALTA");
  });

  it("muestra el error de la acción (por ejemplo, si ya no es editable)", async () => {
    mockCambiar.mockResolvedValue({ error: "La orden ya no se puede modificar: no se puede cambiar la prioridad", success: false });
    render(<CambiarPrioridadForm ordenId="o1" prioridad="NORMAL" />);

    await userEvent.click(screen.getByLabelText("Prioridad"));
    await userEvent.click(await screen.findByRole("option", { name: "Baja" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se puede cambiar la prioridad");
  });
});
