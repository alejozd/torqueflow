import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireSession: () => mockRequireSession() }));

const mockFindMany = vi.fn();
const mockConfiguracionFindUnique = vi.fn();
vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({
    ordenTrabajo: { findMany: mockFindMany },
    configuracionTaller: { findUnique: mockConfiguracionFindUnique },
  }),
}));

import { getAlertasTaller } from "./alertas-taller-actions";

const SESSION = { user: { id: "u1", role: "ADMIN", tenantSchema: "taller_perez", sedeActivaId: "sede-1" } };

const HACE = (dias: number, horas = 0) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000 - horas * 60 * 60 * 1000);

function fila(cambios: Record<string, unknown> = {}) {
  return {
    id: "o1",
    estado: "EN_PROCESO",
    createdAt: HACE(20),
    updatedAt: HACE(6),
    prioridad: "NORMAL",
    sintomas: "Ruido",
    items: [],
    manoDeObra: [],
    dvi: null,
    danios: [],
    vehiculo: { placa: "ABC123" },
    cliente: { nombre: "Ana" },
    mecanico: { nombre: "Luis" },
    ...cambios,
  };
}

describe("getAlertasTaller", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue(SESSION);
    mockConfiguracionFindUnique.mockReset().mockResolvedValue({ diasOrdenEstancada: 3 });
    mockFindMany.mockReset().mockResolvedValue([]);
  });

  it("clasifica estancadas y terminadas sin entregar, y deja fuera lo que tiene trabajo reciente", async () => {
    mockFindMany.mockResolvedValue([
      fila({ id: "estancada" }),
      fila({ id: "terminada", estado: "TERMINADA", updatedAt: HACE(4) }),
      fila({ id: "con-trabajo", updatedAt: HACE(30), items: [{ createdAt: HACE(0, 1) }] }),
    ]);

    const { diasUmbral, alertas } = await getAlertasTaller();

    expect(diasUmbral).toBe(3);
    expect(alertas.map((alerta) => [alerta.ordenId, alerta.motivo, alerta.dias])).toEqual([
      ["estancada", "ESTANCADA", 6],
      ["terminada", "TERMINADA_SIN_ENTREGAR", 4],
    ]);
    expect(alertas[0]).toMatchObject({ placa: "ABC123", cliente: "Ana", mecanico: "Luis", prioridad: "NORMAL" });
  });

  it("solo mira órdenes vivas de la sede activa y con lo mínimo para decidir", async () => {
    await getAlertasTaller();

    const consulta = mockFindMany.mock.calls[0]![0] as { where: Record<string, unknown>; select: Record<string, unknown> };

    expect(consulta.where).toEqual({ sedeId: "sede-1", estado: { in: ["EN_PROCESO", "TERMINADA"] } });
    // Nada de `Usuario` completo: el nombre del mecánico y poco más.
    expect(consulta.select).toMatchObject({ mecanico: { select: { nombre: true } }, cliente: { select: { nombre: true } } });
  });

  it("usa el umbral guardado y, sin fila de configuración, el de por defecto", async () => {
    mockFindMany.mockResolvedValue([fila({ updatedAt: HACE(5) })]);
    mockConfiguracionFindUnique.mockResolvedValue({ diasOrdenEstancada: 10 });

    expect((await getAlertasTaller()).alertas).toEqual([]);

    mockConfiguracionFindUnique.mockResolvedValue(null);
    expect((await getAlertasTaller()).alertas).toHaveLength(1);
  });

  it("pone primero lo más urgente y, a igualdad, lo más parado", async () => {
    mockFindMany.mockResolvedValue([
      fila({ id: "normal", prioridad: "NORMAL", updatedAt: HACE(4) }),
      fila({ id: "urgente-vieja", prioridad: "URGENTE", updatedAt: HACE(9) }),
      fila({ id: "urgente-nueva", prioridad: "URGENTE", updatedAt: HACE(3) }),
    ]);

    const { alertas } = await getAlertasTaller();

    expect(alertas.map((alerta) => alerta.ordenId)).toEqual(["urgente-vieja", "urgente-nueva", "normal"]);
  });

  it("sin órdenes vivas no hay alertas", async () => {
    expect(await getAlertasTaller()).toEqual({ diasUmbral: 3, alertas: [] });
  });
});
