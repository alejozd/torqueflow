import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockCreateVehiculoAction = vi.fn();
vi.mock("@/app/actions/vehiculo-actions", () => ({
  createVehiculoAction: (...args: unknown[]) => mockCreateVehiculoAction(...args),
}));

import { NuevoVehiculoForm } from "./nuevo-vehiculo-form";

describe("NuevoVehiculoForm", () => {
  beforeEach(() => {
    mockCreateVehiculoAction.mockReset();
    mockCreateVehiculoAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders placa, marca, modelo, anio fields", () => {
    render(<NuevoVehiculoForm clienteId="c1" />);

    expect(screen.getByLabelText("Placa")).toBeInTheDocument();
    expect(screen.getByLabelText("Marca")).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toBeInTheDocument();
    expect(screen.getByLabelText("Año")).toBeInTheDocument();
  });

  it("shows a success message after a successful submit", async () => {
    render(<NuevoVehiculoForm clienteId="c1" />);

    await userEvent.type(screen.getByLabelText("Placa"), "ABC123");
    await userEvent.type(screen.getByLabelText("Marca"), "Toyota");
    await userEvent.type(screen.getByLabelText("Modelo"), "Corolla");
    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Vehículo agregado");
  });
});
