import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

const marcas = [{ id: "m1", nombre: "Toyota", createdAt: new Date() }] as never;
const modelos = [{ id: "mo1", marcaId: "m1", nombre: "Corolla", createdAt: new Date() }] as never;

/** Marca and Modelo are catalog-only Combobox fields now (no free-text fallback). */
async function seleccionarMarcaYModelo() {
  await userEvent.click(screen.getByRole("combobox", { name: "Marca" }));
  await userEvent.click(await screen.findByRole("option", { name: "Toyota" }));
  await userEvent.click(screen.getByRole("combobox", { name: "Modelo" }));
  await userEvent.click(await screen.findByRole("option", { name: "Corolla" }));
}

describe("NuevoVehiculoForm", () => {
  beforeEach(() => {
    mockCreateVehiculoAction.mockReset();
    mockCreateVehiculoAction.mockResolvedValue({
      error: null,
      success: true,
      vehiculo: { id: "v1", placa: "ABC123" },
    });
  });

  it("renders placa, marca, modelo, anio fields", () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={marcas} modelos={modelos} esAdmin={false} />);

    expect(screen.getByLabelText("Placa")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Marca" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Modelo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Año")).toBeInTheDocument();
  });

  it("does not render free-text Marca/Modelo inputs -- catalog selection only", () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={marcas} modelos={modelos} esAdmin={false} />);

    // The Combobox's own input has role="combobox", not "textbox" -- asserting
    // there's no plain text field left for either label pins down that the
    // old free-text <Input> was actually removed, not just hidden visually.
    expect(screen.queryByRole("textbox", { name: "Marca" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Modelo" })).not.toBeInTheDocument();
  });

  it("disables the Modelo combobox until a marca is selected", async () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={marcas} modelos={modelos} esAdmin={false} />);

    expect(screen.getByRole("combobox", { name: "Modelo" })).toBeDisabled();

    await userEvent.click(screen.getByRole("combobox", { name: "Marca" }));
    await userEvent.click(await screen.findByRole("option", { name: "Toyota" }));

    expect(screen.getByRole("combobox", { name: "Modelo" })).toBeEnabled();
  });

  it("renders the vehicle detail fields (combustible, kilometraje, proximo mantenimiento, transmision, observaciones)", () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={marcas} modelos={modelos} esAdmin={false} />);

    expect(screen.getByLabelText("Combustible")).toBeInTheDocument();
    expect(screen.getByLabelText("Kilometraje")).toBeInTheDocument();
    expect(screen.getByLabelText("Próximo mantenimiento")).toBeInTheDocument();
    expect(screen.getByLabelText("Transmisión")).toBeInTheDocument();
    expect(screen.getByLabelText("Observaciones del vehículo")).toBeInTheDocument();
  });

  it("submits the detail fields to createVehiculoAction when filled", async () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={marcas} modelos={modelos} esAdmin={false} />);

    await userEvent.type(screen.getByLabelText("Placa"), "ABC123");
    await seleccionarMarcaYModelo();
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
    expect(formData.get("marca")).toBe("Toyota");
    expect(formData.get("modelo")).toBe("Corolla");
    expect(formData.get("marcaId")).toBe("m1");
    expect(formData.get("modeloId")).toBe("mo1");
    expect(formData.get("combustible")).toBe("GASOLINA");
    expect(formData.get("kilometraje")).toBe("78420");
    expect(formData.get("proximoMantenimiento")).toBe("2026-12-01");
    expect(formData.get("transmision")).toBe("AUTOMATICA");
    expect(formData.get("observaciones")).toBe("Rines de posventa, llave de repuesto en recepción");
  });

  it("shows a success message after a successful submit", async () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={marcas} modelos={modelos} esAdmin={false} />);

    await userEvent.type(screen.getByLabelText("Placa"), "ABC123");
    await seleccionarMarcaYModelo();
    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Vehículo agregado");
  });

  it("calls onCreated instead of rendering the inline status message when a successful submit provides it", async () => {
    const onCreated = vi.fn();
    renderInDialog(
      <NuevoVehiculoForm clienteId="c1" marcas={marcas} modelos={modelos} esAdmin={false} onCreated={onCreated} />,
    );

    await userEvent.type(screen.getByLabelText("Placa"), "ABC123");
    await seleccionarMarcaYModelo();
    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith({ id: "v1", placa: "ABC123" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("blocks submission and shows field errors when required fields are empty, without calling the server", async () => {
    renderInDialog(<NuevoVehiculoForm clienteId="c1" marcas={marcas} modelos={modelos} esAdmin={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    expect(await screen.findByText("La placa es obligatoria")).toBeInTheDocument();
    expect(mockCreateVehiculoAction).not.toHaveBeenCalled();
  });
});
