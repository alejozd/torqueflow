import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockGetOrden = vi.fn();
vi.mock("@/app/actions/orden-actions", () => ({ getOrden: (...args: unknown[]) => mockGetOrden(...args) }));
// El diagrama (componente cliente) importa las acciones de recepción: se mockean
// para no arrastrar los guards ni next-auth en un test de página.
vi.mock("@/app/actions/recepcion-actions", () => ({
  agregarDanioAction: vi.fn(),
  quitarDanioAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  // El notFound real lanza; el mock tiene que hacer lo mismo o la página seguiría
  // ejecutándose con la orden nula.
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const mockRequirePermiso = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...args: unknown[]) => mockRequirePermiso(...args) }));
import ImprimirActaPage from "./page";

const ORDEN = {
  id: "o1",
  createdAt: new Date("2026-10-10T13:00:00.000Z"),
  entregadaAt: new Date("2026-10-12T15:00:00.000Z"),
  kilometrajeIngreso: 85000,
  nivelCombustible: "MEDIO",
  sintomas: "Ruido en el tren delantero",
  sede: { nombre: "Sede principal" },
  cliente: { nombre: "Ana Gómez", telefono: "310 555 1234", documento: "1.020" },
  vehiculo: { placa: "ABC123", marca: "Renault", modelo: "Logan", anio: 2021, vin: "9BD12345678901234", tipo: "CARRO" },
  danios: [{ id: "d1", zona: "CAPO", tipo: "GOLPE", nota: "Leve" }],
  manoDeObra: [{ id: "m1", descripcion: "Cambio de aceite", valor: 45000 }],
  items: [{ id: "i1", descripcion: "Filtro", cantidad: 2, precioUnitario: 25000 }],
  garantias: [
    { id: "g1", tipo: "TRABAJO", descripcion: "Cambio de aceite", cubreHasta: new Date("2027-03-15T00:00:00.000Z"), cubreHastaKm: 95000, nota: null },
  ],
  acta: {
    recibidoPor: "Ana Gómez",
    documentoRecibe: "1.020",
    observaciones: "Recibido a satisfacción",
    firmaUrl: "/api/uploads/taller/ordenes/o1/firma/f.png",
    firmaFotoUrl: null,
    firmadaAt: new Date("2026-10-12T15:00:00.000Z"),
  },
};

describe("ImprimirActaPage", () => {
  it("exige ordenes.ver antes de cargar nada (Fase 26, I3)", async () => {
    mockRequirePermiso.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(ImprimirActaPage({ params: Promise.resolve({ id: "o1" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRequirePermiso).toHaveBeenCalledWith("ordenes.ver");
    expect(mockGetOrden).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    mockGetOrden.mockReset().mockResolvedValue(ORDEN);
  });

  it("imprime el acta con el estado de ingreso, los daños, los trabajos y la firma", async () => {
    const { container } = render(await ImprimirActaPage({ params: Promise.resolve({ id: "o1" }) }));

    expect(screen.getByRole("heading", { name: "Sede principal" })).toBeInTheDocument();
    expect(screen.getByText(/Acta de entrega/)).toBeInTheDocument();
    expect(screen.getByText("Ana Gómez")).toBeInTheDocument();
    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("85000")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText(/Ruido en el tren delantero/)).toBeInTheDocument();
    // El diagrama se reutiliza en modo lectura y las marcas se listan con su nota.
    // Desde el croquis dibujado a mano (900085b) cada daño es un número en el dibujo con su tarjeta.
    const marcas = within(screen.getByRole("list", { name: "Daños marcados" })).getAllByRole("listitem");
    expect(marcas).toHaveLength(1);
    expect(marcas[0]).toHaveTextContent("Capó");
    expect(container.querySelectorAll("[data-marcador]")).toHaveLength(1);
    expect(screen.getByText(/Capó · Golpe · Leve/)).toBeInTheDocument();
    expect(screen.getByText(/Cambio de aceite \(mano de obra\)/)).toBeInTheDocument();
    expect(screen.getByText("Filtro")).toBeInTheDocument();
    expect(screen.getByText(/Garantías/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Firma de Ana Gómez" })).toHaveAttribute(
      "src",
      "/api/uploads/taller/ordenes/o1/firma/f.png",
    );
    expect(screen.getByText(/Firmada el/)).toBeInTheDocument();
  });

  it("trae el enlace de vuelta y el botón de imprimir fuera de la impresión", async () => {
    const { container } = render(await ImprimirActaPage({ params: Promise.resolve({ id: "o1" }) }));

    expect(screen.getByRole("link", { name: "← Volver a la orden" })).toHaveAttribute("href", "/ordenes/o1");
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
    expect(container.querySelector(".print\\:hidden")).not.toBeNull();
  });

  it("sin acta avisa de que está pendiente", async () => {
    mockGetOrden.mockResolvedValue({ ...ORDEN, acta: null, danios: [], garantias: [], manoDeObra: [], items: [] });

    render(await ImprimirActaPage({ params: Promise.resolve({ id: "o1" }) }));

    expect(screen.getByText(/todavía no tiene acta de entrega/)).toBeInTheDocument();
    expect(screen.getByText(/La orden no tiene trabajos ni repuestos cargados/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("si la orden no es de la sede activa, no hay página", async () => {
    const { notFound } = await import("next/navigation");
    mockGetOrden.mockResolvedValue(null);

    await expect(ImprimirActaPage({ params: Promise.resolve({ id: "ajena" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("el importe del repuesto es cantidad por precio", async () => {
    render(await ImprimirActaPage({ params: Promise.resolve({ id: "o1" }) }));

    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText(/50\.000/)).toBeInTheDocument();
  });
});
