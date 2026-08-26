import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockRequireSession = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireSession: () => mockRequireSession(),
}));

const ordenTrabajo = { count: vi.fn(), findMany: vi.fn() };
const cita = { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() };
const factura = { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() };
const repuesto = { findMany: vi.fn() };

vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ ordenTrabajo, cita, factura, repuesto }),
}));

import { getDashboardOverview } from "./dashboard-actions";

const SEDE_ID = "sede-1";

function resetMocks() {
  mockRequireSession.mockReset().mockResolvedValue({
    user: { tenantSchema: "taller_perez", sedeActivaId: SEDE_ID },
  });
  ordenTrabajo.count.mockReset();
  ordenTrabajo.findMany.mockReset();
  cita.count.mockReset();
  cita.findFirst.mockReset();
  cita.findMany.mockReset();
  factura.aggregate.mockReset();
  factura.count.mockReset();
  factura.findMany.mockReset();
  repuesto.findMany.mockReset();
}

/** Wires every query to a harmless empty/zero default so a test only needs to override what it checks. */
function stubDefaults() {
  ordenTrabajo.count.mockResolvedValue(0);
  ordenTrabajo.findMany.mockResolvedValue([]);
  cita.count.mockResolvedValue(0);
  cita.findFirst.mockResolvedValue(null);
  cita.findMany.mockResolvedValue([]);
  factura.aggregate.mockResolvedValue({ _sum: { saldoPendiente: null } });
  factura.count.mockResolvedValue(0);
  factura.findMany.mockResolvedValue([]);
  repuesto.findMany.mockResolvedValue([]);
}

describe("getDashboardOverview", () => {
  beforeEach(() => {
    resetMocks();
    stubDefaults();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scopes every query to the sede activa from the session", async () => {
    await getDashboardOverview();

    for (const call of ordenTrabajo.count.mock.calls) {
      expect(call[0].where).toMatchObject({ sedeId: SEDE_ID });
    }
    for (const call of ordenTrabajo.findMany.mock.calls) {
      expect(call[0].where).toMatchObject({ sedeId: SEDE_ID });
    }
    expect(cita.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE_ID }) }));
    expect(cita.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE_ID }) }));
    expect(factura.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orden: { sedeId: SEDE_ID } }) }),
    );
    expect(repuesto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ bodega: { sedeId: SEDE_ID } } ) }),
    );
  });

  it("computes enTaller as BORRADOR+EN_PROCESO+TERMINADA count plus terminadasHoy", async () => {
    ordenTrabajo.count.mockImplementation(({ where }) => {
      if (Array.isArray(where.estado?.in)) return Promise.resolve(7);
      if (where.estado === "TERMINADA" && where.updatedAt) return Promise.resolve(2);
      return Promise.resolve(0);
    });

    const overview = await getDashboardOverview();

    expect(overview.enTaller).toEqual({ total: 7, terminadasHoy: 2 });
  });

  it("computes citasHoy total and the next upcoming appointment", async () => {
    cita.count.mockResolvedValue(3);
    cita.findFirst.mockResolvedValue({
      fechaHora: new Date("2026-08-25T18:30:00.000Z"),
      vehiculo: { placa: "ABC123" },
    });

    const overview = await getDashboardOverview();

    expect(overview.citasHoy.total).toBe(3);
    // 18:30 UTC == 13:30 America/Bogota (UTC-5, no DST).
    expect(overview.citasHoy.proxima).toEqual({ hora: "13:30", placa: "ABC123" });
  });

  it("returns null proxima when there is no upcoming appointment left today", async () => {
    cita.findFirst.mockResolvedValue(null);

    const overview = await getDashboardOverview();

    expect(overview.citasHoy.proxima).toBeNull();
  });

  it("computes porFacturar count and monto from items + mano de obra of TERMINADA ordenes without factura", async () => {
    ordenTrabajo.findMany.mockImplementation(({ where }) => {
      if (where.estado === "TERMINADA" && where.factura === null) {
        return Promise.resolve([
          {
            items: [{ cantidad: 2, precioUnitario: 10 }],
            manoDeObra: [{ horas: 1, precioHora: 20 }],
          },
          {
            items: [],
            manoDeObra: [{ horas: 2, precioHora: 15 }],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const overview = await getDashboardOverview();

    expect(overview.porFacturar.count).toBe(2);
    expect(overview.porFacturar.monto).toBe(2 * 10 + 1 * 20 + 2 * 15);
  });

  it("computes cartera from Factura.saldoPendiente sum and pending count, defaulting a null sum to 0", async () => {
    factura.aggregate.mockResolvedValue({ _sum: { saldoPendiente: null } });
    factura.count.mockResolvedValue(0);

    const overview = await getDashboardOverview();

    expect(overview.cartera).toEqual({ saldoPendiente: 0, facturasPendientes: 0 });
  });

  it("computes stockBajo total and sinExistencias from scoped repuestos, without inventing a two-column DB filter", async () => {
    repuesto.findMany.mockResolvedValue([
      { id: "r1", codigo: "A1", nombre: "Filtro", stockActual: 0, stockMinimo: 4 },
      { id: "r2", codigo: "A2", nombre: "Bujía", stockActual: 3, stockMinimo: 5 },
      { id: "r3", codigo: "A3", nombre: "Aceite", stockActual: 10, stockMinimo: 5 },
    ]);

    const overview = await getDashboardOverview();

    expect(overview.stockBajo).toEqual({ count: 2, sinExistencias: 1 });
    // Most critical (biggest deficit) first.
    expect(overview.alertasInventario.map((r) => r.codigo)).toEqual(["A1", "A2"]);
  });

  it("computes flujo del taller counts by estado, entregadasHoy scoped to entregadaAt today", async () => {
    ordenTrabajo.count.mockImplementation(({ where }) => {
      if (where.estado === "BORRADOR") return Promise.resolve(1);
      if (where.estado === "EN_PROCESO") return Promise.resolve(2);
      if (where.estado === "TERMINADA" && !where.updatedAt) return Promise.resolve(3);
      if (where.estado === "ENTREGADA") return Promise.resolve(4);
      return Promise.resolve(0);
    });

    const overview = await getDashboardOverview();

    expect(overview.flujo).toEqual({ borrador: 1, enProceso: 2, terminadas: 3, entregadasHoy: 4 });
  });

  it("excludes ANULADA from ordenesRecientes and orders by updatedAt desc", async () => {
    await getDashboardOverview();

    const recentesCall = ordenTrabajo.findMany.mock.calls.find(
      (call) => call[0].orderBy?.updatedAt === "desc",
    );
    expect(recentesCall).toBeDefined();
    expect(recentesCall![0].where.estado).toEqual({ not: "ANULADA" });
    expect(recentesCall![0].take).toBe(4);
  });

  it("maps ordenesRecientes rows with a total derived from factura.total when already invoiced", async () => {
    ordenTrabajo.findMany.mockImplementation(({ orderBy }) => {
      if (orderBy?.updatedAt === "desc") {
        return Promise.resolve([
          {
            id: "o1",
            estado: "ENTREGADA",
            vehiculo: { placa: "XYZ789" },
            cliente: { nombre: "Ana" },
            mecanico: { nombre: "Luis" },
            items: [{ cantidad: 1, precioUnitario: 999 }],
            manoDeObra: [],
            factura: { total: 123.45 },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const overview = await getDashboardOverview();

    expect(overview.ordenesRecientes).toEqual([
      {
        id: "o1",
        placa: "XYZ789",
        clienteNombre: "Ana",
        mecanicoNombre: "Luis",
        estado: "ENTREGADA",
        total: 123.45,
      },
    ]);
  });

  it("maps agendaHoy rows in the shape the Inicio page renders", async () => {
    cita.findMany.mockResolvedValue([
      {
        id: "c1",
        fechaHora: new Date("2026-08-25T14:00:00.000Z"),
        motivo: "Cambio de aceite",
        estado: "CONFIRMADA",
        vehiculo: { placa: "AAA111" },
        cliente: { nombre: "Pedro" },
      },
    ]);

    const overview = await getDashboardOverview();

    expect(overview.agendaHoy).toEqual([
      {
        id: "c1",
        // 14:00 UTC == 09:00 America/Bogota (UTC-5, no DST).
        hora: "09:00",
        placa: "AAA111",
        motivo: "Cambio de aceite",
        clienteNombre: "Pedro",
        estado: "CONFIRMADA",
      },
    ]);
  });

  it("groups facturacion7Dias per UTC day ending today", async () => {
    factura.findMany.mockResolvedValue([
      { createdAt: new Date("2026-08-25T10:00:00.000Z"), total: 100 },
      { createdAt: new Date("2026-08-20T10:00:00.000Z"), total: 50 },
    ]);

    const overview = await getDashboardOverview();

    expect(overview.facturacion7Dias).toHaveLength(7);
    expect(overview.facturacion7Dias[0].fecha).toBe("2026-08-19");
    expect(overview.facturacion7Dias.at(-1)).toEqual({ fecha: "2026-08-25", total: 100 });
    expect(overview.facturacion7Dias.find((d) => d.fecha === "2026-08-20")).toEqual({
      fecha: "2026-08-20",
      total: 50,
    });
  });
});
