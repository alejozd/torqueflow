import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequirePermiso = vi.fn();
import { permisosEfectivos } from "@/lib/auth/permisos";
vi.mock("@/lib/auth/guards", () => ({ requirePermiso: (...a: unknown[]) => mockRequirePermiso(...a),
  requireSession: vi.fn(),
  puede: (session: { user: { permisos: string[] } }, permiso: string) => session.user.permisos.includes(permiso), }));
const db = {
  cajaSesion: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  pago: { findMany: vi.fn() },
  pagoVentaMostrador: { findMany: vi.fn() },
  devolucionMostrador: { findMany: vi.fn() },
  pagoProveedor: { findMany: vi.fn() },
  anticipo: { findMany: vi.fn() },
  gasto: { findMany: vi.fn() },
  sede: { findUnique: vi.fn() },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { abrirCajaAction, cerrarCajaAction, getCajaActual, listCajasCerradas } from "./caja-actions";

const inicial = { error: null, success: false };
const RECEPCION = { user: { id: "u2", role: "RECEPCION", permisos: permisosEfectivos({ role: "RECEPCION" }), tenantSchema: "t", sedeActivaId: "s1" } };
const ADMIN = { user: { id: "u1", role: "ADMIN", permisos: permisosEfectivos({ role: "ADMIN" }), tenantSchema: "t", sedeActivaId: "s1" } };
const ABIERTA_AT = new Date("2026-10-15T13:00:00Z");

function form(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

function sesionAbierta(extra: Record<string, unknown> = {}) {
  return {
    id: "c1", sedeId: "s1", baseInicial: 100000, abiertaAt: ABIERTA_AT, cerradaAt: null,
    abiertaPor: { nombre: "Ana" }, ...extra,
  };
}

function movimientosVacios() {
  db.pago.findMany.mockResolvedValue([]);
  db.pagoVentaMostrador.findMany.mockResolvedValue([]);
  db.devolucionMostrador.findMany.mockResolvedValue([]);
  db.pagoProveedor.findMany.mockResolvedValue([]);
  db.anticipo.findMany.mockResolvedValue([]);
  db.gasto.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.cajaSesion.updateMany.mockResolvedValue({ count: 1 });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T20:00:00Z"));
  mockRequirePermiso.mockResolvedValue(RECEPCION);
  movimientosVacios();
});
afterEach(() => vi.useRealTimers());

describe("getCajaActual", () => {
  it("rechaza TECNICO (requirePermiso lanza)", async () => {
    mockRequirePermiso.mockRejectedValue(new Error("redirect"));
    await expect(getCajaActual({})).rejects.toThrow();
    expect(mockRequirePermiso).toHaveBeenCalledWith("caja.usar");
  });

  it("sin caja abierta devuelve caja null", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);
    const r = await getCajaActual({});
    expect(r).toMatchObject({ sedeId: "s1", caja: null, resumen: null, movimientos: [] });
    expect(db.pago.findMany).not.toHaveBeenCalled();
  });

  it("RECEPCION queda forzada a su sede aunque pida otra", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);
    await getCajaActual({ sedeId: "s2" });
    expect(db.cajaSesion.findFirst.mock.calls[0][0].where).toEqual({ sedeId: "s1", cerradaAt: null });
  });

  it("ADMIN puede consultar otra sede", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.cajaSesion.findFirst.mockResolvedValue(null);
    const r = await getCajaActual({ sedeId: "s2" });
    expect(r.sedeId).toBe("s2");
  });

  it("calcula el resumen, excluye pagos ANTICIPO por filtro y arma movimientos", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(sesionAbierta());
    db.pago.findMany.mockResolvedValue([
      { id: "p1", monto: 50000, metodoPago: "EFECTIVO", createdAt: new Date("2026-10-15T14:00:00Z"), factura: { numero: 7 } },
    ]);
    db.anticipo.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if ("devueltoAt" in where) {
        return [{ id: "a2", monto: 10000, metodoDevolucion: "EFECTIVO", devueltoAt: new Date("2026-10-15T16:00:00Z") }];
      }
      return [{ id: "a1", monto: 20000, metodoPago: "EFECTIVO", createdAt: new Date("2026-10-15T15:00:00Z") }];
    });
    db.gasto.findMany.mockResolvedValue([
      { id: "g1", monto: 5000, descripcion: "Taxi", createdAt: new Date("2026-10-15T17:00:00Z") },
    ]);

    const r = await getCajaActual({});

    const wherePago = db.pago.findMany.mock.calls[0][0].where;
    expect(wherePago.metodoPago).toEqual({ not: "ANTICIPO" });
    expect(wherePago.factura).toEqual({ orden: { sedeId: "s1" } });
    expect(wherePago.createdAt).toEqual({ gte: ABIERTA_AT, lt: new Date("2026-10-15T20:00:00Z") });
    expect(db.gasto.findMany.mock.calls[0][0].where).toMatchObject({ sedeId: "s1", pagadoEnEfectivo: true });
    // 100000 + 50000 + 20000 - 10000 - 5000
    expect(r.resumen?.efectivoEsperado).toBe(155000);
    expect(r.movimientos).toHaveLength(4);
    expect(r.movimientos.map((m) => m.tipo).sort()).toEqual(["ANTICIPO", "DEVOLUCION", "GASTO", "PAGO"]);
    expect(r.caja).toMatchObject({ id: "c1", baseInicial: 100000, abiertaPorNombre: "Ana" });
  });

  it("un abono a proveedor en efectivo resta del arqueo (Fase 24)", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(sesionAbierta());
    db.pagoProveedor.findMany.mockResolvedValue([
      {
        id: "pp1",
        monto: 40000,
        metodoPago: "EFECTIVO",
        createdAt: new Date("2026-10-15T19:00:00Z"),
        cuenta: { proveedor: { nombre: "Repuestos del Norte" } },
      },
    ]);

    const r = await getCajaActual({});

    // 100000 - 40000
    expect(r.resumen?.efectivoEsperado).toBe(60000);
    expect(db.pagoProveedor.findMany.mock.calls[0][0].where).toMatchObject({
      metodoPago: "EFECTIVO",
      cuenta: { entrada: { bodega: { sedeId: "s1" } } },
    });
    expect(r.movimientos.map((m) => [m.tipo, m.monto])).toEqual([["PAGO_PROVEEDOR", -40000]]);
  });

  it("las ventas de mostrador suman y sus devoluciones restan en el arqueo (Fase 24)", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(sesionAbierta());
    db.pagoVentaMostrador.findMany.mockResolvedValue([
      { id: "pv1", monto: 80000, metodoPago: "EFECTIVO", createdAt: new Date("2026-10-15T14:30:00Z"), venta: { numero: 3 } },
    ]);
    db.devolucionMostrador.findMany.mockResolvedValue([
      {
        id: "d1",
        total: 30000,
        montoEnEfectivo: 30000,
        metodoPago: "EFECTIVO",
        createdAt: new Date("2026-10-15T18:00:00Z"),
        venta: { numero: 3 },
      },
    ]);

    const r = await getCajaActual({});

    // 100000 + 80000 - 30000
    expect(r.resumen?.efectivoEsperado).toBe(150000);
    expect(r.resumen?.totalIngresos).toBe(80000);
    expect(db.pagoVentaMostrador.findMany.mock.calls[0][0].where).toMatchObject({ venta: { sedeId: "s1" } });
    expect(db.devolucionMostrador.findMany.mock.calls[0][0].where).toMatchObject({ sedeId: "s1" });
    expect(r.movimientos.map((m) => [m.tipo, m.monto])).toEqual([
      ["VENTA", 80000],
      ["DEVOLUCION", -30000],
    ]);
  });
});

describe("abrirCajaAction", () => {
  it("abre la caja en la sede activa de RECEPCION", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);
    const r = await abrirCajaAction(inicial, form({ baseInicial: "50000", sedeId: "s2" }));
    expect(r).toEqual({ error: null, success: true });
    expect(db.cajaSesion.create).toHaveBeenCalledWith({
      data: { sedeId: "s1", baseInicial: 50000, abiertaPorId: "u2" },
    });
  });

  it("abrir dos veces falla", async () => {
    db.cajaSesion.findFirst.mockResolvedValue({ id: "c1" });
    const r = await abrirCajaAction(inicial, form({ baseInicial: "50000" }));
    expect(r).toEqual({ error: "Ya hay una caja abierta en esta sede", success: false });
    expect(db.cajaSesion.create).not.toHaveBeenCalled();
  });

  it("P2002 del índice parcial en apertura concurrente da el mismo mensaje", async () => {
    db.cajaSesion.findFirst.mockResolvedValue(null);
    db.cajaSesion.create.mockRejectedValue({ code: "P2002" });
    const r = await abrirCajaAction(inicial, form({ baseInicial: "0" }));
    expect(r.error).toBe("Ya hay una caja abierta en esta sede");
  });

  it("rechaza base negativa", async () => {
    const r = await abrirCajaAction(inicial, form({ baseInicial: "-5" }));
    expect(r.success).toBe(false);
    expect(db.cajaSesion.create).not.toHaveBeenCalled();
  });

  it("ADMIN valida que la sede exista", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.sede.findUnique.mockResolvedValue(null);
    const r = await abrirCajaAction(inicial, form({ baseInicial: "0", sedeId: "zz" }));
    expect(r.error).toBe("Sede no encontrada");
  });
});

describe("cerrarCajaAction", () => {
  it("recalcula el esperado en el servidor ignorando lo enviado por el cliente", async () => {
    db.cajaSesion.findUnique.mockResolvedValue(sesionAbierta());
    db.pago.findMany.mockResolvedValue([
      { id: "p1", monto: 50000, metodoPago: "EFECTIVO", createdAt: new Date("2026-10-15T14:00:00Z"), factura: { numero: 7 } },
    ]);
    const r = await cerrarCajaAction("c1", inicial, form({ efectivoContado: "150000", efectivoEsperado: "999", notas: "ok" }));
    expect(r).toEqual({ error: null, success: true });
    expect(db.cajaSesion.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", cerradaAt: null },
      data: {
        cerradaAt: new Date("2026-10-15T20:00:00Z"),
        cerradaPorId: "u2",
        efectivoEsperado: 150000,
        efectivoContado: 150000,
        notas: "ok",
      },
    });
  });

  it("un cierre concurrente que ya cerró la caja devuelve el mismo error", async () => {
    db.cajaSesion.findUnique.mockResolvedValue(sesionAbierta());
    db.cajaSesion.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await cerrarCajaAction("c1", inicial, form({ efectivoContado: "100000" }));
    expect(r).toEqual({ error: "La caja ya está cerrada", success: false });
  });

  it("falla si la caja no existe o ya está cerrada", async () => {
    db.cajaSesion.findUnique.mockResolvedValue(null);
    expect((await cerrarCajaAction("c1", inicial, form({ efectivoContado: "1" }))).error).toBe("Caja no encontrada");
    db.cajaSesion.findUnique.mockResolvedValue(sesionAbierta({ cerradaAt: new Date() }));
    expect((await cerrarCajaAction("c1", inicial, form({ efectivoContado: "1" }))).error).toBe("La caja ya está cerrada");
    expect(db.cajaSesion.updateMany).not.toHaveBeenCalled();
  });

  it("RECEPCION no puede cerrar la caja de otra sede", async () => {
    db.cajaSesion.findUnique.mockResolvedValue(sesionAbierta({ sedeId: "s2" }));
    const r = await cerrarCajaAction("c1", inicial, form({ efectivoContado: "1" }));
    expect(r.error).toBe("Caja no encontrada");
    expect(db.cajaSesion.updateMany).not.toHaveBeenCalled();
  });

  it("ADMIN sí puede cerrar la caja de otra sede", async () => {
    mockRequirePermiso.mockResolvedValue(ADMIN);
    db.cajaSesion.findUnique.mockResolvedValue(sesionAbierta({ sedeId: "s2" }));
    const r = await cerrarCajaAction("c1", inicial, form({ efectivoContado: "100000" }));
    expect(r.success).toBe(true);
  });

  it("rechaza efectivo contado inválido", async () => {
    const r = await cerrarCajaAction("c1", inicial, form({ efectivoContado: "-1" }));
    expect(r.success).toBe(false);
    expect(db.cajaSesion.updateMany).not.toHaveBeenCalled();
  });
});

describe("listCajasCerradas", () => {
  it("lista el mes con la diferencia calculada y RECEPCION limitada a su sede", async () => {
    db.cajaSesion.findMany.mockResolvedValue([
      {
        id: "c1", abiertaAt: ABIERTA_AT, cerradaAt: new Date("2026-10-15T23:00:00Z"), baseInicial: 100000,
        efectivoEsperado: 150000, efectivoContado: 148000, notas: null,
        abiertaPor: { nombre: "Ana" }, cerradaPor: { nombre: "Luis" },
      },
    ]);
    const r = await listCajasCerradas({ sedeId: "s2", periodo: "2026-10" });
    expect(db.cajaSesion.findMany.mock.calls[0][0].where).toMatchObject({
      sedeId: "s1",
      cerradaAt: { not: null },
      // El mes corta a medianoche de Bogotá: abiertaAt es un instante, no una fecha.
      abiertaAt: { gte: new Date("2026-10-01T05:00:00.000Z"), lt: new Date("2026-11-01T05:00:00.000Z") },
    });
    expect(r[0]).toMatchObject({ id: "c1", esperado: 150000, contado: 148000, diferencia: -2000, tipo: "FALTANTE", cerroPorNombre: "Luis" });
  });
});
