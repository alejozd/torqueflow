import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockRequireSession = vi.fn();
const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
  requireSession: () => mockRequireSession(),
  requireRole: (roles: string[]) => mockRequireRole(roles),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => mockRevalidatePath(path) }));

const repuesto = { findMany: vi.fn(), updateMany: vi.fn() };
const itemOrden = { findMany: vi.fn() };
const entradaMercanciaItem = { findMany: vi.fn() };

vi.mock("@/lib/db/tenant-client", () => ({
  getTenantDb: () => ({ repuesto, itemOrden, entradaMercanciaItem }),
}));

import { getAlertasInventario, posponerAlertaInventarioAction, reactivarAlertaInventarioAction } from "./alertas-inventario-actions";

const SEDE_ID = "sede-1";
const HOY = new Date("2026-10-09T15:00:00.000Z");

function repuestoRow(id: string, stockActual: number, stockMinimo: number) {
  return {
    id,
    codigo: id.toUpperCase(),
    nombre: `Repuesto ${id}`,
    stockActual,
    stockMinimo,
    precioCompra: { toString: () => "1500" },
    stockMaximo: null,
    multiploCompra: 1,
    alertaPospuestaHasta: null,
    bodega: { id: "b1", nombre: "Principal" },
    proveedor: { id: "p1", nombre: "Bosch", telefono: "3100000000", email: null, diasEntrega: 2 },
  };
}

/** The two itemOrden queries differ by whether they filter on an open (factura: null) orden. */
function stubItemOrden({ comprometidos = [], consumidos = [] }: { comprometidos?: unknown[]; consumidos?: unknown[] }) {
  itemOrden.findMany.mockImplementation(({ where }) =>
    Promise.resolve(where.orden.factura === null ? comprometidos : consumidos),
  );
}

describe("getAlertasInventario", () => {
  beforeEach(() => {
    mockRequireSession.mockReset().mockResolvedValue({ user: { tenantSchema: "taller_perez", sedeActivaId: SEDE_ID } });
    repuesto.findMany.mockReset().mockResolvedValue([]);
    itemOrden.findMany.mockReset();
    entradaMercanciaItem.findMany.mockReset().mockResolvedValue([]);
    stubItemOrden({});
    vi.useFakeTimers();
    vi.setSystemTime(HOY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scopes repuestos and both itemOrden queries to the sede activa through the bodega", async () => {
    await getAlertasInventario();

    expect(repuesto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { bodega: { sedeId: SEDE_ID } } }));
    for (const [args] of itemOrden.findMany.mock.calls) {
      expect(args.where.repuesto).toEqual({ bodega: { sedeId: SEDE_ID } });
      expect(args.where.orden.estado).toEqual({ not: "ANULADA" });
    }
  });

  it("limits consumption to ordenes invoiced in the last 90 days", async () => {
    await getAlertasInventario();

    const consumo = itemOrden.findMany.mock.calls.map(([args]) => args).find((args) => args.where.orden.factura !== null);
    expect(consumo.where.orden.factura.createdAt.gte).toEqual(new Date("2026-07-11T15:00:00.000Z"));
  });

  it("skips the purchase-history query when nothing is alerted", async () => {
    repuesto.findMany.mockResolvedValue([repuestoRow("a", 10, 2)]);

    const resultado = await getAlertasInventario();

    expect(resultado.alertas).toEqual([]);
    expect(entradaMercanciaItem.findMany).not.toHaveBeenCalled();
  });

  it("subtracts units on open ordenes and attaches the last purchase of alerted repuestos only", async () => {
    repuesto.findMany.mockResolvedValue([repuestoRow("a", 6, 5), repuestoRow("b", 20, 5)]);
    stubItemOrden({
      comprometidos: [
        {
          repuestoId: "a",
          cantidad: 4,
          orden: { id: "o1", estado: "EN_PROCESO", vehiculo: { placa: "ABC123", marca: "Mazda", modelo: "3" } },
        },
        { repuestoId: null, cantidad: 9, orden: { id: "o2", estado: "BORRADOR", vehiculo: { placa: "X", marca: "Y", modelo: "Z" } } },
      ],
      consumidos: [{ repuestoId: "a", cantidad: 9, orden: { factura: { createdAt: new Date("2026-10-01T00:00:00.000Z") } } }],
    });
    entradaMercanciaItem.findMany.mockResolvedValue([
      {
        repuestoId: "a",
        cantidad: 10,
        precioCompraUnitario: { toString: () => "1500" },
        createdAt: new Date("2026-09-20T00:00:00.000Z"),
        entrada: { proveedor: { nombre: "Bosch" } },
      },
    ]);

    const { alertas, resumen } = await getAlertasInventario();

    expect(entradaMercanciaItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { repuestoId: { in: ["a"] } } }),
    );
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      id: "a",
      comprometido: 4,
      disponible: 2,
      precioCompra: 1500,
      ordenes: [{ id: "o1", placa: "ABC123", vehiculo: "Mazda 3", cantidad: 4, estado: "EN_PROCESO" }],
      ultimaCompra: { cantidad: 10, precioUnitario: 1500, proveedorNombre: "Bosch", fecha: "2026-09-20T00:00:00.000Z" },
    });
    expect(alertas[0].consumoDiario).toBeCloseTo(0.1);
    expect(resumen.total).toBe(1);
  });
});

describe("posponer / reactivar alerta", () => {
  beforeEach(() => {
    mockRequireRole.mockReset().mockResolvedValue({ user: { tenantSchema: "taller_perez", sedeActivaId: SEDE_ID } });
    mockRevalidatePath.mockReset();
    repuesto.updateMany.mockReset().mockResolvedValue({ count: 1 });
    vi.useFakeTimers();
    vi.setSystemTime(HOY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("snoozes for 7 days, scoped to the sede, with the same roles as editing a repuesto", async () => {
    const resultado = await posponerAlertaInventarioAction("r1");

    expect(resultado).toEqual({ error: null });
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
    expect(repuesto.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", bodega: { sedeId: SEDE_ID } },
      data: { alertaPospuestaHasta: new Date("2026-10-16T15:00:00.000Z") },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("reactivates by clearing the date", async () => {
    await reactivarAlertaInventarioAction("r1");
    expect(repuesto.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { alertaPospuestaHasta: null } }));
  });

  it("reports a repuesto outside the sede without revalidating", async () => {
    repuesto.updateMany.mockResolvedValue({ count: 0 });

    const resultado = await posponerAlertaInventarioAction("ajeno");

    expect(resultado).toEqual({ error: "Repuesto no encontrado en tu sede activa." });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});
