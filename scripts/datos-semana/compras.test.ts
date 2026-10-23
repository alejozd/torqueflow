import { describe, expect, it } from "vitest";
import { crearAzar } from "./azar";
import { registrarAbonoProveedor, registrarPedidoCompra } from "./compras";
import { conCaja, nuevaBase, nuevoCtx, nuevoEstado, type RepuestoPrueba } from "./soporte-pruebas";
import type { Evento, PlanDia } from "./tipos";

const dia: PlanDia = { fecha: "2026-10-20", sedeId: "s1", eventos: [] };
const pedido = (recibir: boolean) => ({ tipo: "pedidoCompra", hora: "09:00", recibir }) as Extract<Evento, { tipo: "pedidoCompra" }>;
const abono = { tipo: "abonoProveedor", hora: "16:00" } as Extract<Evento, { tipo: "abonoProveedor" }>;

const bajos: RepuestoPrueba[] = [
  { id: "r1", stockActual: 2, stockMinimo: 8, precioCompra: 10_000 },
  { id: "r2", stockActual: 3, stockMinimo: 8, precioCompra: 24_500 },
  { id: "r3", stockActual: 4, stockMinimo: 8, precioCompra: 7_000 },
];

function escenario(repuestos: RepuestoPrueba[] = bajos, semilla = 1) {
  const ctx = nuevoCtx({ repuestos, proveedores: ["Autopartes Andina"] });
  const base = nuevaBase({ repuestos: repuestos.map((r) => ({ ...r })) });
  base.db.proveedores.push({ id: "p1", nombre: "Autopartes Andina", diasEntrega: 3 });
  return { ctx, ...base, estado: nuevoEstado(), az: crearAzar(semilla) };
}

describe("registrarPedidoCompra", () => {
  it("recibido: la entrada sube el stock (base y contexto) y la cuenta por pagar nace con el total de la entrada", async () => {
    const e = escenario();
    await registrarPedidoCompra(e.tx, e.ctx, e.estado, dia, pedido(true), e.az);
    const p = e.db.pedidos[0]!;
    const entrada = e.db.entradas[0]!;
    expect(p.estado).toBe("RECIBIDO");
    expect(p.entradaId).toBe(entrada.id);
    expect(p.canal).toBe("WHATSAPP");
    expect(p.enviadoAt.getTime()).toBeLessThanOrEqual(p.recibidoAt.getTime());
    expect(p.recibidoAt.getTime()).toBeLessThanOrEqual(Date.now());
    const total = entrada.items.reduce((s: number, i: { cantidad: number; precioCompraUnitario: number }) => s + i.cantidad * i.precioCompraUnitario, 0);
    const cuenta = e.db.cuentas[0]!;
    expect(cuenta).toMatchObject({ entradaId: entrada.id, total, saldoPendiente: total, estado: "PENDIENTE", proveedorId: "p1" });
    expect(cuenta.fecha).toEqual(new Date("2026-10-20T00:00:00.000Z"));
    for (const item of entrada.items) {
      const original = bajos.find((r) => r.id === item.repuestoId)!;
      expect(e.db.repuestos.find((r) => r.id === item.repuestoId)!.stockActual).toBe(original.stockActual + item.cantidad);
      expect(e.ctx.repuestos.find((r) => r.id === item.repuestoId)!.stockActual).toBe(original.stockActual + item.cantidad);
    }
    expect(e.estado.entradasRecibidas).toEqual([entrada.id]);
  });

  it("sin recibir no toca stock ni crea entrada ni deuda, y el pedido no queda RECIBIDO", async () => {
    const e = escenario();
    await registrarPedidoCompra(e.tx, e.ctx, e.estado, dia, pedido(false), e.az);
    expect(e.db.pedidos).toHaveLength(1);
    expect(["BORRADOR", "ENVIADO"]).toContain(e.db.pedidos[0]!.estado);
    expect(e.db.entradas).toHaveLength(0);
    expect(e.db.cuentas).toHaveLength(0);
    expect(e.db.repuestos.map((r) => r.stockActual)).toEqual([2, 3, 4]);
  });

  it("un pedido enviado fija el canal WhatsApp (sin enviar nada) y la fecha esperada por los días de entrega", async () => {
    for (let semilla = 1; semilla <= 15; semilla++) {
      const e = escenario(bajos, semilla);
      await registrarPedidoCompra(e.tx, e.ctx, e.estado, dia, pedido(false), e.az);
      const p = e.db.pedidos[0]!;
      if (p.estado === "ENVIADO") {
        expect(p.canal).toBe("WHATSAPP");
        expect(p.fechaEsperada.getTime() - p.enviadoAt.getTime()).toBe(3 * 86_400_000);
      } else {
        expect(p.canal).toBeUndefined();
      }
    }
  });

  it("repuestos sin proveedor no se piden", async () => {
    const e = escenario([{ id: "r1", stockActual: 1, stockMinimo: 8, proveedorId: null }]);
    await registrarPedidoCompra(e.tx, e.ctx, e.estado, dia, pedido(true), e.az);
    expect(e.db.pedidos).toHaveLength(0);
    expect(e.estado.creados["omitido:pedidoCompra"]).toBe(1);
  });

  it("en el último pedido del rango no repone dos de los más vendidos: terminan bajo el mínimo", async () => {
    const e = escenario();
    e.estado.vendidos = new Map([["r1", 9], ["r2", 7], ["r3", 1]]);
    const ultimo = pedido(true);
    e.estado.ultimoPedidoCompra = ultimo;
    await registrarPedidoCompra(e.tx, e.ctx, e.estado, dia, ultimo, e.az);
    const bajoMinimo = e.ctx.repuestos.filter((r) => r.stockActual < r.stockMinimo).map((r) => r.id).sort();
    expect(bajoMinimo).toEqual(["r1", "r2"]);
    expect(e.db.repuestos.filter((r) => r.stockActual < r.stockMinimo).map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("en un pedido que no es el último sí reponen los que están bajo el mínimo", async () => {
    const e = escenario();
    e.estado.vendidos = new Map([["r1", 9], ["r2", 7]]);
    e.estado.ultimoPedidoCompra = pedido(true); // otro evento
    await registrarPedidoCompra(e.tx, e.ctx, e.estado, dia, pedido(true), e.az);
    expect(e.ctx.repuestos.every((r) => r.stockActual >= r.stockMinimo)).toBe(true);
  });

  it("si faltan proveedores y repuestos crea los 2 proveedores y los 6 básicos, marcados", async () => {
    const ctx = nuevoCtx();
    const base = nuevaBase();
    const estado = nuevoEstado();
    await registrarPedidoCompra(base.tx, ctx, estado, dia, pedido(true), crearAzar(1));
    expect(base.db.proveedores.map((p) => p.nombre).sort()).toEqual(["Autopartes Andina", "Distribuidora Gates"]);
    expect(base.db.proveedores.every((p) => p.contacto === "[datos-semana]")).toBe(true);
    expect(base.db.repuestos).toHaveLength(6);
    expect(base.db.pedidos.length).toBeGreaterThan(0);
  });
});

describe("registrarAbonoProveedor", () => {
  async function conDeuda(semilla: number, caja: boolean) {
    const e = escenario(bajos, semilla);
    if (caja) conCaja(e.estado);
    await registrarPedidoCompra(e.tx, e.ctx, e.estado, dia, pedido(true), e.az);
    return e;
  }

  it("abona sin pasarse del saldo, suma al pago y deja la cuenta PAGADA al llegar a cero", async () => {
    for (let semilla = 1; semilla <= 25; semilla++) {
      const e = await conDeuda(semilla, true);
      const cuenta = e.db.cuentas[0]!;
      const total = cuenta.total;
      for (let i = 0; i < 6; i++) await registrarAbonoProveedor(e.tx, e.ctx, e.estado, dia, abono, e.az);
      const pagado = e.db.pagosProveedor.reduce((s, p) => s + p.monto, 0);
      expect(e.db.pagosProveedor.every((p) => p.monto > 0 && p.referencia.startsWith("[datos-semana]"))).toBe(true);
      expect(cuenta.saldoPendiente).toBeGreaterThanOrEqual(0);
      expect(Math.round((pagado + cuenta.saldoPendiente) * 100) / 100).toBe(total);
      expect(cuenta.estado).toBe(cuenta.saldoPendiente <= 0 ? "PAGADA" : "PENDIENTE");
    }
  });

  it("el abono nunca queda antes de la deuda ni en el futuro", async () => {
    const e = await conDeuda(3, true);
    await registrarAbonoProveedor(e.tx, e.ctx, e.estado, dia, abono, e.az);
    const pago = e.db.pagosProveedor[0]!;
    expect(pago.createdAt.getTime()).toBeGreaterThanOrEqual(e.db.cuentas[0]!.createdAt.getTime());
    expect(pago.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(pago.registradoPorId).toBe("rec1");
  });

  it("sin caja abierta el abono nunca es en efectivo", async () => {
    for (let semilla = 1; semilla <= 25; semilla++) {
      const e = await conDeuda(semilla, false);
      await registrarAbonoProveedor(e.tx, e.ctx, e.estado, dia, abono, e.az);
      expect(e.db.pagosProveedor.every((p) => p.metodoPago !== "EFECTIVO")).toBe(true);
    }
  });

  it("sin deudas creadas por el script no abona nada", async () => {
    const e = escenario();
    await registrarAbonoProveedor(e.tx, e.ctx, e.estado, dia, abono, e.az);
    expect(e.db.pagosProveedor).toHaveLength(0);
  });

  it("el abono nunca queda después del cierre de caja del día", async () => {
    const conCierre: PlanDia = { ...dia, eventos: [{ tipo: "cerrarCaja", hora: "15:00", diferencia: 0 }] };
    for (let semilla = 1; semilla <= 15; semilla++) {
      const e = await conDeuda(semilla, true);
      await registrarAbonoProveedor(e.tx, e.ctx, e.estado, conCierre, abono, e.az);
      const pago = e.db.pagosProveedor[0]!;
      expect(pago.createdAt.getTime()).toBeLessThan(new Date("2026-10-20T15:00:00-05:00").getTime());
      expect(pago.createdAt.getTime()).toBeGreaterThan(e.db.cuentas[0]!.createdAt.getTime());
    }
  });

  it("si el cierre deja el abono antes de la deuda, no abona", async () => {
    const e = await conDeuda(3, true);
    const cierreTemprano: PlanDia = { ...dia, eventos: [{ tipo: "cerrarCaja", hora: "08:00", diferencia: 0 }] };
    await registrarAbonoProveedor(e.tx, e.ctx, e.estado, cierreTemprano, abono, e.az);
    expect(e.db.pagosProveedor).toHaveLength(0);
  });
});
