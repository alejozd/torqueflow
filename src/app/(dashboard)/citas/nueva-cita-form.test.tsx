import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/actions/cita-actions", () => ({
  createCitaAction: vi.fn(),
}));

import { NuevaCitaForm } from "./nueva-cita-form";

const vehiculos = [
  { id: "veh-1", placa: "ABC123", marca: "Mazda", modelo: "3", clienteNombre: "Ana Pérez" },
  { id: "veh-2", placa: "XYZ789", marca: "Renault", modelo: "Logan", clienteNombre: "Beto Ruiz" },
];

describe("NuevaCitaForm", () => {
  it("renders one option per vehículo, labelled with placa and cliente", async () => {
    render(<NuevaCitaForm vehiculos={vehiculos} />);

    // Vehículo is a Combobox now (search-as-you-type), not a native <select>
    // -- options only mount in the DOM once the popup is open.
    await userEvent.click(screen.getByLabelText("Vehículo"));

    expect(await screen.findByRole("option", { name: "ABC123 — Mazda 3 (Ana Pérez)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "XYZ789 — Renault Logan (Beto Ruiz)" })).toBeInTheDocument();
  });

  it("renders the fecha, motivo and notas fields", () => {
    render(<NuevaCitaForm vehiculos={vehiculos} />);

    expect(screen.getByLabelText("Fecha y hora")).toHaveAttribute("type", "datetime-local");
    expect(screen.getByLabelText("Motivo")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agendar cita" })).toBeInTheDocument();
  });

  it("explains the empty state instead of rendering a useless empty select", () => {
    render(<NuevaCitaForm vehiculos={[]} />);

    expect(screen.getByText("Registra un cliente y su vehículo antes de agendar una cita.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agendar cita" })).not.toBeInTheDocument();
  });
});
