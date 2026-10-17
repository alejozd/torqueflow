import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { permisosEfectivos, tienePermiso, type Permiso, type Role } from "@/lib/auth/permisos";

const mockGetCliente = vi.fn();
let permisos: Permiso[] = [];

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: vi.fn(async (p: Permiso) => {
    if (!tienePermiso(permisos, p)) throw new Error("REDIRECT:/sin-permiso");
    return { user: { id: "u1", sedeActivaId: "s1", permisos } };
  }),
  puede: (_s: unknown, p: Permiso) => tienePermiso(permisos, p),
}));
vi.mock("@/app/actions/cliente-actions", () => ({ getCliente: (...a: unknown[]) => mockGetCliente(...a) }));
vi.mock("@/app/actions/orden-actions", () => ({ listTecnicos: async () => [] }));
vi.mock("@/app/actions/vehiculo-marca-modelo-actions", () => ({
  listMarcasVehiculo: async () => [],
  listTodosLosModelosVehiculo: async () => [],
}));
vi.mock("./editar-cliente-dialog", () => ({ EditarClienteDialog: () => null }));
vi.mock("./nuevo-vehiculo-dialog", () => ({ NuevoVehiculoDialog: () => null }));
vi.mock("./editar-vehiculo-dialog", () => ({ EditarVehiculoDialog: () => null }));
vi.mock("./nueva-orden-dialog", () => ({ NuevaOrdenDialog: () => null }));

import ClienteDetailPage from "./page";

const CLIENTE = {
  id: "c1",
  nombre: "Ana Pérez",
  telefono: null,
  email: null,
  documento: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  vehiculos: [],
  ordenes: [
    {
      id: "o1",
      estado: "ENTREGADA",
      vehiculoId: "v1",
      kilometrajeIngreso: null,
      sintomas: "Cambio de aceite",
      createdAt: new Date("2026-09-01T15:00:00Z"),
      factura: { total: "250000" },
    },
  ],
  facturas: [{ total: "250000", saldoPendiente: "50000", estado: "PENDIENTE" }],
};

function conRol(role: Role) {
  permisos = permisosEfectivos({ role });
}

async function pintar() {
  render(await ClienteDetailPage({ params: Promise.resolve({ id: "c1" }) }));
}

describe("ClienteDetailPage", () => {
  beforeEach(() => {
    mockGetCliente.mockReset().mockResolvedValue(CLIENTE);
  });

  it("con facturas.ver muestra Facturado, Saldo, Ticket medio y el total de cada orden", async () => {
    conRol("RECEPCION");
    await pintar();
    expect(screen.getByText("Facturado")).toBeInTheDocument();
    expect(screen.getByText("Saldo")).toBeInTheDocument();
    expect(screen.getByText("Ticket medio")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
  });

  it("sin facturas.ver (técnico) no muestra ninguna cifra de plata (I4)", async () => {
    conRol("TECNICO");
    await pintar();
    expect(screen.getByText("Cambio de aceite")).toBeInTheDocument();
    expect(screen.queryByText("Facturado")).not.toBeInTheDocument();
    expect(screen.queryByText("Saldo")).not.toBeInTheDocument();
    expect(screen.queryByText("Ticket medio")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Total" })).not.toBeInTheDocument();
    expect(screen.queryByText(/250\.000/)).not.toBeInTheDocument();
  });
});
