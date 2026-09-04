import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockUpdateVehiculoAction = vi.fn();
vi.mock("@/app/actions/vehiculo-actions", () => ({
  updateVehiculoAction: (...args: unknown[]) => mockUpdateVehiculoAction(...args),
}));

import { EditarVehiculoForm } from "./editar-vehiculo-form";

// EditarVehiculoForm renders a DialogClose-wrapped Cancel button that
// requires a Dialog ancestor (same as every dialog-only form in this app) --
// render through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

const vehiculo = {
  id: "v1",
  placa: "ABC123",
  marca: "Toyota",
  modelo: "Corolla",
  marcaId: null,
  modeloId: null,
  color: "Rojo",
  anio: 2020,
  combustible: "GASOLINA" as const,
  kilometraje: 45000,
  proximoMantenimiento: new Date("2026-12-01T00:00:00.000Z"),
  transmision: "AUTOMATICA" as const,
  observaciones: "Rines de posventa",
  clienteId: "c1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("EditarVehiculoForm", () => {
  beforeEach(() => {
    mockUpdateVehiculoAction.mockReset();
    mockUpdateVehiculoAction.mockResolvedValue({ error: null, success: true });
  });

  it("prefills every field with the vehiculo's current values", () => {
    renderInDialog(<EditarVehiculoForm vehiculo={vehiculo} />);

    expect(screen.getByLabelText("Placa")).toHaveValue("ABC123");
    expect(screen.getByLabelText("Marca")).toHaveValue("Toyota");
    expect(screen.getByLabelText("Modelo")).toHaveValue("Corolla");
    expect(screen.getByLabelText("Año")).toHaveValue(2020);
    expect(screen.getByRole("combobox", { name: "Combustible" })).toHaveTextContent("Gasolina");
    expect(screen.getByLabelText("Kilometraje")).toHaveValue(45000);
    expect(screen.getByLabelText("Próximo mantenimiento")).toHaveValue("2026-12-01");
    expect(screen.getByRole("combobox", { name: "Transmisión" })).toHaveTextContent("Automática");
    expect(screen.getByLabelText("Observaciones del vehículo")).toHaveValue("Rines de posventa");
  });

  it("shows a success message after a successful submit", async () => {
    renderInDialog(<EditarVehiculoForm vehiculo={vehiculo} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Vehículo actualizado");
  });

  it("shows the error message when the action returns one", async () => {
    mockUpdateVehiculoAction.mockResolvedValue({ error: "Ya existe un registro con ese valor.", success: false });
    renderInDialog(<EditarVehiculoForm vehiculo={vehiculo} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un registro con ese valor.");
  });
});
