import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockRentabilidad = vi.fn();
const mockProductividad = vi.fn();
vi.mock("@/app/actions/reporte-actions", () => ({
  getReporteRentabilidad: (...args: unknown[]) => mockRentabilidad(...args),
  getReporteProductividad: (...args: unknown[]) => mockProductividad(...args),
}));
vi.mock("@/app/actions/sede-actions", () => ({ listSedes: () => Promise.resolve([]) }));

import ReportesPage from "./page";

const FILTROS = { desde: "2026-10-01", hasta: "2026-10-31", sedeId: "" };
const TOTALES = {
  facturasCount: 0,
  totalFacturado: 0,
  costoRepuestos: 0,
  margen: 0,
  margenPorcentaje: 0,
  manoDeObraFacturada: 0,
};

async function renderPage() {
  render(await ReportesPage({ searchParams: Promise.resolve({}) }));
}

describe("ReportesPage", () => {
  beforeEach(() => {
    mockRentabilidad.mockReset().mockResolvedValue({ filtros: FILTROS, error: null, totales: TOTALES });
  });

  it("shows the productividad error instead of an empty-looking table", async () => {
    mockProductividad.mockResolvedValue({ filtros: FILTROS, error: "Filtros inválidos", filas: [] });

    await renderPage();

    const tarjeta = screen.getByText("Productividad por técnico").closest("[data-slot=card]") as HTMLElement;
    expect(within(tarjeta).getByRole("alert")).toHaveTextContent("Filtros inválidos");
    expect(within(tarjeta).queryByText("No hay órdenes entregadas en este rango.")).not.toBeInTheDocument();
  });

  it("keeps the empty-state message when there is simply no data", async () => {
    mockProductividad.mockResolvedValue({ filtros: FILTROS, error: null, filas: [] });

    await renderPage();

    expect(screen.getByText("No hay órdenes entregadas en este rango.")).toBeInTheDocument();
  });
});
