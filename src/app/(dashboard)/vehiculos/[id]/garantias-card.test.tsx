import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GarantiasCard, type GarantiaDelVehiculo } from "./garantias-card";

const BASE: GarantiaDelVehiculo = {
  id: "g1",
  tipo: "TRABAJO",
  descripcion: "Cambio de aceite",
  linea: "Cambio de aceite y filtro",
  cubreHasta: new Date("2027-03-15T00:00:00.000Z"),
  cubreHastaKm: 95000,
  nota: null,
  registradaAt: new Date("2026-10-12T15:00:00.000Z"),
  ordenId: "o1",
  sede: "Sede principal",
  sedeId: "sede-1",
  estado: "VIGENTE",
};

describe("GarantiasCard", () => {
  it("sin garantías lo explica", () => {
    render(<GarantiasCard garantias={[]} sedeActivaId="sede-1" />);

    expect(screen.getByText(/no tiene garantías registradas/)).toBeInTheDocument();
    expect(screen.getByText("· 0 registros")).toBeInTheDocument();
  });

  it("lista la garantía con su línea, su cobertura, su sede y su orden", () => {
    render(<GarantiasCard garantias={[BASE]} sedeActivaId="sede-1" />);

    expect(screen.getByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.getByText("Vigente")).toBeInTheDocument();
    expect(screen.getByText(/Trabajo · Cambio de aceite y filtro/)).toBeInTheDocument();
    expect(screen.getByText(/hasta 95.000 km/)).toBeInTheDocument();
    expect(screen.getByText(/Sede principal/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ver la orden" })).toHaveAttribute("href", "/ordenes/o1");
  });

  it("muestra la vigencia de cada una y las que no tienen cobertura", () => {
    render(
      <GarantiasCard
        sedeActivaId="sede-1"
        garantias={[
          BASE,
          { ...BASE, id: "g2", descripcion: "Filtro", estado: "VENCIDA", cubreHasta: null, cubreHastaKm: null },
          { ...BASE, id: "g3", descripcion: "Batería", estado: "SIN_COBERTURA", cubreHasta: null, cubreHastaKm: null },
        ]}
      />,
    );

    expect(screen.getByText("Vencida")).toBeInTheDocument();
    expect(screen.getByText("Informativa")).toBeInTheDocument();
    expect(screen.getAllByText(/Sin cobertura \(informativa\)/)).toHaveLength(2);
    expect(screen.getByText("· 3 registros")).toBeInTheDocument();
  });

  it("muestra la nota cuando la hay", () => {
    render(<GarantiasCard garantias={[{ ...BASE, nota: "Cubre solo la mano de obra" }]} sedeActivaId="sede-1" />);

    expect(screen.getByText("Cubre solo la mano de obra")).toBeInTheDocument();
  });
});
