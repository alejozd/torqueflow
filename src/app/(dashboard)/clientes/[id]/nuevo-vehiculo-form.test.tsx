import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockCreateVehiculoAction = vi.fn();
vi.mock("@/app/actions/vehiculo-actions", () => ({
  createVehiculoAction: (...args: unknown[]) => mockCreateVehiculoAction(...args),
}));

// Not under test here, but VehiculoFormFields renders NuevaMarcaDialog/
// NuevoModeloDialog unconditionally -- without this mock their real import
// of vehiculo-marca-modelo-actions.ts drags in next-auth server code that
// doesn't resolve under Vitest's environment.
vi.mock("@/app/actions/vehiculo-marca-modelo-actions", () => ({
  crearMarcaVehiculoAction: vi.fn(),
  crearModeloVehiculoAction: vi.fn(),
}));

import { NuevoVehiculoForm } from "./nuevo-vehiculo-form";

// NuevoVehiculoForm renders a DialogClose-wrapped Cancel button that
// requires a Dialog ancestor (same as every dialog-only form in this app) --
// render through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

describe("NuevoVehiculoForm", () => {
  beforeEach(() => {
    mockCreateVehiculoAction.mockReset();
    mockCreateVehiculoAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders placa, marca, modelo, anio fields", () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={[]} modelos={[]} esAdmin={false} />);

    expect(screen.getByLabelText("Placa")).toBeInTheDocument();
    expect(screen.getByLabelText("Marca")).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo")).toBeInTheDocument();
    expect(screen.getByLabelText("Año")).toBeInTheDocument();
  });

  it("renders the vehicle detail fields (combustible, kilometraje, proximo mantenimiento, transmision, observaciones)", () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={[]} modelos={[]} esAdmin={false} />);

    expect(screen.getByLabelText("Combustible")).toBeInTheDocument();
    expect(screen.getByLabelText("Kilometraje")).toBeInTheDocument();
    expect(screen.getByLabelText("Próximo mantenimiento")).toBeInTheDocument();
    expect(screen.getByLabelText("Transmisión")).toBeInTheDocument();
    expect(screen.getByLabelText("Observaciones del vehículo")).toBeInTheDocument();
  });

  it("submits the detail fields to createVehiculoAction when filled", async () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={[]} modelos={[]} esAdmin={false} />);

    await userEvent.type(screen.getByLabelText("Placa"), "ABC123");
    await userEvent.type(screen.getByLabelText("Marca"), "Toyota");
    await userEvent.type(screen.getByLabelText("Modelo"), "Corolla");
    await userEvent.click(screen.getByRole("combobox", { name: "Combustible" }));
    await userEvent.click(await screen.findByRole("option", { name: "Gasolina" }));
    await userEvent.type(screen.getByLabelText("Kilometraje"), "78420");
    await userEvent.type(screen.getByLabelText("Próximo mantenimiento"), "2026-12-01");
    await userEvent.click(screen.getByRole("combobox", { name: "Transmisión" }));
    await userEvent.click(await screen.findByRole("option", { name: "Automática" }));
    await userEvent.type(
      screen.getByLabelText("Observaciones del vehículo"),
      "Rines de posventa, llave de repuesto en recepción",
    );
    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Vehículo agregado");
    const formData = mockCreateVehiculoAction.mock.calls[0]![2] as FormData;
    expect(formData.get("combustible")).toBe("GASOLINA");
    expect(formData.get("kilometraje")).toBe("78420");
    expect(formData.get("proximoMantenimiento")).toBe("2026-12-01");
    expect(formData.get("transmision")).toBe("AUTOMATICA");
    expect(formData.get("observaciones")).toBe("Rines de posventa, llave de repuesto en recepción");
  });

  it("shows a success message after a successful submit", async () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={[]} modelos={[]} esAdmin={false} />);

    await userEvent.type(screen.getByLabelText("Placa"), "ABC123");
    await userEvent.type(screen.getByLabelText("Marca"), "Toyota");
    await userEvent.type(screen.getByLabelText("Modelo"), "Corolla");
    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Vehículo agregado");
  });

  it("blocks submission and shows field errors when required fields are empty, without calling the server", async () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={[]} modelos={[]} esAdmin={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    expect(await screen.findByText("La placa es obligatoria")).toBeInTheDocument();
    expect(mockCreateVehiculoAction).not.toHaveBeenCalled();
  });
});
