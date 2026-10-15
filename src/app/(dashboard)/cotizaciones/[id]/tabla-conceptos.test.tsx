import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockActualizar = vi.fn();
const mockAgregarRepuesto = vi.fn();
const mockAgregarLibre = vi.fn();
const mockEliminarKit = vi.fn();
vi.mock("@/app/actions/cotizacion-items-actions", () => ({
  actualizarItemCotizacionAction: (...args: unknown[]) => mockActualizar(...args),
  agregarRepuestoACotizacionAction: (...args: unknown[]) => mockAgregarRepuesto(...args),
  agregarItemLibreCotizacionAction: (...args: unknown[]) => mockAgregarLibre(...args),
  eliminarGrupoKitCotizacionAction: (...args: unknown[]) => mockEliminarKit(...args),
}));

const mockEliminarItem = vi.fn();
vi.mock("@/app/actions/cotizacion-actions", () => ({
  eliminarItemCotizacionFormAction: (...args: unknown[]) => mockEliminarItem(...args),
}));

const mockAplicarServicio = vi.fn();
vi.mock("@/app/actions/servicio-actions", () => ({
  aplicarServicioACotizacionAction: (...args: unknown[]) => mockAplicarServicio(...args),
}));

const mockBuscar = vi.fn();
vi.mock("@/app/actions/buscar-cotizacion-actions", () => ({
  buscarParaCotizacionAction: (...args: unknown[]) => mockBuscar(...args),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

import type { ConceptoVista } from "@/lib/cotizacion/agrupar-conceptos";
import { TablaConceptos } from "./tabla-conceptos";

function concepto(overrides: Partial<ConceptoVista>): ConceptoVista {
  return {
    id: "i1",
    tipo: "REPUESTO",
    descripcion: "Filtro de cabina",
    repuestoId: "r1",
    codigo: "149BOE",
    cantidad: 1,
    precioUnitario: 192840,
    precioCatalogo: 192840,
    stockActual: 5,
    grupoKitId: null,
    grupoKitNombre: null,
    ...overrides,
  };
}

const KIT = { grupoKitId: "g1", grupoKitNombre: "Cambio de aceite" };
const conceptosConKit = [
  concepto({}),
  concepto({ id: "k1", descripcion: "Aceite 20W50", repuestoId: "r2", codigo: "ACE-1", cantidad: 4, precioUnitario: 38000, precioCatalogo: 38000, stockActual: 2, ...KIT }),
  concepto({ id: "k2", tipo: "MANO_OBRA", descripcion: "Cambio de aceite", repuestoId: null, codigo: null, precioUnitario: 98000, precioCatalogo: null, stockActual: null, ...KIT }),
];

beforeEach(() => {
  mockActualizar.mockReset().mockResolvedValue({ error: null, itemId: "i1" });
  mockAgregarRepuesto.mockReset().mockResolvedValue({ error: null, itemId: "nuevo", fusionado: false });
  mockAgregarLibre.mockReset().mockResolvedValue({ error: null, itemId: "libre" });
  mockEliminarKit.mockReset().mockResolvedValue({ error: null, itemId: null });
  mockEliminarItem.mockReset().mockResolvedValue({ error: null, success: true });
  mockAplicarServicio.mockReset().mockResolvedValue({ error: null, success: true, agregados: { manoDeObra: true, repuestos: 1 } });
  mockBuscar.mockReset().mockResolvedValue({ kits: [], repuestos: [] });
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
});

describe("TablaConceptos", () => {
  it("muestra la existencia de cada repuesto y el contador del pie", () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={[concepto({})]} puedeEditar />);

    expect(screen.getByText("5 en bodega")).toBeInTheDocument();
    expect(screen.getByText("1 concepto")).toBeInTheDocument();
    expect(screen.getByText("1 repuesto")).toBeInTheDocument();
  });

  it("muestra el kit cerrado como una fila con su subtotal y el aviso de existencia", async () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={conceptosConKit} puedeEditar />);

    expect(screen.getByText("Cambio de aceite", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Falta existencia de 1 repuesto")).toBeInTheDocument();
    expect(screen.getByText(/250\.000/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Cantidad de Aceite 20W50")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Abrir el kit Cambio de aceite" }));

    expect(screen.getByLabelText("Cantidad de Aceite 20W50")).toBeInTheDocument();
    expect(screen.getByText("Solo hay 2")).toBeInTheDocument();
  });

  it("guarda la cantidad al pulsar Enter y vuelve al buscador", async () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={[concepto({})]} puedeEditar />);
    const celda = screen.getByLabelText("Cantidad de Filtro de cabina");

    await userEvent.click(celda);
    await userEvent.keyboard("{Control>}a{/Control}3{Enter}");

    await waitFor(() => expect(mockActualizar).toHaveBeenCalledWith("q1", "i1", { cantidad: 3 }));
    expect(screen.getByRole("combobox", { name: "Agregar repuesto, servicio o kit" })).toHaveFocus();
  });

  it("Esc deshace lo escrito sin guardar", async () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={[concepto({})]} puedeEditar />);
    const celda = screen.getByLabelText("Cantidad de Filtro de cabina");

    await userEvent.click(celda);
    await userEvent.keyboard("{Control>}a{/Control}9{Escape}");

    expect(mockActualizar).not.toHaveBeenCalled();
    expect(celda).toHaveValue("1");
  });

  it("si el guardado falla avisa y vuelve al valor anterior", async () => {
    mockActualizar.mockResolvedValue({ error: "No se puede modificar", itemId: null });
    render(<TablaConceptos cotizacionId="q1" conceptos={[concepto({})]} puedeEditar />);
    const celda = screen.getByLabelText("Cantidad de Filtro de cabina");

    await userEvent.click(celda);
    await userEvent.keyboard("{Control>}a{/Control}7{Enter}");

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("No se puede modificar"));
    expect(celda).toHaveValue("1");
  });

  it("los botones − y + cambian la cantidad de a 1", async () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={[concepto({ cantidad: 2 })]} puedeEditar />);

    await userEvent.click(screen.getByRole("button", { name: "Sumar 1 a Filtro de cabina" }));
    await userEvent.click(screen.getByRole("button", { name: "Restar 1 a Filtro de cabina" }));

    expect(mockActualizar).toHaveBeenNthCalledWith(1, "q1", "i1", { cantidad: 3 });
    expect(mockActualizar).toHaveBeenNthCalledWith(2, "q1", "i1", { cantidad: 1 });
  });

  it("marca el precio modificado y deja volver al de catálogo", async () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={[concepto({ precioUnitario: 150000 })]} puedeEditar />);

    await userEvent.click(screen.getByRole("button", { name: "Volver al precio de catálogo de Filtro de cabina" }));

    expect(mockActualizar).toHaveBeenCalledWith("q1", "i1", { precioUnitario: 192840 });
  });

  it("agrega el repuesto elegido en el buscador", async () => {
    mockBuscar.mockResolvedValue({
      kits: [],
      repuestos: [{ id: "r9", codigo: "BUJ-1", nombre: "Bujía NGK", precioVenta: 25000, stockActual: 0, bodega: "Principal" }],
    });
    render(<TablaConceptos cotizacionId="q1" conceptos={[]} puedeEditar />);

    await userEvent.type(screen.getByRole("combobox", { name: "Agregar repuesto, servicio o kit" }), "bujia");
    const opcion = await screen.findByRole("option", { name: /Bujía NGK/ });
    expect(within(opcion).getByText("Sin existencia")).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(mockAgregarRepuesto).toHaveBeenCalledWith("q1", "r9"));
  });

  it("aplica un kit elegido en el buscador", async () => {
    mockBuscar.mockResolvedValue({
      kits: [{ id: "s1", nombre: "Cambio de aceite", conceptos: 3, total: 285000, repuestosSinExistencia: 0 }],
      repuestos: [],
    });
    render(<TablaConceptos cotizacionId="q1" conceptos={[]} puedeEditar />);

    await userEvent.type(screen.getByRole("combobox", { name: "Agregar repuesto, servicio o kit" }), "aceite");
    await userEvent.click(await screen.findByRole("option", { name: /Cambio de aceite/ }));

    await waitFor(() => expect(mockAplicarServicio).toHaveBeenCalled());
    const formData = mockAplicarServicio.mock.calls[0][2] as FormData;
    expect(formData.get("servicioId")).toBe("s1");
    expect(mockToastSuccess).toHaveBeenCalledWith("Servicio agregado: mano de obra y 1 repuesto");
  });

  it("ofrece agregar lo escrito como ítem libre", async () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={[]} puedeEditar />);

    await userEvent.type(screen.getByRole("combobox", { name: "Agregar repuesto, servicio o kit" }), "Lavado de motor");
    await userEvent.click(await screen.findByRole("option", { name: "Agregar «Lavado de motor» como mano de obra" }));

    await waitFor(() =>
      expect(mockAgregarLibre).toHaveBeenCalledWith("q1", { tipo: "MANO_OBRA", descripcion: "Lavado de motor" }),
    );
  });

  it("quitar un kit pide confirmación", async () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={conceptosConKit} puedeEditar />);

    await userEvent.click(screen.getByRole("button", { name: "Quitar el kit Cambio de aceite" }));
    expect(mockEliminarKit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, quitar" }));

    await waitFor(() => expect(mockEliminarKit).toHaveBeenCalledWith("q1", "g1"));
  });

  it("solo los ítems libres permiten cambiar el tipo", async () => {
    render(
      <TablaConceptos
        cotizacionId="q1"
        conceptos={[concepto({ id: "l1", descripcion: "Bujía importada", repuestoId: null, codigo: null, precioCatalogo: null, stockActual: null })]}
        puedeEditar
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Repuesto ⇄/ }));

    expect(mockActualizar).toHaveBeenCalledWith("q1", "l1", { tipo: "MANO_OBRA" });
  });

  it("sin permiso de edición queda de solo lectura y sin buscador", () => {
    render(<TablaConceptos cotizacionId="q1" conceptos={[concepto({})]} puedeEditar={false} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
  });
});
