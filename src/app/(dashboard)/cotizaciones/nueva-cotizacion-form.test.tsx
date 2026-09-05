import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockCrearCotizacionAction = vi.fn();
vi.mock("@/app/actions/cotizacion-actions", () => ({
  crearCotizacionAction: (...args: unknown[]) => mockCrearCotizacionAction(...args),
}));

import { NuevaCotizacionForm } from "./nueva-cotizacion-form";

// NuevaCotizacionForm renders a DialogClose-wrapped Cancel button that
// requires a Dialog ancestor (same as every dialog-only form in this app).
function renderInDialog(ui: Parameters<typeof render>[0]) {
  return render(<Dialog open>{ui}</Dialog>);
}

const vehiculos = [
  { id: "v1", placa: "WGT-451", marca: "Mazda", modelo: "3", clienteNombre: "María Gómez" },
  { id: "v2", placa: "PLR-902", marca: "Renault", modelo: "Duster", clienteNombre: "Jorge Cardona" },
];

describe("NuevaCotizacionForm", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCrearCotizacionAction.mockReset();
  });

  it("shows the empty-state message instead of a useless empty picker", () => {
    renderInDialog(<NuevaCotizacionForm vehiculos={[]} />);

    expect(
      screen.getByText("No hay vehículos registrados. Registra un vehículo antes de cotizar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear cotización" })).not.toBeInTheDocument();
  });

  it("lists every vehículo by placa, cliente, and modelo once the picker is open", async () => {
    renderInDialog(<NuevaCotizacionForm vehiculos={vehiculos} />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: /WGT-451 — María Gómez/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /PLR-902 — Jorge Cardona/ })).toBeInTheDocument();
  });

  it("filters the vehículo options by cliente, placa, or modelo as you type", async () => {
    renderInDialog(<NuevaCotizacionForm vehiculos={vehiculos} />);

    await userEvent.type(screen.getByRole("combobox"), "Duster");

    expect(await screen.findByRole("option", { name: /PLR-902 — Jorge Cardona/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /WGT-451/ })).not.toBeInTheDocument();
  });

  it("requires a motivo before submitting", async () => {
    renderInDialog(<NuevaCotizacionForm vehiculos={vehiculos} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: /WGT-451/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear cotización" }));

    expect(await screen.findByText("El motivo es obligatorio")).toBeInTheDocument();
    expect(mockCrearCotizacionAction).not.toHaveBeenCalled();
  });

  it("submits vehiculoId and motivo and navigates to the new cotización on success", async () => {
    mockCrearCotizacionAction.mockResolvedValue({ error: null, success: true, cotizacionId: "q1" });
    renderInDialog(<NuevaCotizacionForm vehiculos={vehiculos} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: /PLR-902 — Jorge Cardona/ }));
    await userEvent.type(screen.getByLabelText("Motivo"), "Revisión de frenos");
    await userEvent.click(screen.getByRole("button", { name: "Crear cotización" }));

    expect(mockCrearCotizacionAction).toHaveBeenCalledWith(
      { error: null, success: false, cotizacionId: null },
      expect.any(FormData),
    );
    const [, formData] = mockCrearCotizacionAction.mock.calls[0] as [unknown, FormData];
    expect(formData.get("vehiculoId")).toBe("v2");
    expect(formData.get("motivo")).toBe("Revisión de frenos");
    expect(mockPush).toHaveBeenCalledWith("/cotizaciones/q1");
  });

  it("shows the server error and does not navigate when the action fails", async () => {
    mockCrearCotizacionAction.mockResolvedValue({ error: "El vehículo seleccionado no existe.", success: false, cotizacionId: null });
    renderInDialog(<NuevaCotizacionForm vehiculos={vehiculos} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: /WGT-451/ }));
    await userEvent.type(screen.getByLabelText("Motivo"), "Revisión de frenos");
    await userEvent.click(screen.getByRole("button", { name: "Crear cotización" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El vehículo seleccionado no existe.");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
