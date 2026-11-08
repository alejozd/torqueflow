import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConceptoVista } from "@/lib/conceptos/conceptos";

const mockActualizar = vi.fn();
const mockCambiarTipo = vi.fn();
vi.mock("@/app/actions/conceptos-orden-actions", () => ({
  actualizarConceptoOrdenAction: (...args: unknown[]) => mockActualizar(...args),
  cambiarTipoConceptoOrdenAction: (...args: unknown[]) => mockCambiarTipo(...args),
  agregarLibreAOrdenAction: vi.fn(),
  agregarRepuestoAOrdenAction: vi.fn(),
  buscarParaOrdenAction: vi.fn(async () => ({ kits: [], repuestos: [] })),
  quitarKitOrdenAction: vi.fn(),
}));
vi.mock("@/app/actions/item-orden-actions", () => ({ deleteItemOrdenFormAction: vi.fn() }));
vi.mock("@/app/actions/mano-de-obra-actions", () => ({ deleteManoDeObraFormAction: vi.fn() }));
vi.mock("@/app/actions/servicio-actions", () => ({ aplicarServicioAOrdenAction: vi.fn() }));
vi.mock("../../repuestos/nuevo-repuesto-dialog", () => ({ NuevoRepuestoDialog: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ConceptosOrden } from "./conceptos-orden";

function mo(overrides: Partial<ConceptoVista> = {}): ConceptoVista {
  return {
    id: "mo:m1",
    tipo: "MANO_OBRA",
    descripcion: "Cambio de pastillas",
    repuestoId: null,
    codigo: null,
    cantidad: 1,
    precioUnitario: 135000,
    ivaPct: 19,
    precioCatalogo: null,
    stockActual: null,
    grupoKitId: null,
    grupoKitNombre: null,
    editableCantidad: false,
    mecanico: null,
    ...overrides,
  };
}

function repuestoLibre(overrides: Partial<ConceptoVista> = {}): ConceptoVista {
  return { ...mo(), id: "item:i7", tipo: "REPUESTO", descripcion: "Soldadura", editableCantidad: true, ...overrides };
}

const TECNICOS = [
  { id: "t1", nombre: "Carlos" },
  { id: "t2", nombre: "Javier" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConceptosOrden", () => {
  it("la mano de obra muestra su mecánico y no deja editar la cantidad", () => {
    render(
      <ConceptosOrden
        ordenId="o1"
        puedeEditar
        puedeQuitar
        tecnicos={TECNICOS}
        crearRepuesto={null}
        conceptos={[mo({ mecanico: { id: "t1", nombre: "Carlos" } })]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Mecánico de Cambio de pastillas" })).toHaveTextContent("Carlos");
    expect(screen.queryByLabelText("Cantidad de Cambio de pastillas")).not.toBeInTheDocument();
  });

  it("cambiar el mecánico llama la acción de la orden con el id de la línea", async () => {
    mockActualizar.mockResolvedValue({ error: null, conceptoId: "mo:m1" });
    render(
      <ConceptosOrden
        ordenId="o1"
        puedeEditar
        puedeQuitar
        tecnicos={TECNICOS}
        crearRepuesto={null}
        conceptos={[mo({ mecanico: { id: "t1", nombre: "Carlos" } })]}
      />,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Mecánico de Cambio de pastillas" }));
    await userEvent.click(await screen.findByRole("option", { name: "Javier" }));
    expect(mockActualizar).toHaveBeenCalledWith("o1", "mo:m1", { mecanicoId: "t2" });
  });

  it("el tipo de una línea libre se cambia con la acción de cambiar tipo", async () => {
    mockCambiarTipo.mockResolvedValue({ error: null, conceptoId: "mo:m7" });
    render(
      <ConceptosOrden ordenId="o1" puedeEditar puedeQuitar tecnicos={[]} crearRepuesto={null} conceptos={[repuestoLibre()]} />,
    );
    await userEvent.click(screen.getByTitle("Cambiar entre repuesto y mano de obra"));
    expect(mockCambiarTipo).toHaveBeenCalledWith("o1", "item:i7");
    expect(mockActualizar).not.toHaveBeenCalled();
  });

  it("sin permiso de editar muestra el mecánico como texto y sin buscador", () => {
    render(
      <ConceptosOrden
        ordenId="o1"
        puedeEditar={false}
        puedeQuitar={false}
        tecnicos={[]}
        crearRepuesto={null}
        conceptos={[mo({ mecanico: { id: "t1", nombre: "Carlos" } })]}
      />,
    );
    expect(screen.getByText("Mecánico: Carlos")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Agregar repuesto, servicio o kit" })).not.toBeInTheDocument();
  });
});
