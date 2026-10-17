import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockRentabilidad = vi.fn();
const mockProductividad = vi.fn();
vi.mock("@/app/actions/reporte-actions", () => ({
  getReporteRentabilidad: (...args: unknown[]) => mockRentabilidad(...args),
  getReporteProductividad: (...args: unknown[]) => mockProductividad(...args),
}));
const mockListSedes = vi.fn();
vi.mock("@/app/actions/sede-actions", () => ({ listSedes: () => mockListSedes() }));

import { permisosEfectivos, tienePermiso, type Permiso, type Role } from "@/lib/auth/permisos";

let permisosActuales: Permiso[] = [];
function conPermisos(role: Role) {
  permisosActuales = permisosEfectivos({ role });
}
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: vi.fn(async () => ({ user: {} })),
  puede: (_s: unknown, p: Permiso) => tienePermiso(permisosActuales, p),
}));

import ReportesPage from "./page";

const FILTROS = { desde: "2026-10-01", hasta: "2026-10-31", sedeId: "" };
const TOTALES = {
  facturasCount: 0,
  totalFacturado: 0,
  baseFacturada: 0,
  costoRepuestos: 0,
  margen: 0,
  margenPorcentaje: 0,
  manoDeObraFacturada: 0,
};

const NETA = {
  gastosTotal: 0,
  utilidadNeta: 0,
  margenNetoPorcentaje: 0,
  ticketPromedioBase: 0,
  puntoEquilibrioVentas: 0,
  puntoEquilibrioFacturas: 0,
  diferenciaEquilibrio: 0,
};
const RENTABILIDAD = {
  filtros: FILTROS,
  error: null,
  totales: TOTALES,
  neta: NETA,
  gastosPorCategoria: [],
  recurrentesSinConfirmar: 0,
};

async function renderPage() {
  render(await ReportesPage({ searchParams: Promise.resolve({}) }));
}

describe("ReportesPage", () => {
  beforeEach(() => {
    conPermisos("ADMIN");
    mockListSedes.mockReset().mockResolvedValue([]);
    mockRentabilidad.mockReset().mockResolvedValue(RENTABILIDAD);
    mockProductividad.mockReset().mockResolvedValue({ filtros: FILTROS, error: null, filas: [] });
  });

  it("muestra utilidad neta y el aviso de recurrentes en singular", async () => {
    mockRentabilidad.mockResolvedValue({ ...RENTABILIDAD, recurrentesSinConfirmar: 1 });

    await renderPage();

    expect(screen.getByText("Utilidad neta")).toBeInTheDocument();
    expect(screen.getByText(/1 gasto recurrente sin confirmar/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revisar gastos" })).toHaveAttribute("href", "/gastos");
  });

  it("indica que el punto de equilibrio no es alcanzable cuando es null", async () => {
    mockRentabilidad.mockResolvedValue({
      ...RENTABILIDAD,
      neta: { ...NETA, puntoEquilibrioVentas: null, puntoEquilibrioFacturas: null, diferenciaEquilibrio: null },
    });

    await renderPage();

    expect(screen.getByText("No alcanzable con el margen actual")).toBeInTheDocument();
  });

  it("sin ventas y con gastos, el punto de equilibrio dice que no hay ventas", async () => {
    mockRentabilidad.mockResolvedValue({
      ...RENTABILIDAD,
      neta: { ...NETA, gastosTotal: 500000, puntoEquilibrioVentas: null, puntoEquilibrioFacturas: null, diferenciaEquilibrio: null },
    });

    await renderPage();

    expect(screen.getByText("Sin ventas en el periodo")).toBeInTheDocument();
    expect(screen.queryByText("No alcanzable con el margen actual")).not.toBeInTheDocument();
  });

  it("el enlace Revisar gastos conserva la sede del reporte", async () => {
    mockRentabilidad.mockResolvedValue({ ...RENTABILIDAD, recurrentesSinConfirmar: 1 });

    render(await ReportesPage({ searchParams: Promise.resolve({ sedeId: "s2" }) }));

    expect(screen.getByRole("link", { name: "Revisar gastos" })).toHaveAttribute("href", "/gastos?sedeId=s2");
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

  it("muestra los trabajos y el promedio por trabajo de cada técnico", async () => {
    const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });
    mockProductividad.mockResolvedValue({
      filtros: FILTROS,
      error: null,
      filas: [
        { mecanicoId: "t1", mecanicoNombre: "Ana", ordenes: 3, trabajos: 4, montoManoObra: 180000 },
        { mecanicoId: "t2", mecanicoNombre: "Beto", ordenes: 1, trabajos: 0, montoManoObra: 0 },
      ],
    });

    await renderPage();

    const tarjeta = screen.getByText("Productividad por técnico").closest("[data-slot=card]") as HTMLElement;
    expect(within(tarjeta).getByText("Trabajos")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Promedio por trabajo")).toBeInTheDocument();

    const filas = within(tarjeta).getAllByRole("row");
    expect(filas[1]!.textContent).toContain("Ana");
    expect(filas[1]!.textContent).toContain("3");
    expect(filas[1]!.textContent).toContain("4");
    expect(filas[1]!.textContent).toContain(formatoMoneda.format(180000));
    // 180000 / 4
    expect(filas[1]!.textContent).toContain(formatoMoneda.format(45000));
    // Sin trabajos no hay promedio: guion, no un cero engañoso.
    expect(filas[2]!.textContent).toContain("—");
    // El encabezado suma los trabajos del periodo.
    expect(screen.getByText("2 técnicos · 4 trabajos")).toBeInTheDocument();
  });

  it("exige reportes.productividad al entrar", async () => {
    const { requirePermiso } = await import("@/lib/auth/guards");
    await renderPage();
    expect(requirePermiso).toHaveBeenCalledWith("reportes.productividad");
  });

  it("sin reportes.rentabilidad ni sedes.verTodas no pide rentabilidad ni sedes y oculta esa sección", async () => {
    permisosActuales = ["reportes.productividad"];

    await renderPage();

    expect(mockRentabilidad).not.toHaveBeenCalled();
    expect(mockListSedes).not.toHaveBeenCalled();
    expect(screen.queryByText("Utilidad neta")).not.toBeInTheDocument();
    expect(screen.queryByText("Sede")).not.toBeInTheDocument();
    expect(screen.getByText("Productividad por técnico")).toBeInTheDocument();
  });
});
