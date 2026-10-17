import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { permisosEfectivos, tienePermiso, type Permiso, type Role } from "@/lib/auth/permisos";

const mockGetVehiculo = vi.fn();
const mockGarantias = vi.fn();
let permisos: Permiso[] = [];

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/guards", () => ({
  requirePermiso: vi.fn(async (p: Permiso) => {
    if (!tienePermiso(permisos, p)) throw new Error("REDIRECT:/sin-permiso");
    return { user: { sedeActivaId: "s1" } };
  }),
  puede: (_s: unknown, p: Permiso) => tienePermiso(permisos, p),
}));
vi.mock("@/app/actions/vehiculo-actions", () => ({ getVehiculo: (...a: unknown[]) => mockGetVehiculo(...a) }));
vi.mock("@/app/actions/configuracion-taller-actions", () => ({ getDiasAvisoVencimiento: async () => 30 }));
vi.mock("@/app/actions/orden-actions", () => ({ listOrdenesByVehiculo: async () => [], listTecnicos: async () => [] }));
vi.mock("@/app/actions/recepcion-actions", () => ({ listGarantiasDeVehiculo: (...a: unknown[]) => mockGarantias(...a) }));
vi.mock("@/app/actions/vehiculo-marca-modelo-actions", () => ({
  listMarcasVehiculo: async () => [],
  listTodosLosModelosVehiculo: async () => [],
}));
vi.mock("../../clientes/[id]/editar-vehiculo-dialog", () => ({ EditarVehiculoDialog: () => null }));
vi.mock("../../clientes/[id]/nueva-orden-dialog", () => ({ NuevaOrdenDialog: () => null }));
vi.mock("./garantias-card", () => ({ GarantiasCard: () => <div>TARJETA-GARANTIAS</div> }));

import VehiculoDetailPage from "./page";

const VEHICULO = {
  id: "v1", placa: "ABC123", marca: "Renault", modelo: "Logan", anio: 2020, color: "Gris", tipo: "AUTOMOVIL",
  kilometraje: 1000, cliente: { id: "c1", nombre: "Ana", telefono: null, email: null }, clienteId: "c1",
  vencimientoSoat: null, vencimientoTecnomecanica: null, vin: null, notas: null,
};

function conRol(role: Role, extra: Permiso[] = []) {
  permisos = [...permisosEfectivos({ role }), ...extra];
}

describe("VehiculoDetailPage", () => {
  beforeEach(() => {
    mockGetVehiculo.mockReset().mockResolvedValue(VEHICULO);
    mockGarantias.mockReset().mockResolvedValue([]);
  });

  it("sin clientes.ver redirige antes de consultar el vehículo", async () => {
    permisos = ["ordenes.trabajar"];
    await expect(VehiculoDetailPage({ params: Promise.resolve({ id: "v1" }) })).rejects.toThrow("REDIRECT");
    expect(mockGetVehiculo).not.toHaveBeenCalled();
  });

  it("con ordenes.trabajar pide y muestra las garantías", async () => {
    conRol("ADMIN");
    render(await VehiculoDetailPage({ params: Promise.resolve({ id: "v1" }) }));
    expect(mockGarantias).toHaveBeenCalledWith("v1");
    expect(screen.getByText("TARJETA-GARANTIAS")).toBeInTheDocument();
  });

  it("sin ordenes.trabajar no pide ni muestra las garantías", async () => {
    permisos = ["clientes.ver"];
    render(await VehiculoDetailPage({ params: Promise.resolve({ id: "v1" }) }));
    expect(mockGarantias).not.toHaveBeenCalled();
    expect(screen.queryByText("TARJETA-GARANTIAS")).not.toBeInTheDocument();
  });
});
