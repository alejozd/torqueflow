import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockCreateVehiculoAction = vi.fn();
vi.mock("@/app/actions/vehiculo-actions", () => ({
  createVehiculoAction: (...args: unknown[]) => mockCreateVehiculoAction(...args),
}));

const mockCreateClienteAction = vi.fn();
vi.mock("@/app/actions/cliente-actions", () => ({
  createClienteAction: (...args: unknown[]) => mockCreateClienteAction(...args),
}));

// Not under test here, but VehiculoFormFields renders NuevaMarcaDialog/
// NuevoModeloDialog unconditionally -- without this mock their real import
// of vehiculo-marca-modelo-actions.ts drags in next-auth server code that
// doesn't resolve under Vitest's environment (same note as
// clientes/[id]/nuevo-vehiculo-form.test.tsx).
vi.mock("@/app/actions/vehiculo-marca-modelo-actions", () => ({
  crearMarcaVehiculoAction: vi.fn(),
  crearModeloVehiculoAction: vi.fn(),
}));

import { ClientVehicleSelector } from "./client-vehicle-selector";
import type { ClienteParaOrden } from "@/app/actions/cliente-actions";

function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

const marcas = [{ id: "m1", nombre: "Toyota", createdAt: new Date() }] as never;
const modelos = [{ id: "mo1", marcaId: "m1", nombre: "Corolla", createdAt: new Date() }] as never;

function baseClientes(): ClienteParaOrden[] {
  return [
    {
      id: "c1",
      nombre: "Ana Pérez",
      vehiculos: [{ id: "v1", placa: "ABC123", marca: "Toyota", modelo: "Corolla", kilometrajeActual: 78420 }],
    },
    { id: "c2", nombre: "María Gómez", vehiculos: [] },
  ];
}

async function selectCombobox(labelText: string, optionName: string | RegExp) {
  await userEvent.click(screen.getByLabelText(labelText));
  await userEvent.click(await screen.findByRole("option", { name: optionName }));
}

function Harness({
  initialClientes,
  onSelected,
}: {
  initialClientes: ClienteParaOrden[];
  onSelected?: (clienteId: string, vehiculoId: string) => void;
}) {
  const [clientes, setClientes] = useState(initialClientes);
  const [clienteId, setClienteId] = useState("");
  const [vehiculoId, setVehiculoId] = useState("");

  return (
    <ClientVehicleSelector
      clientes={clientes}
      onClientesChange={(updater: (prev: ClienteParaOrden[]) => ClienteParaOrden[]) =>
        setClientes((prev: ClienteParaOrden[]) => updater(prev))
      }
      clienteId={clienteId}
      vehiculoId={vehiculoId}
      onClienteIdChange={(id: string) => {
        setClienteId(id);
        onSelected?.(id, vehiculoId);
      }}
      onVehiculoIdChange={(id: string) => {
        setVehiculoId(id);
        onSelected?.(clienteId, id);
      }}
      marcas={marcas}
      modelos={modelos}
      esAdmin={false}
    />
  );
}

describe("ClientVehicleSelector", () => {
  beforeEach(() => {
    mockCreateVehiculoAction.mockReset();
    mockCreateClienteAction.mockReset();
  });

  it("renders Cliente and Vehículo comboboxes, the latter disabled until a cliente is chosen", () => {
    renderInDialog(<Harness initialClientes={baseClientes()} />);

    expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
    expect(screen.getByLabelText("Vehículo")).toBeDisabled();
  });

  it("shows each cliente's vehicle count, or 'Sin vehículos' when it has none", async () => {
    renderInDialog(<Harness initialClientes={baseClientes()} />);

    await userEvent.click(screen.getByLabelText("Cliente"));

    expect(await screen.findByRole("option", { name: /Ana Pérez.*1 vehículo/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /María Gómez.*Sin vehículos/ })).toBeInTheDocument();
  });

  it("shows a warning and a 'crear vehículo' action when the selected cliente has none", async () => {
    renderInDialog(<Harness initialClientes={baseClientes()} />);

    await selectCombobox("Cliente", /Ana Pérez/);
    expect(screen.queryByText(/no tiene vehículos registrados/)).not.toBeInTheDocument();

    await selectCombobox("Cliente", /María Gómez/);
    expect(screen.getByText("María Gómez no tiene vehículos registrados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear vehículo para este cliente" })).toBeInTheDocument();
  });

  it("creates a vehículo for the selected cliente, selects it, and clears the warning", async () => {
    mockCreateVehiculoAction.mockResolvedValue({
      error: null,
      success: true,
      vehiculo: { id: "v2", placa: "XYZ789", marca: "Toyota", modelo: "Corolla", kilometraje: 1000 },
    });
    const onSelected = vi.fn();
    renderInDialog(<Harness initialClientes={baseClientes()} onSelected={onSelected} />);

    await selectCombobox("Cliente", /María Gómez/);
    await userEvent.click(screen.getByRole("button", { name: "Crear vehículo para este cliente" }));

    expect(await screen.findByLabelText("Placa")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Placa"), "XYZ789");
    await userEvent.click(screen.getByRole("combobox", { name: "Marca" }));
    await userEvent.click(await screen.findByRole("option", { name: "Toyota" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Modelo" }));
    await userEvent.click(await screen.findByRole("option", { name: "Corolla" }));
    await userEvent.click(screen.getByRole("button", { name: "Agregar vehículo" }));

    await waitFor(() => expect(onSelected).toHaveBeenCalledWith("c2", "v2"));
    expect(screen.queryByText(/no tiene vehículos registrados/)).not.toBeInTheDocument();
  });

  it("opens a 'crear cliente' dialog from the selector", async () => {
    renderInDialog(<Harness initialClientes={baseClientes()} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear cliente nuevo" }));

    expect(await screen.findByLabelText("Nombre")).toBeInTheDocument();
  });

  it("creates a cliente, selects it, and chains straight into the crear-vehículo dialog since it has none", async () => {
    mockCreateClienteAction.mockResolvedValue({
      error: null,
      success: true,
      cliente: { id: "c3", nombre: "Luis Torres" },
    });
    const onSelected = vi.fn();
    renderInDialog(<Harness initialClientes={baseClientes()} onSelected={onSelected} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear cliente nuevo" }));
    await userEvent.type(await screen.findByLabelText("Nombre"), "Luis Torres");
    await userEvent.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(onSelected).toHaveBeenCalledWith("c3", ""));
    // Chains into the vehículo dialog automatically -- the fresh cliente is
    // guaranteed to have zero vehículos.
    expect(await screen.findByLabelText("Placa")).toBeInTheDocument();
  });
});
