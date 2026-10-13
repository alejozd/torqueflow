import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAgregar = vi.fn();
const mockQuitar = vi.fn();
vi.mock("@/app/actions/recepcion-actions", () => ({
  agregarGarantiaAction: (...args: unknown[]) => mockAgregar(...args),
  quitarGarantiaAction: (...args: unknown[]) => mockQuitar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GarantiasSection } from "./garantias-section";

const TRABAJO = { id: "m1", descripcion: "Cambio de aceite" };
const REPUESTO = { id: "i1", descripcion: "Filtro ×2" };

function renderSection(props: Partial<Parameters<typeof GarantiasSection>[0]> = {}) {
  return render(
    <GarantiasSection
      ordenId="o1"
      garantias={[]}
      lineasTrabajo={[TRABAJO]}
      lineasRepuesto={[REPUESTO]}
      soloLectura={false}
      puedeQuitar
      {...props}
    />,
  );
}

describe("GarantiasSection", () => {
  beforeEach(() => {
    mockAgregar.mockReset().mockResolvedValue({ error: null, success: true });
    mockQuitar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("sin garantías lo dice", () => {
    renderSection();

    expect(screen.getByText("Sin garantías registradas.")).toBeInTheDocument();
  });

  it("lista las garantías con su línea y su cobertura", () => {
    renderSection({
      garantias: [
        {
          id: "g1",
          tipo: "TRABAJO",
          descripcion: "Cambio de aceite",
          linea: "Cambio de aceite",
          cubreHasta: new Date("2027-03-15T00:00:00.000Z"),
          cubreHastaKm: 95000,
          nota: "Cubre mano de obra y filtro",
        },
      ],
    });

    expect(screen.getByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.getByText(/Trabajo · Cambio de aceite/)).toBeInTheDocument();
    expect(screen.getByText(/hasta 95.000 km/)).toBeInTheDocument();
    expect(screen.getByText(/Cubre mano de obra y filtro/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quitar garantía de Cambio de aceite/ })).toBeInTheDocument();
  });

  it("registra una garantía de trabajo sobre la línea elegida", async () => {
    renderSection();

    await userEvent.type(screen.getByLabelText("Qué cubre"), "Cambio de aceite");
    await userEvent.click(screen.getByLabelText("Trabajo"));
    await userEvent.click(await screen.findByRole("option", { name: "Cambio de aceite" }));
    await userEvent.type(screen.getByLabelText("Hasta (km)"), "95000");
    await userEvent.click(screen.getByRole("button", { name: "Registrar garantía" }));

    expect(mockAgregar).toHaveBeenCalledTimes(1);
    const formData = mockAgregar.mock.calls[0]![2] as FormData;
    expect(formData.get("tipo")).toBe("TRABAJO");
    expect(formData.get("manoDeObraId")).toBe("m1");
    expect(formData.get("descripcion")).toBe("Cambio de aceite");
    expect(formData.get("cubreHastaKm")).toBe("95000");
  });

  it("al cambiar a repuesto ofrece las líneas de repuestos y su campo", async () => {
    renderSection();

    await userEvent.click(screen.getByLabelText("Cubre"));
    await userEvent.click(await screen.findByRole("option", { name: "Repuesto" }));

    expect(screen.getByLabelText("Repuesto")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Repuesto"));
    expect(await screen.findByRole("option", { name: "Filtro ×2" })).toBeInTheDocument();
  });

  it("sin líneas que cubrir no ofrece el formulario", () => {
    renderSection({ lineasTrabajo: [], lineasRepuesto: [] });

    expect(screen.getByText("La orden no tiene líneas de mano de obra todavía.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar garantía" })).not.toBeInTheDocument();
  });

  it("en solo lectura no se registra ni se quita", () => {
    renderSection({
      soloLectura: true,
      garantias: [
        {
          id: "g1",
          tipo: "REPUESTO",
          descripcion: "Filtro",
          linea: "Filtro ×2",
          cubreHasta: null,
          cubreHastaKm: null,
          nota: null,
        },
      ],
    });

    expect(screen.getByText(/Sin cobertura \(informativa\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar garantía" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
  });
});
