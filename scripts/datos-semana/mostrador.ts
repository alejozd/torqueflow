import { resumirPagos, type PagoEntrada } from "@/lib/mostrador/cobro";
import { registrarDevolucionEnTransaccion } from "@/lib/mostrador/registrar-devolucion";
import { registrarVentaEnTransaccion } from "@/lib/mostrador/registrar-venta";
import {
  cantidadDevolvible,
  calcularTotalesVenta,
  montoADevolverPermitido,
  repartoDevolucion,
  totalDevolucion,
} from "@/lib/mostrador/ventas";
import { roundMoney } from "@/lib/money/round";
import type { Azar } from "./azar";
import { MARCA, type Contexto } from "./contexto";
import { elegirClienteYVehiculo } from "./clientes";
import { bodegasConCatalogo, metodosDePago } from "./compras";
import type { EstadoEjecucion, Manejador, TenantTx } from "./ejecutor";
import { acotarAlCierre, desfasar, instante } from "./fechas";
import type { PlanDia } from "./tipos";

const MOTIVOS = ["No era la referencia correcta", "El cliente se arrepintió", "Pieza que no le servía al vehículo"] as const;

const sumar = (estado: EstadoEjecucion, clave: string, n = 1) => {
  estado.creados[clave] = (estado.creados[clave] ?? 0) + n;
};

const centenas = (v: number) => Math.floor(v / 100) * 100;

type Metodo = PagoEntrada["metodoPago"];

function referenciaDe(metodo: Metodo, az: Azar): string {
  return `${MARCA} ${metodo === "EFECTIVO" ? "Pago en caja" : `Ref. ${az.entero(100_000, 999_999)}`}`;
}

/**
 * Pagos de la venta. Contado: uno por el total o (a veces) dos con métodos distintos. Fiada: sin
 * abono o con un abono del 20 al 50 %, y el resto queda como saldo. Los métodos nunca incluyen
 * efectivo sin caja abierta (exigirCajaParaEfectivo).
 */
function repartirPagos(total: number, fiada: boolean, metodos: readonly Metodo[], az: Azar): PagoEntrada[] {
  if (fiada) {
    const abono = az.probabilidad(0.5) ? centenas(total * (0.2 + az.azar() * 0.3)) : 0;
    if (abono <= 0) return [];
    const metodoPago = az.elegir(metodos);
    return [{ metodoPago, monto: abono, referencia: referenciaDe(metodoPago, az) }];
  }
  const disponibles = [...metodos];
  const primero = disponibles.splice(az.entero(0, disponibles.length - 1), 1)[0]!;
  const dividido = az.probabilidad(0.25) ? centenas(total * (0.4 + az.azar() * 0.2)) : 0;
  if (dividido <= 0 || dividido >= total) {
    return [{ metodoPago: primero, monto: total, referencia: referenciaDe(primero, az) }];
  }
  const segundo = az.elegir(disponibles);
  return [
    { metodoPago: primero, monto: dividido, referencia: referenciaDe(primero, az) },
    { metodoPago: segundo, monto: roundMoney(total - dividido), referencia: referenciaDe(segundo, az) },
  ];
}

/** crearDevolucionAction sobre una parte de la venta recién hecha; el dinero respeta la caja abierta y queda antes del cierre del día. */
async function devolverParte(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, dia: PlanDia, ventaId: string, creada: Date, az: Azar,
): Promise<void> {
  const venta = await tx.ventaMostrador.findUniqueOrThrow({
    where: { id: ventaId },
    select: {
      subtotal: true, total: true, saldoPendiente: true,
      items: { select: { id: true, repuestoId: true, cantidad: true, precioUnitario: true, devueltoCantidad: true } },
      devoluciones: { select: { total: true } },
    },
  });
  const item = az.elegir(venta.items);
  const disponible = cantidadDevolvible(item.cantidad, item.devueltoCantidad);
  if (disponible <= 0) return;
  const cantidad = az.entero(1, disponible);
  const precioUnitario = Number(item.precioUnitario);

  const yaDevuelto = venta.devoluciones.reduce((suma, d) => suma + Number(d.total), 0);
  const calculado = totalDevolucion([{ cantidad, precioUnitario }], { subtotal: Number(venta.subtotal), total: Number(venta.total) });
  const total = montoADevolverPermitido(Number(venta.total), yaDevuelto, calculado);
  const { aCuenta, enEfectivo } = repartoDevolucion(total, Number(venta.saldoPendiente));

  await registrarDevolucionEnTransaccion(tx, {
    ventaId,
    sedeId: dia.sedeId,
    motivo: `${MARCA} ${az.elegir(MOTIVOS)}`,
    metodoPago: az.elegir(metodosDePago(estado, dia.sedeId)),
    total,
    aCuenta,
    enEfectivo,
    creadoPorId: ctx.recepcionistaId,
    lineas: new Map([[item.id, { cantidad, vendida: item.cantidad, repuestoId: item.repuestoId, precioUnitario }]]),
  }, acotarAlCierre(desfasar(creada, az.entero(20, 120)), dia));

  if (item.repuestoId) {
    const repuesto = ctx.repuestos.find((r) => r.id === item.repuestoId);
    if (repuesto) repuesto.stockActual += cantidad;
    const vendidos = (estado.vendidos ??= new Map());
    vendidos.set(item.repuestoId, (vendidos.get(item.repuestoId) ?? 0) - cantidad);
  }
  sumar(estado, "devolucionMostrador");
}

/**
 * crearVentaMostradorAction (+ crearDevolucionAction si el evento la pide): 1 a 3 repuestos de la
 * sede a precio de catálogo, sin pasar del stock disponible (el de `ctx`, que ya descuenta lo
 * reservado por las órdenes). Descuenta la base y `ctx`; la devolución los repone. Una venta fiada
 * lleva cliente y deja saldo.
 */
export const registrarVentaMostrador: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "ventaMostrador") return;
  const creada = instante(dia.fecha, evento.hora);
  const bodegas = await bodegasConCatalogo(tx, ctx, estado, dia.sedeId, az);
  const disponibles = ctx.repuestos.filter((r) => bodegas.has(r.bodegaId) && r.stockActual >= 1);
  if (disponibles.length === 0) {
    sumar(estado, "omitido:ventaMostrador");
    return;
  }

  const lineas: { repuesto: Contexto["repuestos"][number]; cantidad: number }[] = [];
  for (let i = az.entero(1, 3); i > 0 && disponibles.length > 0; i--) {
    const repuesto = disponibles.splice(az.entero(0, disponibles.length - 1), 1)[0]!;
    lineas.push({ repuesto, cantidad: az.entero(1, Math.min(3, repuesto.stockActual)) });
  }
  const clienteId = evento.fiada || az.probabilidad(0.4)
    ? (await elegirClienteYVehiculo(tx, ctx, estado, az, dia.fecha, creada)).clienteId
    : null;

  const ventaLineas = lineas.map(({ repuesto, cantidad }) => ({
    repuestoId: repuesto.id, descripcion: `${MARCA} ${repuesto.nombre}`, cantidad, precioUnitario: repuesto.precioVenta,
  }));
  const totales = calcularTotalesVenta(ventaLineas, 0);
  const pagos = repartirPagos(totales.total, evento.fiada, metodosDePago(estado, dia.sedeId), az);
  const efectivo = roundMoney(pagos.filter((p) => p.metodoPago === "EFECTIVO").reduce((s, p) => s + p.monto, 0));
  const recibidoEfectivo = efectivo > 0 ? Math.ceil(efectivo / 1000) * 1000 + az.entero(0, 2) * 1000 : null;
  const resumen = resumirPagos(totales.total, pagos, recibidoEfectivo);
  if (resumen.error) throw new Error(`ventaMostrador: ${resumen.error}`);

  const venta = await registrarVentaEnTransaccion(tx, {
    sedeId: dia.sedeId,
    clienteId,
    totales,
    saldo: resumen.saldo,
    vueltas: resumen.vueltas,
    recibidoEfectivo,
    lineas: ventaLineas,
    pagos,
    creadoPorId: ctx.recepcionistaId,
  }, creada);
  (estado.ventasMostrador ??= []).push(venta.id);
  const vendidos = (estado.vendidos ??= new Map());
  for (const { repuesto, cantidad } of lineas) {
    repuesto.stockActual -= cantidad;
    vendidos.set(repuesto.id, (vendidos.get(repuesto.id) ?? 0) + cantidad);
  }
  sumar(estado, "ventaMostrador");

  if (evento.devolucion) await devolverParte(tx, ctx, estado, dia, venta.id, creada, az);
};
