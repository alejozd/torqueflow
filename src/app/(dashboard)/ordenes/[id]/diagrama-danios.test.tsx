import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockAgregar = vi.fn();
const mockQuitar = vi.fn();
vi.mock("@/app/actions/recepcion-actions", () => ({
  agregarDanioAction: (...args: unknown[]) => mockAgregar(...args),
  quitarDanioAction: (...args: unknown[]) => mockQuitar(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DiagramaDanios } from "./diagrama-danios";

const DANIOS = [
  { id: "d1", zona: "CAPO" as const, tipo: "GOLPE" as const, nota: "Leve" },
  { id: "d2", zona: "PUERTA_DERECHA" as const, tipo: "RAYON" as const, nota: null },
];

function renderDiagrama(props: Partial<Parameters<typeof DiagramaDanios>[0]> = {}) {
  return render(
    <DiagramaDanios ordenId="o1" tipoVehiculo="CARRO" danios={[]} soloLectura={false} puedeQuitar {...props} />,
  );
}

describe("DiagramaDanios", () => {
  beforeEach(() => {
    mockAgregar.mockReset().mockResolvedValue({ error: null, success: true });
    mockQuitar.mockReset().mockResolvedValue({ error: null, success: true });
  });

  it("pinta las zonas de la figura con su nombre accesible", () => {
    renderDiagrama();

    expect(screen.getByRole("button", { name: "Capó" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Puerta izquierda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rines" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manubrio" })).not.toBeInTheDocument();
  });

  it("marca la zona que se toca en la silueta", async () => {
    renderDiagrama();

    await userEvent.click(screen.getByRole("button", { name: "Techo" }));
    await userEvent.click(screen.getByRole("button", { name: "Marcar daño" }));

    expect(mockAgregar).toHaveBeenCalledTimes(1);
    const formData = mockAgregar.mock.calls[0]![2] as FormData;
    expect(formData.get("zona")).toBe("TECHO");
    expect(formData.get("tipo")).toBe("GOLPE");
  });

  it("lista las marcas con su daño y su nota, y las resalta en la figura", () => {
    renderDiagrama({ danios: DANIOS });

    const lista = screen.getByRole("list", { name: "Daños marcados" });
    expect(within(lista).getByText("Capó")).toBeInTheDocument();
    expect(within(lista).getByText("Golpe")).toBeInTheDocument();
    expect(within(lista).getByText(/Leve/)).toBeInTheDocument();
    expect(within(lista).getByText("Rayón")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capó (con daño marcado)" })).toBeInTheDocument();
  });

  it("la figura dice hacia dónde mira y cuántos daños tiene cada zona", () => {
    renderDiagrama({ danios: [...DANIOS, { id: "d3", zona: "CAPO" as const, tipo: "RAYON" as const, nota: null }] });

    const figura = screen.getByRole("group", { name: /Diagrama de daños del vehículo: Carro/ });
    expect(within(figura).getByText("▲ Adelante")).toBeInTheDocument();
    expect(within(figura).getByText("Atrás")).toBeInTheDocument();
    // Capó tiene dos marcas y la puerta derecha una: el contador las cuenta.
    expect(within(figura).getByText("2")).toBeInTheDocument();
    expect(within(figura).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Leyenda del diagrama" })).toHaveTextContent("Con daño");
  });

  it("al tocar una zona del dibujo, el formulario dice cuál quedó elegida", async () => {
    renderDiagrama();

    await userEvent.click(screen.getByRole("button", { name: "Techo" }));

    expect(screen.getByText("Zona elegida:").parentElement).toHaveTextContent("Zona elegida: Techo");
    expect(screen.getByRole("button", { name: "Techo" })).toHaveAttribute("aria-pressed", "true");
  });

  it("la moto se dibuja de lado, con su propia orientación", () => {
    renderDiagrama({ tipoVehiculo: "MOTO" });

    const figura = screen.getByRole("group", { name: /Moto/ });
    expect(within(figura).getByText("◀ Adelante")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manubrio" })).toBeInTheDocument();
  });

  it("en solo lectura no deja marcar ni quitar", () => {
    renderDiagrama({ danios: DANIOS, soloLectura: true });

    expect(screen.queryByRole("button", { name: "Marcar daño" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
  });

  it("sin marcas lo dice", () => {
    renderDiagrama();

    expect(screen.getByText("Sin daños marcados.")).toBeInTheDocument();
  });

  it("muestra el error de la action", async () => {
    mockAgregar.mockResolvedValue({ error: "Esa zona ya está marcada con ese mismo daño", success: false });
    renderDiagrama();

    await userEvent.click(screen.getByRole("button", { name: "Marcar daño" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa zona ya está marcada con ese mismo daño");
  });
});
