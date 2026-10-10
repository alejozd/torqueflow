import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a), requireSession: vi.fn() }));
const db = {
  cajaSesion: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  pago: { findMany: vi.fn() },
  anticipo: { findMany: vi.fn() },
  gasto: { findMany: vi.fn() },
  sede: { findUnique: vi.fn() },
};
vi.mock("@/lib/db/tenant-client", () => ({ getTenantDb: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { abrirCajaAction, cerrarCajaAction, getCajaActual, listCajasCerradas } from "./caja-actions";

const inicial = { error: null, success: false };
const RECEPCION = { user: { id: "u2", role: "RECEPCION", tenantSchema: "t", sedeActivaId: "s1" } };
const ADMIN = { user: { id: "u1", role: "ADMIN", tenantSchema: "t", sedeActivaId: "s1" } };
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
  db.anticipo.findMany.mockResolvedValue([]);
  db.gasto.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T20:00:00Z"));
  mockRequireRole.mockResolvedValue(RECEPCION);
  movimientosVacios();
});
afterEach(() => vi.useRealTimers());

describe("getCajaActual", () => {
  it("rechaza TECNICO (requireRole lanza)", async () => {
    mockRequireRole.mockRejectedValue(new Error("redirect"));
    await expect(getCajaActual({})).rejects.toThrow();
    expect(mockRequireRole).toHaveBeenCalledWith(["ADMIN", "RECEPCION"]);
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
    mockRequireRole.mockResolvedValue(ADMIN);
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
    mockRequireRole.mockResolvedValue(ADMIN);
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
    expect(db.cajaSesion.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        cerradaAt: new Date("2026-10-15T20:00:00Z"),
        cerradaPorId: "u2",
        efectivoEsperado: 150000,
        efectivoContado: 150000,
        notas: "ok",
      },
    });
  });

  it("falla si la caja no existe o ya está cerrada", async () => {
    db.cajaSesion.findUnique.mockResolvedValue(null);
    expect((await cerrarCajaAction("c1", inicial, form({ efectivoContado: "1" }))).error).toBe("Caja no encontrada");
    db.cajaSesion.findUnique.mockResolvedValue(sesionAbierta({ cerradaAt: new Date() }));
    expect((await cerrarCajaAction("c1", inicial, form({ efectivoContado: "1" }))).error).toBe("La caja ya está cerrada");
    expect(db.cajaSesion.update).not.toHaveBeenCalled();
  });

  it("RECEPCION no puede cerrar la caja de otra sede", async () => {
    db.cajaSesion.findUnique.mockResolvedValue(sesionAbierta({ sedeId: "s2" }));
    const r = await cerrarCajaAction("c1", inicial, form({ efectivoContado: "1" }));
    expect(r.error).toBe("Caja no encontrada");
    expect(db.cajaSesion.update).not.toHaveBeenCalled();
  });

  it("ADMIN sí puede cerrar la caja de otra sede", async () => {
    mockRequireRole.mockResolvedValue(ADMIN);
    db.cajaSesion.findUnique.mockResolvedValue(sesionAbierta({ sedeId: "s2" }));
    const r = await cerrarCajaAction("c1", inicial, form({ efectivoContado: "100000" }));
    expect(r.success).toBe(true);
  });

  it("rechaza efectivo contado inválido", async () => {
    const r = await cerrarCajaAction("c1", inicial, form({ efectivoContado: "-1" }));
    expect(r.success).toBe(false);
    expect(db.cajaSesion.update).not.toHaveBeenCalled();
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
    expect(db.cajaSesion.findMany.mock.calls[0][0].where).toMatchObject({ sedeId: "s1", cerradaAt: { not: null } });
    expect(r[0]).toMatchObject({ id: "c1", esperado: 150000, contado: 148000, diferencia: -2000, tipo: "FALTANTE", cerroPorNombre: "Luis" });
  });
});
