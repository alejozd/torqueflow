import { consultarMovimientosCaja, resumenBaseDeMovimientos } from "@/lib/caja/movimientos";
import { calcularResumenCaja } from "@/lib/caja/resumen";
import { roundMoney } from "@/lib/money/round";
import type { Contexto, TenantDb } from "./contexto";
import type { EstadoEjecucion } from "./ejecutor";

export interface Descuadre { tipo: "factura" | "stock" | "caja" | "cuentaPorPagar"; id: string; detalle: string }

const CENTAVO = 0.005;
const distintos = (a: number, b: number) => Math.abs(a - b) > CENTAVO;
const pesos = (v: number) => `$${v.toLocaleString("es-CO")}`;

/** PAGADA exige cubrir el total, PENDIENTE no puede estar ya cubierta y nunca se paga de más. */
export function verificarFacturas(facturas: { id: string; total: number; pagado: number; estado: string }[]): Descuadre[] {
  const resultado: Descuadre[] = [];
  for (const f of facturas) {
    const saldo = roundMoney(f.total - f.pagado);
    const detalle = (texto: string): Descuadre => ({ tipo: "factura", id: f.id, detalle: texto });
    if (saldo < -CENTAVO) resultado.push(detalle(`pagos por ${pesos(f.pagado)} superan el total ${pesos(f.total)}`));
    else if (f.estado === "PAGADA" && saldo > CENTAVO) resultado.push(detalle(`PAGADA con saldo ${pesos(saldo)}`));
    else if (f.estado !== "PAGADA" && saldo <= CENTAVO) resultado.push(detalle(`${f.estado} aunque los pagos cubren el total`));
  }
  return resultado;
}

/** final = inicial + entradas - usado - vendido + devuelto, y nunca negativo. */
export function verificarStock(
  movs: { repuestoId: string; inicial: number; entradas: number; usado: number; vendido: number; devuelto: number; final: number }[],
): Descuadre[] {
  const resultado: Descuadre[] = [];
  for (const m of movs) {
    const esperado = m.inicial + m.entradas - m.usado - m.vendido + m.devuelto;
    if (m.final < 0) {
      resultado.push({ tipo: "stock", id: m.repuestoId, detalle: `stock negativo (${m.final})` });
    } else if (m.final !== esperado) {
      resultado.push({
        tipo: "stock", id: m.repuestoId,
        detalle: `final ${m.final}, esperado ${esperado} (inicial ${m.inicial} + entradas ${m.entradas} - usado ${m.usado} - vendido ${m.vendido} + devuelto ${m.devuelto})`,
      });
    }
  }
  return resultado;
}

/** El efectivo esperado guardado al cerrar debe ser el que se recalcula con los movimientos de la sesión. */
export function verificarCajas(cajas: { id: string; esperado: number; calculado: number }[]): Descuadre[] {
  return cajas
    .filter((c) => distintos(c.esperado, c.calculado))
    .map((c) => ({ tipo: "caja", id: c.id, detalle: `esperado guardado ${pesos(c.esperado)}, recalculado ${pesos(c.calculado)}` }));
}

/** saldo = total - abonos. */
export function verificarCuentas(cuentas: { id: string; total: number; abonos: number; saldo: number }[]): Descuadre[] {
  return cuentas
    .filter((c) => distintos(c.saldo, roundMoney(c.total - c.abonos)))
    .map((c) => ({
      tipo: "cuentaPorPagar", id: c.id,
      detalle: `saldo ${pesos(c.saldo)}, esperado ${pesos(roundMoney(c.total - c.abonos))} (total ${pesos(c.total)} - abonos ${pesos(c.abonos)})`,
    }));
}

const sumaPorRepuesto = (filas: { repuestoId: string | null; cantidad: number }[]): Map<string, number> => {
  const suma = new Map<string, number>();
  for (const f of filas) if (f.repuestoId) suma.set(f.repuestoId, (suma.get(f.repuestoId) ?? 0) + f.cantidad);
  return suma;
};

const monto = (v: { toString(): string } | number) => Number(v.toString());

/**
 * Lee de la base lo que el script creó (por los ids que guardó `estado`) y verifica facturas, stock,
 * cajas cerradas y cuentas por pagar. Un descuadre solo se reporta: no se corrige ni se borra nada.
 * `stockInicial` es el stock de `ctx.repuestos` antes de ejecutar el plan. El stock de la base solo
 * baja al facturar, así que lo reservado en órdenes sin facturar no cuenta como usado.
 */
export async function verificarTodo(
  db: TenantDb, _ctx: Contexto, estado: EstadoEjecucion, stockInicial: Map<string, number>,
): Promise<Descuadre[]> {
  const descuadres: Descuadre[] = [];

  const facturaIds = estado.facturasCreadas ?? [];
  const facturas = facturaIds.length === 0 ? [] : await db.factura.findMany({
    where: { id: { in: facturaIds } },
    select: { id: true, ordenId: true, total: true, estado: true, pagos: { select: { monto: true } } },
  });
  descuadres.push(...verificarFacturas(facturas.map((f) => ({
    id: f.id, total: monto(f.total), estado: f.estado, pagado: roundMoney(f.pagos.reduce((s, p) => s + monto(p.monto), 0)),
  }))));

  const ventaIds = estado.ventasMostrador ?? [];
  const entradaIds = estado.entradasRecibidas ?? [];
  const [itemsFactura, itemsVenta, itemsEntrada] = await Promise.all([
    facturas.length === 0 ? [] : db.itemOrden.findMany({
      where: { ordenId: { in: facturas.map((f) => f.ordenId) }, repuestoId: { not: null } },
      select: { repuestoId: true, cantidad: true },
    }),
    ventaIds.length === 0 ? [] : db.ventaMostradorItem.findMany({
      where: { ventaId: { in: ventaIds }, repuestoId: { not: null } },
      select: { repuestoId: true, cantidad: true, devueltoCantidad: true },
    }),
    entradaIds.length === 0 ? [] : db.entradaMercanciaItem.findMany({
      where: { entradaId: { in: entradaIds } },
      select: { repuestoId: true, cantidad: true },
    }),
  ]);
  const usado = sumaPorRepuesto(itemsFactura);
  const vendido = sumaPorRepuesto(itemsVenta);
  const devuelto = sumaPorRepuesto(itemsVenta.map((i) => ({ repuestoId: i.repuestoId, cantidad: i.devueltoCantidad })));
  const entradas = sumaPorRepuesto(itemsEntrada);
  const tocados = [...new Set([...usado.keys(), ...vendido.keys(), ...devuelto.keys(), ...entradas.keys()])];
  const repuestos = tocados.length === 0 ? [] : await db.repuesto.findMany({
    where: { id: { in: tocados } }, select: { id: true, stockActual: true },
  });
  descuadres.push(...verificarStock(repuestos.map((r) => ({
    repuestoId: r.id,
    inicial: stockInicial.get(r.id) ?? estado.stockCargaInicial?.get(r.id) ?? 0,
    entradas: entradas.get(r.id) ?? 0,
    usado: usado.get(r.id) ?? 0,
    vendido: vendido.get(r.id) ?? 0,
    devuelto: devuelto.get(r.id) ?? 0,
    final: r.stockActual,
  }))));

  const cajaIds = estado.cajasCerradas ?? [];
  const cajas = cajaIds.length === 0 ? [] : await db.cajaSesion.findMany({ where: { id: { in: cajaIds } } });
  const cajasVerificadas: { id: string; esperado: number; calculado: number }[] = [];
  for (const c of cajas) {
    if (!c.cerradaAt || c.efectivoEsperado === null) continue;
    const movimientos = resumenBaseDeMovimientos(await consultarMovimientosCaja(db, c.sedeId, c.abiertaAt, c.cerradaAt));
    cajasVerificadas.push({
      id: c.id, esperado: monto(c.efectivoEsperado), calculado: calcularResumenCaja(monto(c.baseInicial), movimientos).efectivoEsperado,
    });
  }
  descuadres.push(...verificarCajas(cajasVerificadas));

  const cuentas = entradaIds.length === 0 ? [] : await db.cuentaPorPagar.findMany({
    where: { entradaId: { in: entradaIds } },
    select: { id: true, total: true, saldoPendiente: true, pagos: { select: { monto: true } } },
  });
  descuadres.push(...verificarCuentas(cuentas.map((c) => ({
    id: c.id, total: monto(c.total), saldo: monto(c.saldoPendiente), abonos: roundMoney(c.pagos.reduce((s, p) => s + monto(p.monto), 0)),
  }))));

  return descuadres;
}
