import { describe, expect, it, vi } from "vitest";
import type { Contexto, TenantDb } from "./contexto";
import { verificarCajas, verificarCuentas, verificarFacturas, verificarStock, verificarTodo } from "./verificacion";
import { nuevoEstado } from "./soporte-pruebas";

const mov = { repuestoId: "r1", inicial: 10, entradas: 5, usado: 3, vendido: 4, devuelto: 1 };

describe("verificarFacturas", () => {
  it("no reporta nada cuando el estado y el saldo concuerdan", () => {
    expect(verificarFacturas([
      { id: "f1", total: 1000, pagado: 1000, estado: "PAGADA" },
      { id: "f2", total: 1000, pagado: 400, estado: "PENDIENTE" },
      { id: "f3", total: 1000, pagado: 0, estado: "PENDIENTE" },
    ])).toEqual([]);
  });
  it("detecta una factura pagada con saldo", () => {
    const r = verificarFacturas([{ id: "f1", total: 1000, pagado: 600, estado: "PAGADA" }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "factura", id: "f1" });
  });
  it("detecta una pendiente ya cubierta y un pago que se pasa del total", () => {
    const r = verificarFacturas([
      { id: "f1", total: 1000, pagado: 1000, estado: "PENDIENTE" },
      { id: "f2", total: 1000, pagado: 1200, estado: "PAGADA" },
    ]);
    expect(r.map((d) => d.id)).toEqual(["f1", "f2"]);
  });
});

describe("verificarStock", () => {
  it("no reporta nada cuando el final es inicial + entradas - usado - vendido + devuelto", () => {
    expect(verificarStock([{ ...mov, final: 9 }])).toEqual([]);
  });
  it("detecta un final distinto de la fórmula", () => {
    const r = verificarStock([{ ...mov, final: 8 }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "stock", id: "r1" });
  });
  it("detecta un stock negativo", () => {
    const r = verificarStock([{ repuestoId: "r2", inicial: 1, entradas: 0, usado: 2, vendido: 0, devuelto: 0, final: -1 }]);
    expect(r).toHaveLength(1);
    expect(r[0]!.detalle).toContain("negativo");
  });
});

describe("verificarCajas", () => {
  it("no reporta nada cuando lo guardado es lo recalculado", () => {
    expect(verificarCajas([{ id: "c1", esperado: 150_000.5, calculado: 150_000.5 }])).toEqual([]);
  });
  it("detecta una caja con esperado distinto de lo calculado", () => {
    const r = verificarCajas([{ id: "c1", esperado: 150_000, calculado: 140_000 }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "caja", id: "c1" });
  });
});

describe("verificarCuentas", () => {
  it("no reporta nada cuando saldo = total - abonos", () => {
    expect(verificarCuentas([{ id: "x1", total: 500_000, abonos: 200_000, saldo: 300_000 }])).toEqual([]);
  });
  it("detecta una cuenta con saldo distinto de total - abonos", () => {
    const r = verificarCuentas([{ id: "x1", total: 500_000, abonos: 200_000, saldo: 350_000 }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "cuentaPorPagar", id: "x1" });
  });
});

describe("verificarTodo", () => {
  const vacio = () => vi.fn(async () => [] as unknown[]);
  function dbFalsa(opciones: {
    repuestos?: { id: string; stockActual: number }[];
    items?: Record<string, unknown[]>;
    facturas?: unknown[];
    cajas?: unknown[];
    gastos?: unknown[];
    cuentas?: unknown[];
  }) {
    const db = {
      factura: { findMany: vi.fn(async () => opciones.facturas ?? []) },
      itemOrden: { findMany: vi.fn(async () => opciones.items?.orden ?? []) },
      ventaMostradorItem: { findMany: vi.fn(async () => opciones.items?.venta ?? []) },
      entradaMercanciaItem: { findMany: vi.fn(async () => opciones.items?.entrada ?? []) },
      repuesto: { findMany: vi.fn(async () => opciones.repuestos ?? []) },
      cajaSesion: { findMany: vi.fn(async () => opciones.cajas ?? []) },
      cuentaPorPagar: { findMany: vi.fn(async () => opciones.cuentas ?? []) },
      pago: { findMany: vacio() }, anticipo: { findMany: vacio() },
      gasto: { findMany: vi.fn(async () => opciones.gastos ?? []) },
      pagoVentaMostrador: { findMany: vacio() }, devolucionMostrador: { findMany: vacio() },
      pagoProveedor: { findMany: vacio() },
    };
    return db as unknown as TenantDb;
  }
  const ctx = { repuestos: [] } as unknown as Contexto;

  it("sin nada creado por el script no reporta nada", async () => {
    expect(await verificarTodo(dbFalsa({}), ctx, nuevoEstado(), new Map())).toEqual([]);
  });

  it("stock: lo reservado en órdenes sin facturar no cuenta como usado; usa la carga inicial de lo creado en la corrida", async () => {
    const estado = nuevoEstado();
    estado.facturasCreadas = ["f1"];
    estado.ventasMostrador = ["v1"];
    estado.entradasRecibidas = ["e1"];
    estado.stockCargaInicial = new Map([["rN", 12]]);
    const db = dbFalsa({
      facturas: [{ id: "f1", ordenId: "o1", total: 1000, estado: "PAGADA", pagos: [{ monto: 1000 }] }],
      items: {
        orden: [{ repuestoId: "r1", cantidad: 3 }],
        venta: [{ repuestoId: "r1", cantidad: 4, devueltoCantidad: 1 }, { repuestoId: "rN", cantidad: 2, devueltoCantidad: 0 }],
        entrada: [{ repuestoId: "r1", cantidad: 5 }],
      },
      repuestos: [{ id: "r1", stockActual: 9 }, { id: "rN", stockActual: 10 }],
    });
    expect(await verificarTodo(db, ctx, estado, new Map([["r1", 10]]))).toEqual([]);
  });

  it("stock: reporta el repuesto cuyo final no cuadra", async () => {
    const estado = nuevoEstado();
    estado.ventasMostrador = ["v1"];
    const db = dbFalsa({
      items: { venta: [{ repuestoId: "r1", cantidad: 4, devueltoCantidad: 0 }] },
      repuestos: [{ id: "r1", stockActual: 5 }],
    });
    const r = await verificarTodo(db, ctx, estado, new Map([["r1", 10]]));
    expect(r.map((d) => [d.tipo, d.id])).toEqual([["stock", "r1"]]);
  });

  it("caja: recalcula el esperado con los movimientos de la ventana y lo compara con el guardado", async () => {
    const estado = nuevoEstado();
    estado.cajasCerradas = ["c1", "c2"];
    const abiertaAt = new Date("2026-10-20T07:00:00-05:00");
    const cerradaAt = new Date("2026-10-20T18:00:00-05:00");
    const db = dbFalsa({
      cajas: [
        { id: "c1", sedeId: "s1", baseInicial: 100_000, abiertaAt, cerradaAt, efectivoEsperado: 80_000 },
        { id: "c2", sedeId: "s1", baseInicial: 100_000, abiertaAt, cerradaAt, efectivoEsperado: 100_000 },
      ],
      gastos: [{ monto: 20_000 }],
    });
    const r = await verificarTodo(db, ctx, estado, new Map());
    expect(r.map((d) => [d.tipo, d.id])).toEqual([["caja", "c2"]]);
  });

  it("cuentas por pagar: reporta la de saldo incorrecto", async () => {
    const estado = nuevoEstado();
    estado.entradasRecibidas = ["e1"];
    const db = dbFalsa({
      cuentas: [
        { id: "x1", total: 100_000, saldoPendiente: 40_000, pagos: [{ monto: 60_000 }] },
        { id: "x2", total: 100_000, saldoPendiente: 100_000, pagos: [{ monto: 60_000 }] },
      ],
    });
    const r = await verificarTodo(db, ctx, estado, new Map());
    expect(r.map((d) => [d.tipo, d.id])).toEqual([["cuentaPorPagar", "x2"]]);
  });
});
