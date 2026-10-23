import { vi } from "vitest";
import type { Contexto } from "./contexto";
import type { EstadoEjecucion, TenantTx } from "./ejecutor";

/** Soporte común de las pruebas de mostrador, gastos y compras: una base en memoria, sin Prisma. */

export type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const nuevoEstado = (): EstadoEjecucion => ({
  ordenes: new Map(), cajaAbierta: new Map(), creados: {},
  clientesCreados: [], clientesUsados: new Set(), citasPorOrden: new Map(), anticiposPendientes: [],
});

export const conCaja = (estado: EstadoEjecucion, sedeId = "s1") => estado.cajaAbierta.set(sedeId, "caja1");

export interface RepuestoPrueba {
  id: string; nombre?: string; precioCompra?: number; precioVenta?: number;
  stockActual: number; stockMinimo?: number; bodegaId?: string; proveedorId?: string | null;
}

export function nuevoCtx(opciones: { repuestos?: RepuestoPrueba[]; proveedores?: string[]; categorias?: string[] } = {}): Contexto {
  return {
    recepcionistaId: "rec1", actorId: "adm1",
    sedes: [{ id: "s1", nombre: "Sede 1" }],
    mecanicos: [],
    repuestos: (opciones.repuestos ?? []).map((r) => ({
      nombre: `Repuesto ${r.id}`, precioCompra: 10_000, precioVenta: 20_000, stockMinimo: 5, bodegaId: "b1", proveedorId: "p1", ...r,
    })),
    servicios: [],
    proveedores: (opciones.proveedores ?? []).map((nombre, i) => ({ id: `p${i + 1}`, nombre })),
    categoriasGasto: (opciones.categorias ?? []).map((nombre, i) => ({ id: `cg${i + 1}`, nombre })),
    clientesExistentes: [{ id: "c1", vehiculoIds: ["v1"] }],
    placasOcupadas: new Set(),
  } as unknown as Contexto;
}

const sumarCampo = (actual: number, op: { increment?: number; decrement?: number }) =>
  actual + (op.increment ?? 0) - (op.decrement ?? 0);

/**
 * Base en memoria con lo justo de Prisma que usan los manejadores. Cada escritura actualiza las
 * filas, así que las pruebas miran saldos, stock y estados reales y no solo las llamadas.
 */
export function nuevaBase(opciones: { repuestos?: RepuestoPrueba[]; bodegas?: { id: string; sedeId: string }[] } = {}) {
  let n = 0;
  const id = (prefijo: string) => `${prefijo}${++n}`;
  const redondear = (v: number) => Math.round(v * 100) / 100;

  const db = {
    bodegas: opciones.bodegas ?? [{ id: "b1", sedeId: "s1" }],
    repuestos: (opciones.repuestos ?? []).map((r) => ({ bodegaId: "b1", ...r })) as Fila[],
    ventas: [] as Fila[], pagosVenta: [] as Fila[], devoluciones: [] as Fila[], auditoria: [] as Fila[],
    proveedores: [] as Fila[], categorias: [] as Fila[], gastos: [] as Fila[], plantillas: [] as Fila[],
    pedidos: [] as Fila[], entradas: [] as Fila[], cuentas: [] as Fila[], pagosProveedor: [] as Fila[],
  };
  const buscar = (lista: Fila[], valor: string) => lista.find((f) => f.id === valor);

  const m = {
    $queryRaw: vi.fn(async () => []),
    bodega: { findMany: vi.fn(async (a: { where: { sedeId: string } }) => db.bodegas.filter((b) => b.sedeId === a.where.sedeId)) },
    repuesto: {
      create: vi.fn(async (a: { data: Fila }) => { const f = { id: id("rn"), ...a.data }; db.repuestos.push(f); return f; }),
      updateMany: vi.fn(async (a: { where: { id: string; stockActual: { gte: number } }; data: { stockActual: { decrement: number } } }) => {
        const r = buscar(db.repuestos, a.where.id);
        if (!r || r.stockActual < a.where.stockActual.gte) return { count: 0 };
        r.stockActual = sumarCampo(r.stockActual, a.data.stockActual);
        return { count: 1 };
      }),
      update: vi.fn(async (a: { where: { id: string }; data: { stockActual: { increment: number } } }) => {
        const r = buscar(db.repuestos, a.where.id)!;
        r.stockActual = sumarCampo(r.stockActual, a.data.stockActual);
        return r;
      }),
    },
    ventaMostrador: {
      create: vi.fn(async (a: { data: Fila }) => {
        const { items, ...resto } = a.data;
        const venta = {
          id: id("v"), numero: db.ventas.length + 1, ...resto,
          items: (items.create as Fila[]).map((i) => ({ id: id("vi"), devueltoCantidad: 0, ...i })),
        };
        db.ventas.push(venta);
        return { id: venta.id, numero: venta.numero };
      }),
      findUniqueOrThrow: vi.fn(async (a: { where: { id: string } }) => {
        const v = buscar(db.ventas, a.where.id)!;
        return { ...v, devoluciones: db.devoluciones.filter((d) => d.ventaId === v.id) };
      }),
      updateMany: vi.fn(async (a: { where: { id: string; saldoPendiente: { gte: number } }; data: { saldoPendiente: { decrement: number } } }) => {
        const v = buscar(db.ventas, a.where.id)!;
        if (Number(v.saldoPendiente) < a.where.saldoPendiente.gte) return { count: 0 };
        v.saldoPendiente = redondear(sumarCampo(Number(v.saldoPendiente), a.data.saldoPendiente));
        return { count: 1 };
      }),
      update: vi.fn(async (a: { where: { id: string }; data: Fila }) => Object.assign(buscar(db.ventas, a.where.id)!, a.data)),
    },
    ventaMostradorItem: {
      updateMany: vi.fn(async (a: { where: { id: string; devueltoCantidad: { lte: number } }; data: { devueltoCantidad: { increment: number } } }) => {
        const item = db.ventas.flatMap((v) => v.items as Fila[]).find((i) => i.id === a.where.id)!;
        if (item.devueltoCantidad > a.where.devueltoCantidad.lte) return { count: 0 };
        item.devueltoCantidad += a.data.devueltoCantidad.increment;
        return { count: 1 };
      }),
    },
    pagoVentaMostrador: { create: vi.fn(async (a: { data: Fila }) => { db.pagosVenta.push(a.data); return a.data; }) },
    devolucionMostrador: {
      create: vi.fn(async (a: { data: Fila }) => {
        const { items, ...resto } = a.data;
        const d = { id: id("d"), numero: db.devoluciones.length + 1, ...resto, items: items.create as Fila[] };
        db.devoluciones.push(d);
        return { id: d.id, numero: d.numero };
      }),
    },
    auditLog: { create: vi.fn(async (a: { data: Fila }) => { db.auditoria.push(a.data); return a.data; }) },
    proveedor: {
      create: vi.fn(async (a: { data: Fila }) => { const f = { id: id("pn"), diasEntrega: 3, ...a.data }; db.proveedores.push(f); return f; }),
      findUniqueOrThrow: vi.fn(async (a: { where: { id: string } }) => buscar(db.proveedores, a.where.id) ?? { id: a.where.id, diasEntrega: 3 }),
    },
    categoriaGasto: {
      create: vi.fn(async (a: { data: Fila }) => { const f = { id: id("cgn"), ...a.data }; db.categorias.push(f); return f; }),
    },
    gasto: { create: vi.fn(async (a: { data: Fila }) => { db.gastos.push(a.data); return a.data; }) },
    gastoRecurrente: {
      create: vi.fn(async (a: { data: Fila }) => { const f = { id: id("gr"), activo: true, ...a.data }; db.plantillas.push(f); return f; }),
      findMany: vi.fn(async (a: { where: { sedeId: string } }) =>
        db.plantillas.filter((p) => p.sedeId === a.where.sedeId && p.activo).map((p) => ({
          ...p,
          categoria: { nombre: "Servicios públicos" },
          gastos: db.gastos.filter((g) => g.gastoRecurrenteId === p.id).map((g) => ({ periodo: g.periodo })),
          omitidos: [],
        }))),
    },
    pedidoCompra: {
      create: vi.fn(async (a: { data: Fila }) => {
        const { items, ...resto } = a.data;
        const p = { id: id("pc"), numero: db.pedidos.length + 1, estado: "BORRADOR", ...resto, items: items.create as Fila[] };
        db.pedidos.push(p);
        return { id: p.id };
      }),
      update: vi.fn(async (a: { where: { id: string }; data: Fila }) => Object.assign(buscar(db.pedidos, a.where.id)!, a.data)),
      updateMany: vi.fn(async (a: { where: { id: string; estado: string }; data: Fila }) => {
        const p = buscar(db.pedidos, a.where.id)!;
        if (p.estado !== a.where.estado) return { count: 0 };
        Object.assign(p, a.data);
        return { count: 1 };
      }),
    },
    entradaMercancia: {
      create: vi.fn(async (a: { data: Fila }) => {
        const { items, ...resto } = a.data;
        const e = { id: id("e"), ...resto, items: items.create as Fila[] };
        db.entradas.push(e);
        return { id: e.id };
      }),
      findUniqueOrThrow: vi.fn(async (a: { where: { id: string } }) => {
        const e = buscar(db.entradas, a.where.id)!;
        const cuenta = db.cuentas.find((c) => c.entradaId === e.id);
        return { proveedorId: e.proveedorId, createdAt: e.createdAt ?? new Date(), items: e.items, cuentaPorPagar: cuenta ? { id: cuenta.id } : null };
      }),
    },
    cuentaPorPagar: {
      create: vi.fn(async (a: { data: Fila }) => { const f = { id: id("cx"), ...a.data }; db.cuentas.push(f); return f; }),
      update: vi.fn(async (a: { where: { id: string }; data: Fila }) => Object.assign(buscar(db.cuentas, a.where.id)!, a.data)),
      findMany: vi.fn(async (a: { where: { entradaId: { in: string[] } } }) =>
        db.cuentas.filter((c) => a.where.entradaId.in.includes(c.entradaId) && Number(c.saldoPendiente) > 0)),
      findUniqueOrThrow: vi.fn(async (a: { where: { id: string } }) => buscar(db.cuentas, a.where.id)!),
      updateMany: vi.fn(async (a: { where: { id: string; saldoPendiente: { gte: number } }; data: { saldoPendiente: { decrement: number } } }) => {
        const c = buscar(db.cuentas, a.where.id)!;
        if (Number(c.saldoPendiente) < a.where.saldoPendiente.gte) return { count: 0 };
        c.saldoPendiente = redondear(sumarCampo(Number(c.saldoPendiente), a.data.saldoPendiente));
        return { count: 1 };
      }),
    },
    pagoProveedor: {
      create: vi.fn(async (a: { data: Fila }) => { db.pagosProveedor.push(a.data); return a.data; }),
      aggregate: vi.fn(async (a: { where: { cuentaId: string } }) => ({
        _sum: { monto: db.pagosProveedor.filter((p) => p.cuentaId === a.where.cuentaId).reduce((s, p) => s + Number(p.monto), 0) },
      })),
    },
  };
  return { tx: m as unknown as TenantTx, m, db };
}

export type Base = ReturnType<typeof nuevaBase>;
