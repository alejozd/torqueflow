import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCambiar = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  cambiarPrioridadAction: (...args: unknown[]) => mockCambiar(...args),
}));

import { PrioridadBloque } from "./prioridad-bloque";

describe("PrioridadBloque", () => {
  beforeEach(() => {
    mockCambiar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("muestra la prioridad actual con lo que significa", () => {
    render(<PrioridadBloque ordenId="o1" prioridad="ALTA" editable />);

    expect(screen.getByText(/Prioridad Alta/)).toBeInTheDocument();
    expect(screen.getByText("Pasa adelante de las normales.")).toBeInTheDocument();
  });

  it("guarda al elegir otro nivel en el menú Cambiar", async () => {
    render(<PrioridadBloque ordenId="o1" prioridad="NORMAL" editable />);

    await userEvent.click(screen.getByRole("button", { name: /Cambiar/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Urgente" }));

    expect(mockCambiar).toHaveBeenCalledTimes(1);
    expect(mockCambiar.mock.calls[0]![0]).toBe("o1");
    const formData = mockCambiar.mock.calls[0]![2] as FormData;
    expect(formData.get("prioridad")).toBe("URGENTE");
  });

  it("el nivel actual no se puede volver a elegir", async () => {
    render(<PrioridadBloque ordenId="o1" prioridad="NORMAL" editable />);

    await userEvent.click(screen.getByRole("button", { name: /Cambiar/ }));

    expect(await screen.findByRole("menuitem", { name: "Normal" })).toHaveAttribute("aria-disabled", "true");
  });

  it("muestra el error de la acción (por ejemplo, si ya no es editable)", async () => {
    mockCambiar.mockResolvedValue({ error: "La orden ya no se puede modificar: no se puede cambiar la prioridad", success: false });
    render(<PrioridadBloque ordenId="o1" prioridad="NORMAL" editable />);

    await userEvent.click(screen.getByRole("button", { name: /Cambiar/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Baja" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("no se puede cambiar la prioridad");
  });

  it("sin permiso de edición no ofrece Cambiar", () => {
    render(<PrioridadBloque ordenId="o1" prioridad="URGENTE" editable={false} />);

    expect(screen.queryByRole("button", { name: /Cambiar/ })).not.toBeInTheDocument();
    expect(screen.getByText(/ya no se puede modificar/)).toBeInTheDocument();
  });
});
