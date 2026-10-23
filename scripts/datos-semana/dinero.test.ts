import { describe, expect, it, vi } from "vitest";
import { crearAzar } from "./azar";
import type { Contexto } from "./contexto";
import { computeFacturaTotales } from "@/lib/factura/totales";
import { abrirCaja, cerrarCaja, facturarYCobrar, registrarAnticiposPendientes, type OrdenParaCobrar } from "./dinero";
import type { EstadoEjecucion, TenantTx } from "./ejecutor";
import type { PlanDia } from "./tipos";

const ctx = { recepcionistaId: "rec1" } as unknown as Contexto;
const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
const nuevoEstado = (): EstadoEjecucion => ({
  ordenes: new Map(), cajaAbierta: new Map(), creados: {},
  clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(), anticiposPendientes: [],
});
const vacio = () => ({ findMany: vi.fn(async () => []) });

describe("abrirCaja", () => {
  it("crea la sesión con sede, base > 0, hora de Bogotá y la registra", async () => {
    const create = vi.fn(async (_a: unknown) => ({ id: "c1" }));
    const tx = { cajaSesion: { findFirst: vi.fn(async () => null), create } } as unknown as TenantTx;
    const estado = nuevoEstado();
    await abrirCaja(tx, ctx, estado, dia, { tipo: "abrirCaja", hora: "07:45" }, crearAzar(1));
    const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.sedeId).toBe("s1");
    expect(data.baseInicial as number).toBeGreaterThan(0);
    expect(data.abiertaAt).toEqual(new Date("2026-10-20T07:45:00-05:00"));
    expect(data.notas).toContain("[datos-semana]");
    expect(estado.cajaAbierta.get("s1")).toBe("c1");
  });

  it("no toca una caja ya abierta en la sede", async () => {
    const create = vi.fn();
    const tx = { cajaSesion: { findFirst: vi.fn(async () => ({ id: "real" })), create } } as unknown as TenantTx;
    const estado = nuevoEstado();
    await abrirCaja(tx, ctx, estado, dia, { tipo: "abrirCaja", hora: "07:45" }, crearAzar(1));
    expect(create).not.toHaveBeenCalled();
    expect(estado.cajaAbierta.size).toBe(0);
  });
});

describe("abrirCaja: un solo turno por día y sede", () => {
  it("busca una caja abierta o abierta ese día (hora de Bogotá) en la sede, y si existe no abre otra", async () => {
    const create = vi.fn();
    const findFirst = vi.fn(async (_a: unknown) => ({ id: "cerrada-real" }));
    const tx = { cajaSesion: { findFirst, create } } as unknown as TenantTx;
    const estado = nuevoEstado();
    await abrirCaja(tx, ctx, estado, dia, { tipo: "abrirCaja", hora: "07:45" }, crearAzar(1));
    expect(create).not.toHaveBeenCalled();
    expect(estado.cajaAbierta.size).toBe(0);
    const where = (findFirst.mock.calls[0] as unknown as [{ where: { sedeId: string; OR: Record<string, unknown>[] } }])[0].where;
    expect(where.sedeId).toBe("s1");
    expect(where.OR).toContainEqual({ cerradaAt: null });
    expect(where.OR).toContainEqual({
      abiertaAt: { gte: new Date("2026-10-20T00:00:00-05:00"), lt: new Date("2026-10-21T00:00:00-05:00") },
    });
  });

  it("hoy, antes de la hora de apertura, abiertaAt no queda en el futuro", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const ahora = new Date("2026-10-20T07:30:00-05:00");
      vi.setSystemTime(ahora);
      const create = vi.fn(async (_a: unknown) => ({ id: "c1" }));
      const tx = { cajaSesion: { findFirst: vi.fn(async () => null), create } } as unknown as TenantTx;
      await abrirCaja(tx, ctx, nuevoEstado(), dia, { tipo: "abrirCaja", hora: "07:50" }, crearAzar(1));
      const data = (create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
      expect((data.abiertaAt as Date).getTime()).toBeLessThanOrEqual(ahora.getTime());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("cerrarCaja", () => {
  it("calcula el esperado con los movimientos en efectivo y guarda contado = esperado + diferencia", async () => {
    const updateMany = vi.fn(async (_a: unknown) => ({ count: 1 }));
    const tx = {
      cajaSesion: {
        findUnique: vi.fn(async () => ({
          id: "c1", sedeId: "s1", baseInicial: 100000, abiertaAt: new Date("2026-10-20T12:45:00Z"), cerradaAt: null,
        })),
        updateMany,
      },
      pago: { findMany: vi.fn(async () => [{ monto: 50000, metodoPago: "EFECTIVO" }, { monto: 99000, metodoPago: "TARJETA" }]) },
      anticipo: vacio(),
      gasto: { findMany: vi.fn(async () => [{ monto: 20000 }]) },
      pagoVentaMostrador: { findMany: vi.fn(async () => [{ monto: 10000, metodoPago: "EFECTIVO" }]) },
      devolucionMostrador: vacio(),
      pagoProveedor: vacio(),
    } as unknown as TenantTx;
    const estado = nuevoEstado();
    estado.cajaAbierta.set("s1", "c1");
    await cerrarCaja(tx, ctx, estado, dia, { tipo: "cerrarCaja", hora: "17:30", diferencia: -2000 }, crearAzar(1));
    const data = (updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    // 100000 + 50000 + 10000 - 20000 = 140000
    expect(data.efectivoEsperado).toBe(140000);
    expect(data.efectivoContado).toBe(138000);
    expect(data.cerradaAt).toEqual(new Date("2026-10-20T17:30:00-05:00"));
    expect(estado.cajaAbierta.has("s1")).toBe(false);
  });

  it("sin caja abierta por el script no hace nada", async () => {
    const findUnique = vi.fn();
    const tx = { cajaSesion: { findUnique } } as unknown as TenantTx;
    await cerrarCaja(tx, ctx, nuevoEstado(), dia, { tipo: "cerrarCaja", hora: "17:30", diferencia: 0 }, crearAzar(1));
    expect(findUnique).not.toHaveBeenCalled();
  });
});

type Llamada = { data: Record<string, unknown> };
const datos = (mock: { mock: { calls: unknown[][] } }, i = 0) => (mock.mock.calls[i]![0] as Llamada).data;

const orden: OrdenParaCobrar = {
  id: "o1", clienteId: "c1",
  items: [{ repuestoId: "r1", cantidad: 2, precioUnitario: 18_900 }, { repuestoId: null, cantidad: 1, precioUnitario: 10_000 }],
  manoDeObra: [{ valor: 60_000 }],
};
const totalOrden = computeFacturaTotales({
  items: orden.items.map((i) => ({ cantidad: i.cantidad, precioUnitario: Number(i.precioUnitario) })),
  manoDeObra: orden.manoDeObra.map((l) => ({ valor: Number(l.valor) })),
  descuento: 0,
}).total;
const creada = new Date("2026-10-20T16:00:00-05:00");
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Factura y repuestos en memoria: lo bastante fiel para que saldo y estado salgan de las mismas escrituras. */
function nuevoTxFactura(opciones: { anticipos?: { id: string; monto: number; registradoPorId: string }[]; stock?: number } = {}) {
  const factura = { id: "f1", saldoPendiente: 0, estado: "PENDIENTE", total: 0 };
  const stock = { r1: opciones.stock ?? 5 };
  const m = {
    factura: {
      create: vi.fn(async (a: Llamada) => {
        Object.assign(factura, { total: a.data.total, saldoPendiente: a.data.saldoPendiente, estado: a.data.estado });
        return { id: "f1" };
      }),
      updateMany: vi.fn(async (a: { where: { saldoPendiente: { gte: number } }; data: { saldoPendiente: { decrement: number } } }) => {
        if (factura.saldoPendiente < a.where.saldoPendiente.gte) return { count: 0 };
        factura.saldoPendiente = redondear(factura.saldoPendiente - a.data.saldoPendiente.decrement);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({ ...factura })),
      update: vi.fn(async (a: Llamada & { where: unknown }) => { Object.assign(factura, a.data); return {}; }),
    },
    repuesto: {
      updateMany: vi.fn(async (a: { where: { stockActual: { gte: number } }; data: { stockActual: { decrement: number } } }) => {
        if (stock.r1 < a.where.stockActual.gte) return { count: 0 };
        stock.r1 -= a.data.stockActual.decrement;
        return { count: 1 };
      }),
    },
    anticipo: {
      findMany: vi.fn(async () => opciones.anticipos ?? []),
      updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })),
      create: vi.fn(async (_a: Llamada) => ({ id: "a1" })),
    },
    pago: { create: vi.fn(async (_a: Llamada) => ({ id: "p1" })) },
    itemOrden: { findMany: vi.fn(async () => orden.items) },
    manoDeObra: { findMany: vi.fn(async () => orden.manoDeObra) },
  };
  return { tx: m as unknown as TenantTx, m, factura, stock };
}

const pagado = (m: ReturnType<typeof nuevoTxFactura>["m"]) =>
  m.pago.create.mock.calls.map((c) => c[0].data).filter((d) => d.metodoPago !== "ANTICIPO");
const sumaMontos = (pagos: Record<string, unknown>[]) => redondear(pagos.reduce((s, p) => s + (p.monto as number), 0));

describe("facturarYCobrar", () => {
  const cobrar = (tx: TenantTx, estado: EstadoEjecucion, pago: "COMPLETO" | "PARCIAL" | "PENDIENTE", semilla = 1) =>
    facturarYCobrar(tx, ctx, estado, "s1", orden, pago, crearAzar(semilla), creada);

  it("crea la factura con los totales de computeFacturaTotales y la emite la recepcionista", async () => {
    const { tx, m } = nuevoTxFactura();
    await cobrar(tx, nuevoEstado(), "PENDIENTE");
    const d = datos(m.factura.create);
    const esperado = computeFacturaTotales({
      items: [{ cantidad: 2, precioUnitario: 18_900 }, { cantidad: 1, precioUnitario: 10_000 }],
      manoDeObra: [{ valor: 60_000 }], descuento: 0,
    });
    expect(d).toMatchObject({ ordenId: "o1", clienteId: "c1", ...esperado, saldoPendiente: esperado.total, emitidaPorId: "rec1" });
    expect(d.createdAt).toEqual(creada);
  });

  it("descuenta el stock al facturar y no deja que baje de cero", async () => {
    const { tx, m, stock } = nuevoTxFactura({ stock: 5 });
    await cobrar(tx, nuevoEstado(), "PENDIENTE");
    expect(stock.r1).toBe(3);
    expect(m.repuesto.updateMany.mock.calls[0]![0]).toMatchObject({ where: { id: "r1", stockActual: { gte: 2 } } });

    const corto = nuevoTxFactura({ stock: 1 });
    await expect(cobrar(corto.tx, nuevoEstado(), "PENDIENTE")).rejects.toThrow("STOCK_INSUFICIENTE");
    expect(corto.stock.r1).toBe(1);
  });

  it("PENDIENTE no registra pagos y la factura queda PENDIENTE con todo el saldo", async () => {
    const { tx, m, factura } = nuevoTxFactura();
    await cobrar(tx, nuevoEstado(), "PENDIENTE");
    expect(m.pago.create).not.toHaveBeenCalled();
    expect(factura.estado).toBe("PENDIENTE");
    expect(factura.saldoPendiente).toBe(totalOrden);
  });

  it("COMPLETO deja el saldo en 0 y la factura PAGADA, con cualquier semilla (a veces en dos pagos)", async () => {
    const cantidades = new Set<number>();
    for (let semilla = 1; semilla <= 40; semilla++) {
      const { tx, m, factura } = nuevoTxFactura();
      const estado = nuevoEstado();
      estado.cajaAbierta.set("s1", "c1");
      await cobrar(tx, estado, "COMPLETO", semilla);
      const pagos = pagado(m);
      cantidades.add(pagos.length);
      expect(pagos.length === 1 || pagos.length === 2).toBe(true);
      expect(sumaMontos(pagos)).toBe(totalOrden);
      expect(factura.saldoPendiente).toBe(0);
      expect(factura.estado).toBe("PAGADA");
      if (pagos.length === 2) expect(pagos[0]!.metodoPago).not.toBe(pagos[1]!.metodoPago);
      for (const p of pagos) {
        expect(p.referencia).toContain("[datos-semana]");
        expect(p.registradoPorId).toBe("rec1");
        expect(p.createdAt).toBeInstanceOf(Date);
      }
    }
    expect(cantidades).toEqual(new Set([1, 2]));
  });

  it("PARCIAL cobra entre 30 % y 70 % y deja saldo > 0 con la factura PENDIENTE", async () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const { tx, m, factura } = nuevoTxFactura();
      await cobrar(tx, nuevoEstado(), "PARCIAL", semilla);
      const pagos = pagado(m);
      expect(pagos).toHaveLength(1);
      const monto = pagos[0]!.monto as number;
      expect(monto).toBeGreaterThanOrEqual(totalOrden * 0.3 - 100);
      expect(monto).toBeLessThanOrEqual(totalOrden * 0.7);
      expect(factura.saldoPendiente).toBeGreaterThan(0);
      expect(factura.estado).toBe("PENDIENTE");
    }
  });

  it("sin caja abierta nunca registra efectivo; con caja abierta el efectivo es posible", async () => {
    const metodosSinCaja = new Set<unknown>();
    const metodosConCaja = new Set<unknown>();
    for (let semilla = 1; semilla <= 60; semilla++) {
      const sin = nuevoTxFactura();
      await cobrar(sin.tx, nuevoEstado(), "COMPLETO", semilla);
      pagado(sin.m).forEach((p) => metodosSinCaja.add(p.metodoPago));
      const con = nuevoTxFactura();
      const estado = nuevoEstado();
      estado.cajaAbierta.set("s1", "c1");
      await cobrar(con.tx, estado, "COMPLETO", semilla);
      pagado(con.m).forEach((p) => metodosConCaja.add(p.metodoPago));
    }
    expect(metodosSinCaja.has("EFECTIVO")).toBe(false);
    expect(metodosSinCaja.size).toBeGreaterThan(0);
    expect(metodosConCaja.has("EFECTIVO")).toBe(true);
  });

  it("aplica el anticipo pendiente como pago ANTICIPO y cobra solo el resto", async () => {
    const anticipo = { id: "a1", monto: 20_000, registradoPorId: "rec1" };
    const { tx, m, factura } = nuevoTxFactura({ anticipos: [anticipo] });
    await cobrar(tx, nuevoEstado(), "COMPLETO");
    const todos = m.pago.create.mock.calls.map((c) => c[0].data);
    expect(todos[0]).toMatchObject({ metodoPago: "ANTICIPO", monto: 20_000 });
    expect(m.anticipo.updateMany.mock.calls[0]![0]).toMatchObject({ data: { estado: "APLICADO", pagoId: "p1" } });
    expect(sumaMontos(pagado(m))).toBe(redondear(totalOrden - 20_000));
    expect(factura.saldoPendiente).toBe(0);
    expect(factura.estado).toBe("PAGADA");
  });
});

describe("registrarAnticiposPendientes", () => {
  const pendiente = (estado: EstadoEjecucion) => { estado.ordenes.set("o-1", "o1"); estado.anticiposPendientes.push("o-1"); };
  const subtotal = 2 * 18_900 + 10_000 + 60_000;

  it("registra el anticipo de cada orden pendiente (marcado, de la sede, entre el 20 y el 40 % del subtotal) y vacía la lista", async () => {
    const { tx, m } = nuevoTxFactura();
    const estado = nuevoEstado();
    pendiente(estado);
    await registrarAnticiposPendientes(tx, ctx, estado, "s1", crearAzar(2), creada);
    const d = datos(m.anticipo.create);
    expect(d).toMatchObject({ ordenId: "o1", sedeId: "s1", registradoPorId: "rec1" });
    expect(d.referencia).toContain("[datos-semana]");
    expect(d.monto as number).toBeGreaterThanOrEqual(subtotal * 0.2 - 1000);
    expect(d.monto as number).toBeLessThanOrEqual(subtotal * 0.4);
    expect(d.createdAt).toEqual(creada);
    expect(estado.anticiposPendientes).toEqual([]);
    expect(estado.creados.anticipo).toBe(1);
  });

  it("sin caja abierta nunca registra el anticipo en efectivo", async () => {
    for (let semilla = 1; semilla <= 40; semilla++) {
      const { tx, m } = nuevoTxFactura();
      const estado = nuevoEstado();
      pendiente(estado);
      await registrarAnticiposPendientes(tx, ctx, estado, "s1", crearAzar(semilla), creada);
      expect(datos(m.anticipo.create).metodoPago).not.toBe("EFECTIVO");
    }
  });

  it("no hace nada si no hay anticipos pendientes", async () => {
    const { tx, m } = nuevoTxFactura();
    await registrarAnticiposPendientes(tx, ctx, nuevoEstado(), "s1", crearAzar(2), creada);
    expect(m.anticipo.create).not.toHaveBeenCalled();
  });
});
