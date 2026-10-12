import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockListar = vi.fn();
const mockFrecuencia = vi.fn();
vi.mock("@/app/actions/liquidacion-actions", () => ({
  listLiquidacionesDelPeriodo: (...args: unknown[]) => mockListar(...args),
  getFrecuenciaLiquidacion: (...args: unknown[]) => mockFrecuencia(...args),
  listTecnicosConEsquema: vi.fn(),
  // Las que usan los componentes cliente que la página monta.
  guardarEsquemaLiquidacionAction: vi.fn(),
  guardarFrecuenciaLiquidacionAction: vi.fn(),
  generarLiquidacionesAction: vi.fn(),
  actualizarAjusteLiquidacionAction: vi.fn(),
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
  documento: null,
};

const DATOS = {
  frecuencia: "MENSUAL" as const,
  periodo: "2026-10",
  etiqueta: "octubre de 2026",
  error: null,
  filas: [FILA],
};

async function renderPage(periodo?: string) {
  render(await LiquidacionesPage({ searchParams: Promise.resolve(periodo ? { periodo } : {}) }));
}

describe("LiquidacionesPage", () => {
  beforeEach(() => {
    mockFrecuencia.mockReset().mockResolvedValue("MENSUAL");
    mockListar.mockReset().mockResolvedValue(DATOS);
  });

  it("muestra el periodo en curso, sus filas y las dos tarjetas de configuración", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Liquidaciones" })).toBeInTheDocument();
    expect(screen.getByText("octubre de 2026")).toBeInTheDocument();
    const tarjeta = screen.getByText("Producción y liquidación del periodo").closest("[data-slot=card]") as HTMLElement;
    expect(within(tarjeta).getByText("Ana")).toBeInTheDocument();
    expect(within(tarjeta).getByRole("button", { name: "Generar liquidaciones del periodo" })).toBeInTheDocument();
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

  it("ignora un periodo de la URL con otro formato", async () => {
    await renderPage("2026-08-Q1");

    // Cae al periodo en curso en vez de consultar algo inválido.
    expect(mockListar).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/));
  });
});
