import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockListar = vi.fn();
const mockFrecuencia = vi.fn();
vi.mock("@/app/actions/liquidacion-actions", () => ({
  listLiquidacionesDelPeriodo: (...args: unknown[]) => mockListar(...args),
  getFrecuenciaLiquidacion: (...args: unknown[]) => mockFrecuencia(...args),
  // Las que usan los componentes cliente que la página monta.
  guardarEsquemaLiquidacionAction: vi.fn(),
  quitarEsquemaLiquidacionAction: vi.fn(),
  guardarFrecuenciaLiquidacionAction: vi.fn(),
  anularLiquidacionAction: vi.fn(),
  pagarLiquidacionAction: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn(), requireSession: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import LiquidacionesPage from "./page";

const FILA = {
  usuarioId: "t1",
  nombre: "Ana",
  ordenes: 3,
  trabajos: 4,
  montoManoObra: 180000,
  montoPorTrabajo: 45000,
  tipo: "PORCENTAJE" as const,
  porcentaje: 40,
  montoFijo: null,
  montoSugerido: 72000,
  solapada: false,
  pago: null,
};

const DATOS = {
  frecuencia: "MENSUAL" as const,
  periodo: "2026-10",
  etiqueta: "octubre de 2026",
  error: null,
  filas: [FILA],
  sinAsignar: null,
};

async function renderPage(periodo?: string) {
  render(await LiquidacionesPage({ searchParams: Promise.resolve(periodo ? { periodo } : {}) }));
}

describe("LiquidacionesPage", () => {
  beforeEach(() => {
    // Reloj fijo: la página calcula el periodo en curso, así que sin esto el
    // test caduca al cambiar de mes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T15:00:00.000Z"));
    mockFrecuencia.mockReset().mockResolvedValue("MENSUAL");
    mockListar.mockReset().mockResolvedValue(DATOS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("muestra el periodo en curso, sus filas y las dos tarjetas de configuración", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Liquidaciones" })).toBeInTheDocument();
    expect(screen.getByText("octubre de 2026")).toBeInTheDocument();
    const tarjeta = screen.getByText("Producción y liquidación del periodo").closest("[data-slot=card]") as HTMLElement;
    expect(within(tarjeta).getByText("Ana")).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: "Pagar" })).toBeInTheDocument();
    expect(screen.getByText("Esquema de pago por técnico")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cada cuánto se liquida" })).toBeInTheDocument();
  });

  it("navega al periodo anterior y al siguiente según la frecuencia", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "← Anterior" })).toHaveAttribute("href", "/liquidaciones?periodo=2026-09");
    expect(screen.getByRole("link", { name: "Siguiente →" })).toHaveAttribute("href", "/liquidaciones?periodo=2026-11");
    // En el periodo en curso no se ofrece "Periodo actual".
    expect(screen.queryByRole("link", { name: "Periodo actual" })).not.toBeInTheDocument();
  });

  it("acepta un periodo de la URL con el formato de la frecuencia vigente", async () => {
    await renderPage("2026-08");

    expect(mockListar).toHaveBeenCalledWith("2026-08");
    expect(screen.getByRole("link", { name: "Periodo actual" })).toHaveAttribute("href", "/liquidaciones");
  });

  it("acepta un periodo de otra frecuencia y navega con la suya", async () => {
    // El taller ya es quincenal, pero quedan liquidaciones mensuales por pagar.
    mockFrecuencia.mockResolvedValue("QUINCENAL");

    await renderPage("2026-10");

    expect(mockListar).toHaveBeenCalledWith("2026-10");
    expect(screen.getByRole("link", { name: "← Anterior" })).toHaveAttribute("href", "/liquidaciones?periodo=2026-09");
  });

  it("ignora un periodo de la URL que no es un periodo válido", async () => {
    await renderPage("2026-08-Q3");

    // Cae al periodo en curso en vez de consultar algo inválido.
    expect(mockListar).toHaveBeenCalledWith("2026-10");
  });

  it("avisa de la mano de obra sin mecánico, que no se liquida", async () => {
    mockListar.mockResolvedValue({ ...DATOS, sinAsignar: { ordenes: 1, trabajos: 2, montoManoObra: 30000 } });

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Hay 2 trabajos sin mecánico asignado");
  });

  it("no avisa si toda la mano de obra tiene mecánico", async () => {
    await renderPage();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
