import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockUpdateVehiculoAction = vi.fn();
vi.mock("@/app/actions/vehiculo-actions", () => ({
  updateVehiculoAction: (...args: unknown[]) => mockUpdateVehiculoAction(...args),
}));

// Not under test here, but VehiculoFormFields renders NuevaMarcaDialog/
// NuevoModeloDialog unconditionally -- without this mock their real import
// of vehiculo-marca-modelo-actions.ts drags in next-auth server code that
// doesn't resolve under Vitest's environment.
vi.mock("@/app/actions/vehiculo-marca-modelo-actions", () => ({
  crearMarcaVehiculoAction: vi.fn(),
  crearModeloVehiculoAction: vi.fn(),
}));

import { EditarVehiculoForm } from "./editar-vehiculo-form";

// EditarVehiculoForm renders a DialogClose-wrapped Cancel button that
// requires a Dialog ancestor (same as every dialog-only form in this app) --
// render through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

const marcas = [{ id: "m1", nombre: "Toyota", createdAt: new Date() }] as never;
const modelos = [{ id: "mo1", marcaId: "m1", nombre: "Corolla", createdAt: new Date() }] as never;

const vehiculo = {
  id: "v1",
  placa: "ABC123",
  marca: "Toyota",
  modelo: "Corolla",
  marcaId: "m1",
  modeloId: "mo1",
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
    renderInDialog(<EditarVehiculoForm vehiculo={vehiculo} marcas={marcas} modelos={modelos} esAdmin={false} />);

    expect(screen.getByLabelText("Placa")).toHaveValue("ABC123");
    expect(screen.getByRole("combobox", { name: "Marca" })).toHaveValue("Toyota");
    expect(screen.getByRole("combobox", { name: "Modelo" })).toHaveValue("Corolla");
    expect(screen.getByLabelText("Año")).toHaveValue(2020);
    expect(screen.getByRole("combobox", { name: "Combustible" })).toHaveTextContent("Gasolina");
    expect(screen.getByLabelText("Kilometraje")).toHaveValue(45000);
    expect(screen.getByLabelText("Próximo mantenimiento")).toHaveValue("2026-12-01");
    expect(screen.getByRole("combobox", { name: "Transmisión" })).toHaveTextContent("Automática");
    expect(screen.getByLabelText("Observaciones del vehículo")).toHaveValue("Rines de posventa");
  });

  it("shows a success message after a successful submit", async () => {
    renderInDialog(<EditarVehiculoForm vehiculo={vehiculo} marcas={marcas} modelos={modelos} esAdmin={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Vehículo actualizado");
  });

  it("calls onUpdated instead of rendering the inline status message when a successful submit provides it", async () => {
    const onUpdated = vi.fn();
    renderInDialog(
      <EditarVehiculoForm
        vehiculo={vehiculo}
        marcas={marcas}
        modelos={modelos}
        esAdmin={false}
        onUpdated={onUpdated}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the error message when the action returns one", async () => {
    mockUpdateVehiculoAction.mockResolvedValue({ error: "Ya existe un registro con ese valor.", success: false });
    renderInDialog(<EditarVehiculoForm vehiculo={vehiculo} marcas={marcas} modelos={modelos} esAdmin={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un registro con ese valor.");
  });
});
