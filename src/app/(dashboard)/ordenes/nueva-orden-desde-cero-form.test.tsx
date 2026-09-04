import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockCreateOrdenDesdeVehiculoAction = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({
  createOrdenDesdeVehiculoAction: (...args: unknown[]) => mockCreateOrdenDesdeVehiculoAction(...args),
}));

// Not under test here, but ClientVehicleSelector renders NuevoVehiculoForm/
// NuevoClienteForm unconditionally (their dialogs just start closed) -- these
// mocks keep their real server actions (and vehiculo-marca-modelo-actions.ts,
// pulled in by VehiculoFormFields) from dragging in next-auth server code
// that doesn't resolve under Vitest's environment (same note as
// clientes/[id]/nuevo-vehiculo-form.test.tsx).
vi.mock("@/app/actions/vehiculo-actions", () => ({
  createVehiculoAction: vi.fn(),
}));
vi.mock("@/app/actions/cliente-actions", () => ({
  createClienteAction: vi.fn(),
}));
vi.mock("@/app/actions/vehiculo-marca-modelo-actions", () => ({
  crearMarcaVehiculoAction: vi.fn(),
  crearModeloVehiculoAction: vi.fn(),
}));

import { NuevaOrdenDesdeCeroForm } from "./nueva-orden-desde-cero-form";

const marcas = [] as never;
const modelos = [] as never;

// NuevaOrdenDesdeCeroForm renders a DialogClose-wrapped Cancel button that
// requires a Dialog ancestor (same as every dialog-only form in this app) --
// render through a real Dialog instead of the bare component.
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

const tecnicos = [{ id: "t1", nombre: "Carlos Ruiz" }];
const clientes = [
  {
    id: "c1",
    nombre: "Ana Pérez",
    vehiculos: [{ id: "v1", placa: "ABC123", marca: "Toyota", modelo: "Corolla", kilometrajeActual: 78420 }],
  },
  {
    id: "c2",
    nombre: "María Gómez",
    vehiculos: [] as {
      id: string;
      placa: string;
      marca: string;
      modelo: string;
      kilometrajeActual: number | null;
    }[],
  },
];

// Cliente/Vehículo are Combobox controls now (search-as-you-type), not
// native <select> -- options only mount in the DOM once the popup is open.
async function selectCombobox(labelText: string, optionName: string | RegExp) {
  await userEvent.click(screen.getByLabelText(labelText));
  await userEvent.click(await screen.findByRole("option", { name: optionName }));
}

describe("NuevaOrdenDesdeCeroForm", () => {
  beforeEach(() => {
    mockCreateOrdenDesdeVehiculoAction.mockReset();
    mockCreateOrdenDesdeVehiculoAction.mockResolvedValue({ error: null, success: true });
  });

  it("renders cliente, vehiculo, kilometraje, sintomas, and mecanico fields", async () => {
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} />);

    expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
    expect(screen.getByLabelText("Vehículo")).toBeInTheDocument();
    expect(screen.getByLabelText("Kilometraje de ingreso")).toBeInTheDocument();
    expect(screen.getByLabelText("Síntomas reportados")).toBeInTheDocument();
    expect(screen.getByLabelText("Mecánico asignado")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Cliente"));
    expect(await screen.findByRole("option", { name: /Ana Pérez/ })).toBeInTheDocument();
  });

  it("disables the vehiculo select until a cliente is chosen", () => {
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} />);

    expect(screen.getByLabelText("Vehículo")).toBeDisabled();
  });

  it("narrows the vehiculo options to the selected cliente's own vehiculos", async () => {
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} />);

    await selectCombobox("Cliente", /Ana Pérez/);

    expect(screen.getByLabelText("Vehículo")).not.toBeDisabled();
    await userEvent.click(screen.getByLabelText("Vehículo"));
    expect(await screen.findByRole("option", { name: "ABC123 · Toyota Corolla" })).toBeInTheDocument();
  });

  it("shows the vehículo's last known kilometraje once it is selected, as a hint for kilometraje de ingreso", async () => {
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} />);

    expect(screen.queryByText(/Último kilometraje registrado/)).not.toBeInTheDocument();

    await selectCombobox("Cliente", /Ana Pérez/);
    await selectCombobox("Vehículo", "ABC123 · Toyota Corolla");

    expect(screen.getByText("Último kilometraje registrado: 78.420 km")).toBeInTheDocument();
  });

  it("shows a warning and a way to create a vehiculo instead of a dead end when the selected cliente has none", async () => {
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} />);

    await selectCombobox("Cliente", /María Gómez/);

    expect(screen.getByText("María Gómez no tiene vehículos registrados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear vehículo para este cliente" })).toBeInTheDocument();
  });

  it("blocks submission without a cliente/vehiculo selection, without calling the server", async () => {
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(await screen.findByText("Selecciona un cliente")).toBeInTheDocument();
    expect(mockCreateOrdenDesdeVehiculoAction).not.toHaveBeenCalled();
  });

  it("submits the selected vehiculo and calls onCreated instead of leaving a stale form behind", async () => {
    const onCreated = vi.fn();
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} onCreated={onCreated} />);

    await selectCombobox("Cliente", /Ana Pérez/);
    await selectCombobox("Vehículo", "ABC123 · Toyota Corolla");
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    // onCreated fires instead of a lingering success message -- there is
    // nothing left on screen inviting a second, duplicate submit.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const formData = mockCreateOrdenDesdeVehiculoAction.mock.calls[0]![1] as FormData;
    expect(formData.get("vehiculoId")).toBe("v1");
  });

  it("falls back to a visible success message when rendered without onCreated", async () => {
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} />);

    await selectCombobox("Cliente", /Ana Pérez/);
    await selectCombobox("Vehículo", "ABC123 · Toyota Corolla");
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Orden creada");
  });

  it("shows the error message when the action returns one", async () => {
    mockCreateOrdenDesdeVehiculoAction.mockResolvedValue({ error: "El vehículo seleccionado no existe.", success: false });
    renderInDialog(<NuevaOrdenDesdeCeroForm clientes={clientes} tecnicos={tecnicos} marcas={marcas} modelos={modelos} esAdmin={false} />);

    await selectCombobox("Cliente", /Ana Pérez/);
    await selectCombobox("Vehículo", "ABC123 · Toyota Corolla");
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El vehículo seleccionado no existe.");
  });
});
