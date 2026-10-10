import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCrearMarca = vi.fn();
vi.mock("@/app/actions/vehiculo-marca-modelo-actions", () => ({
  crearMarcaVehiculoAction: (...args: unknown[]) => mockCrearMarca(...args),
}));

import { NuevaMarcaDialog } from "./nueva-marca-dialog";

describe("NuevaMarcaDialog", () => {
  it("does not call the server with a blank nombre and says why", async () => {
    render(<NuevaMarcaDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Agregar marca" }));

    expect(mockCrearMarca).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("El nombre es obligatorio");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
  });
});
