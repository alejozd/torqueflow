import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockGetCotizacion = vi.fn();
vi.mock("@/app/actions/cotizacion-actions", () => ({
  getCotizacion: (...args: unknown[]) => mockGetCotizacion(...args),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args) }));
import ImprimirCotizacionPage from "./page";

const KIT = { grupoKitId: "g1", grupoKitNombre: "Cambio de aceite" };

function item(overrides: Record<string, unknown>) {
  return {
    id: "i",
    tipo: "REPUESTO",
    descripcion: "x",
    repuestoId: "r",
    cantidad: "1",
    precioUnitario: "1000",
    grupoKitId: null,
    grupoKitNombre: null,
    repuesto: { codigo: "C-1", precioVenta: "1000", stockActual: 0 },
    ...overrides,
  };
}

function cotizacion(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    numero: 6,
    estado: "ENVIADA",
    createdAt: new Date("2026-09-07T15:00:00Z"),
    validaHasta: null,
    notas: null,
    sede: { nombre: "Sede principal" },
    cliente: { nombre: "Isabella Díaz", telefono: "3100000703" },
    vehiculo: { placa: "PLQ629", marca: "Mercedes-Benz", modelo: "W203", anio: 2003 },
    items: [
      item({ id: "f", descripcion: "Filtro de cabina", precioUnitario: "192840" }),
      item({ id: "k1", descripcion: "Aceite 20W50", cantidad: "4", precioUnitario: "38000", ...KIT }),
      item({ id: "k2", tipo: "MANO_OBRA", descripcion: "Mano de obra cambio", repuestoId: null, repuesto: null, precioUnitario: "98000", ...KIT }),
    ],
    subtotal: "442840",
    descuentoTipo: "PORCENTAJE",
    descuentoPct: "0",
    descuento: "0",
    iva: "84140",
    total: "526980",
    ...overrides,
  };
}

async function renderizar() {
  render(await ImprimirCotizacionPage({ params: Promise.resolve({ id: "q1" }) }));
}

beforeEach(() => {
  mockGetCotizacion.mockReset().mockResolvedValue(cotizacion());
});

describe("ImprimirCotizacionPage", () => {
  it("exige cotizaciones.ver antes de cargar nada (Fase 26, I3)", async () => {
    mockRequirePermiso.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(ImprimirCotizacionPage({ params: Promise.resolve({ id: "q1" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRequirePermiso).toHaveBeenCalledWith("cotizaciones.ver");
    expect(mockGetCotizacion).not.toHaveBeenCalled();
  });

  it("imprime cada kit con su nombre y subtotal como título y sus partes debajo", async () => {
    await renderizar();

    const titulo = screen.getByText("Cambio de aceite").closest("tr") as HTMLElement;
    expect(within(titulo).getByText("2 conceptos")).toBeInTheDocument();
    expect(within(titulo).getByText(/250\.000/)).toBeInTheDocument();
    expect(screen.getByText("Aceite 20W50")).toBeInTheDocument();
    expect(screen.getByText("Mano de obra cambio")).toBeInTheDocument();
    expect(screen.getByText("Filtro de cabina")).toBeInTheDocument();
  });

  it("no imprime la existencia en bodega", async () => {
    await renderizar();

    expect(screen.queryByText(/bodega|existencia/i)).not.toBeInTheDocument();
  });

  it("sin descuento no muestra la línea de descuento", async () => {
    await renderizar();

    expect(screen.queryByText(/Descuento/)).not.toBeInTheDocument();
  });

  it("un descuento por monto fijo se imprime sin porcentaje", async () => {
    mockGetCotizacion.mockResolvedValue(cotizacion({ descuentoTipo: "MONTO", descuentoPct: "10", descuento: "20000" }));

    await renderizar();

    expect(screen.getByText("Descuento")).toBeInTheDocument();
    expect(screen.queryByText(/Descuento \(/)).not.toBeInTheDocument();
  });

  it("un descuento por porcentaje muestra el porcentaje", async () => {
    mockGetCotizacion.mockResolvedValue(cotizacion({ descuentoPct: "10", descuento: "44284" }));

    await renderizar();

    expect(screen.getByText("Descuento (10%)")).toBeInTheDocument();
  });
});
