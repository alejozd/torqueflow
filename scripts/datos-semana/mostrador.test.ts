import { describe, expect, it, vi } from "vitest";
import { crearAzar } from "./azar";
import { registrarVentaMostrador } from "./mostrador";
import { calcularTotalesVenta } from "@/lib/mostrador/ventas";
import { conCaja, nuevaBase, nuevoCtx, nuevoEstado } from "./soporte-pruebas";
import type { Evento, PlanDia } from "./tipos";

const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
const venta = (fiada = false, devolucion = false) =>
  ({ tipo: "ventaMostrador", hora: "11:00", fiada, devolucion }) as Extract<Evento, { tipo: "ventaMostrador" }>;
const repuestosConStock = (stock = 6) => [
  { id: "r1", stockActual: stock, precioVenta: 20_000 },
  { id: "r2", stockActual: stock, precioVenta: 35_500 },
  { id: "r3", stockActual: stock, precioVenta: 12_000 },
];

function escenario(stock = 6, semilla = 1) {
  const repuestos = repuestosConStock(stock);
  const ctx = nuevoCtx({ repuestos, proveedores: ["Autopartes Andina", "Distribuidora Gates"] });
  const base = nuevaBase({ repuestos: repuestos.map((r) => ({ ...r })) });
  return { ctx, ...base, estado: nuevoEstado(), az: crearAzar(semilla) };
}

describe("registrarVentaMostrador", () => {
  it("vende a precio de catálogo con los totales de calcularTotalesVenta, marcada y con la hora del evento", async () => {
    const e = escenario();
    conCaja(e.estado);
    await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(), e.az);
    const v = e.db.ventas[0]!;
    const totales = calcularTotalesVenta(
      v.items.map((i: { cantidad: number; precioUnitario: number }) => ({ cantidad: i.cantidad, precioUnitario: i.precioUnitario })), 0);
    expect(v.total).toBe(totales.total);
    expect(v.subtotal).toBe(totales.subtotal);
    expect(v.iva).toBe(totales.iva);
    expect(v.estado).toBe("PAGADA");
    expect(v.saldoPendiente).toBe(0);
    expect(v.creadoPorId).toBe("rec1");
    expect(v.createdAt).toEqual(new Date("2026-10-20T11:00:00-05:00"));
    expect(v.items.every((i: { descripcion: string }) => i.descripcion.startsWith("[datos-semana]"))).toBe(true);
    const pagado = e.db.pagosVenta.reduce((s, p) => s + p.monto, 0);
    expect(Math.round(pagado * 100) / 100).toBe(totales.total);
    expect(e.db.pagosVenta.every((p) => p.referencia.startsWith("[datos-semana]"))).toBe(true);
  });

  it("nunca vende más que el stock y descuenta el stock en la base y en el contexto", async () => {
    const e = escenario(3);
    conCaja(e.estado);
    for (let i = 0; i < 25; i++) {
      await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(), e.az);
    }
    for (const r of e.db.repuestos) {
      expect(r.stockActual).toBeGreaterThanOrEqual(0);
      const vendido = e.db.ventas.flatMap((v) => v.items).filter((i) => i.repuestoId === r.id).reduce((s, i) => s + i.cantidad, 0);
      expect(r.stockActual).toBe(3 - vendido);
      expect(e.ctx.repuestos.find((x) => x.id === r.id)!.stockActual).toBe(3 - vendido);
    }
    expect(e.db.repuestos.every((r) => r.stockActual === 0)).toBe(true); // 25 ventas agotan las 9 unidades
  });

  it("sin nada disponible no registra la venta", async () => {
    const e = escenario(0);
    await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(), e.az);
    expect(e.db.ventas).toHaveLength(0);
    expect(e.estado.creados["omitido:ventaMostrador"]).toBe(1);
  });

  it("contado sin caja abierta nunca se registra como efectivo", async () => {
    for (let semilla = 1; semilla <= 30; semilla++) {
      const e = escenario(6, semilla);
      await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(), e.az);
      expect(e.db.pagosVenta.every((p) => p.metodoPago !== "EFECTIVO")).toBe(true);
      expect(e.db.ventas.every((v) => v.recibidoEfectivo === null && v.vueltas === 0)).toBe(true);
    }
  });

  it("con caja abierta puede cobrar en efectivo y calcula las vueltas desde lo recibido", async () => {
    let efectivo = 0;
    for (let semilla = 1; semilla <= 40; semilla++) {
      const e = escenario(6, semilla);
      conCaja(e.estado);
      await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(), e.az);
      const enEfectivo = e.db.pagosVenta.filter((p) => p.metodoPago === "EFECTIVO").reduce((s, p) => s + p.monto, 0);
      if (enEfectivo > 0) {
        efectivo++;
        expect(e.db.ventas[0]!.recibidoEfectivo).toBeGreaterThanOrEqual(enEfectivo);
        expect(e.db.ventas[0]!.vueltas).toBe(e.db.ventas[0]!.recibidoEfectivo - enEfectivo);
      }
    }
    expect(efectivo).toBeGreaterThan(0);
  });

  it("fiada exige cliente, queda PENDIENTE y pagos + saldo = total", async () => {
    const e = escenario();
    conCaja(e.estado);
    await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(true), e.az);
    const v = e.db.ventas[0]!;
    expect(v.clienteId).toBe("c1");
    expect(v.saldoPendiente).toBeGreaterThan(0);
    expect(v.estado).toBe("PENDIENTE");
    const pagado = e.db.pagosVenta.reduce((s, p) => s + p.monto, 0);
    expect(Math.round((pagado + v.saldoPendiente) * 100) / 100).toBe(v.total);
  });

  it("la devolución repone el stock, nunca excede lo vendido ni el total y queda auditada", async () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const e = escenario(6, semilla);
      conCaja(e.estado);
      await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(false, true), e.az);
      const v = e.db.ventas[0]!;
      const d = e.db.devoluciones[0]!;
      expect(d).toBeDefined();
      for (const i of v.items) expect(i.devueltoCantidad).toBeLessThanOrEqual(i.cantidad);
      expect(d.total).toBeLessThanOrEqual(v.total);
      expect(d.motivo.startsWith("[datos-semana]")).toBe(true);
      expect(d.createdAt.getTime()).toBeGreaterThan(v.createdAt.getTime());
      expect(d.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(e.db.auditoria[0]).toMatchObject({ tipo: "VENTA_DEVOLVER", entidadTipo: "DevolucionMostrador", entidadId: d.id });
      // Neto de stock = vendido - devuelto, igual en la base y en el contexto.
      for (const r of e.db.repuestos) {
        const neto = v.items.filter((i: { repuestoId: string }) => i.repuestoId === r.id)
          .reduce((s: number, i: { cantidad: number; devueltoCantidad: number }) => s + i.cantidad - i.devueltoCantidad, 0);
        expect(r.stockActual).toBe(6 - neto);
        expect(e.ctx.repuestos.find((x) => x.id === r.id)!.stockActual).toBe(6 - neto);
      }
    }
  });

  it("devolver de una venta fiada baja primero la deuda y solo el exceso sale en efectivo", async () => {
    const e = escenario();
    conCaja(e.estado);
    await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(true, true), e.az);
    const d = e.db.devoluciones[0]!;
    expect(d.montoEnEfectivo).toBeLessThanOrEqual(d.total);
    expect(e.db.ventas[0]!.saldoPendiente).toBeGreaterThanOrEqual(0);
  });

  it("sin caja la devolución no sale en efectivo", async () => {
    for (let semilla = 1; semilla <= 20; semilla++) {
      const e = escenario(6, semilla);
      await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(false, true), e.az);
      expect(e.db.devoluciones.every((d) => d.metodoPago !== "EFECTIVO")).toBe(true);
    }
  });

  it("si el catálogo de la sede está vacío crea los 6 repuestos básicos y 2 proveedores, marcados, y vende de ellos", async () => {
    const ctx = nuevoCtx();
    const base = nuevaBase();
    const estado = nuevoEstado();
    conCaja(estado);
    await registrarVentaMostrador(base.tx, ctx, estado, dia, venta(), crearAzar(1));
    expect(base.db.repuestos).toHaveLength(6);
    expect(base.db.repuestos.every((r) => r.descripcion === "[datos-semana]" && r.stockActual > 0 && r.proveedorId)).toBe(true);
    expect(base.db.proveedores.map((p) => p.nombre).sort()).toEqual(["Autopartes Andina", "Distribuidora Gates"]);
    expect(ctx.repuestos).toHaveLength(6);
    expect(ctx.proveedores).toHaveLength(2);
    expect(base.db.ventas).toHaveLength(1);
  });

  it("la devolución nunca queda después del cierre de caja del día", async () => {
    const conCierre: PlanDia = { ...dia, eventos: [{ tipo: "cerrarCaja", hora: "11:30", diferencia: 0 }] };
    for (let semilla = 1; semilla <= 20; semilla++) {
      const e = escenario(6, semilla);
      conCaja(e.estado);
      await registrarVentaMostrador(e.tx, e.ctx, e.estado, conCierre, venta(false, true), e.az);
      const d = e.db.devoluciones[0]!;
      expect(d.createdAt.getTime()).toBeLessThan(new Date("2026-10-20T11:30:00-05:00").getTime());
      expect(d.createdAt.getTime()).toBeGreaterThan(e.db.ventas[0]!.createdAt.getTime());
    }
  });

  it("sin cierre en el día (hoy) la devolución nunca queda después de la hora actual", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-20T11:10:00-05:00"));
      for (let semilla = 1; semilla <= 20; semilla++) {
        const e = escenario(6, semilla);
        conCaja(e.estado);
        await registrarVentaMostrador(e.tx, e.ctx, e.estado, dia, venta(false, true), e.az);
        expect(e.db.devoluciones[0]!.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
