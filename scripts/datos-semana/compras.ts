import { agruparLineasPedido, calcularFechaEsperada, type LineaSeleccionada } from "@/lib/pedido-compra/pedido-compra";
import { recibirPedidoEnTransaccion } from "@/lib/pedido-compra/recibir";
import { roundMoney } from "@/lib/money/round";
import type { Azar } from "./azar";
import { MARCA, type Contexto } from "./contexto";
import type { EstadoEjecucion, Manejador, TenantTx } from "./ejecutor";
import { desfasar, instante } from "./fechas";

const PROVEEDORES_MINIMOS = [
  { nombre: "Autopartes Andina", diasEntrega: 2 },
  { nombre: "Distribuidora Gates", diasEntrega: 4 },
] as const;

const REPUESTOS_BASICOS = [
  { nombre: "Aceite de motor 20W-50 (cuarto)", precioCompra: 18_000, precioVenta: 28_000 },
  { nombre: "Filtro de aceite", precioCompra: 12_000, precioVenta: 20_000 },
  { nombre: "Filtro de aire", precioCompra: 15_000, precioVenta: 26_000 },
  { nombre: "Pastillas de freno delanteras", precioCompra: 55_000, precioVenta: 90_000 },
  { nombre: "Bujías (juego x4)", precioCompra: 32_000, precioVenta: 52_000 },
  { nombre: "Filtro de combustible", precioCompra: 14_000, precioVenta: 24_000 },
] as const;

const STOCK_MINIMO_BASICO = 8;
const MS_MINUTO = 60_000;

const sumar = (estado: EstadoEjecucion, clave: string, n = 1) => {
  estado.creados[clave] = (estado.creados[clave] ?? 0) + n;
};

/** Sin caja abierta en la sede el efectivo no se puede registrar (exigirCajaParaEfectivo). */
export function metodosDePago(estado: EstadoEjecucion, sedeId: string) {
  return estado.cajaAbierta.has(sedeId)
    ? (["EFECTIVO", "TRANSFERENCIA", "TARJETA"] as const)
    : (["TRANSFERENCIA", "TARJETA"] as const);
}

/** Si el taller no tiene proveedores crea los dos mínimos (marcados) y los agrega al contexto. */
async function asegurarProveedores(tx: TenantTx, ctx: Contexto): Promise<void> {
  if (ctx.proveedores.length > 0) return;
  for (const { nombre, diasEntrega } of PROVEEDORES_MINIMOS) {
    const creado = await tx.proveedor.create({ data: { nombre, contacto: MARCA, diasEntrega } });
    ctx.proveedores.push({ id: creado.id, nombre });
  }
}

/**
 * Bodegas de la sede. Si ninguna tiene repuestos, crea los 6 básicos con stock inicial en la primera
 * (carga inicial: no genera entrada ni deuda) y los agrega al contexto, junto con los proveedores mínimos.
 */
export async function bodegasConCatalogo(
  tx: TenantTx, ctx: Contexto, estado: EstadoEjecucion, sedeId: string, az: Azar,
): Promise<Set<string>> {
  const bodegas = (await tx.bodega.findMany({ where: { sedeId }, select: { id: true } })).map((b) => b.id);
  const ids = new Set(bodegas);
  if (bodegas.length === 0 || ctx.repuestos.some((r) => ids.has(r.bodegaId))) return ids;

  await asegurarProveedores(tx, ctx);
  const bodegaId = bodegas[0]!;
  for (const [i, basico] of REPUESTOS_BASICOS.entries()) {
    const proveedorId = ctx.proveedores[i % ctx.proveedores.length]!.id;
    const stockActual = az.entero(10, 14);
    const creado = await tx.repuesto.create({
      data: {
        codigo: `DS-${bodegaId.slice(-6)}-${i + 1}`,
        nombre: basico.nombre,
        descripcion: MARCA,
        precioCompra: basico.precioCompra,
        precioVenta: basico.precioVenta,
        stockActual,
        stockMinimo: STOCK_MINIMO_BASICO,
        bodegaId,
        proveedorId,
      },
    });
    ctx.repuestos.push({
      id: creado.id, nombre: basico.nombre, precioCompra: basico.precioCompra, precioVenta: basico.precioVenta,
      stockActual, stockMinimo: STOCK_MINIMO_BASICO, bodegaId, proveedorId,
    });
    sumar(estado, "repuesto");
  }
  return ids;
}

type Candidato = Contexto["repuestos"][number];

/**
 * Los dos repuestos que no se reponen en el último pedido: los más vendidos en el mostrador
 * (desempata el que está más cerca de su mínimo) y, si se vendió poco, los más cercanos al mínimo.
 */
function paraDejarBajos(candidatos: Candidato[], vendidos: Map<string, number>): Set<string> {
  const margen = (r: Candidato) => r.stockActual - r.stockMinimo;
  return new Set(
    [...candidatos]
      .sort((a, b) => (vendidos.get(b.id) ?? 0) - (vendidos.get(a.id) ?? 0) || margen(a) - margen(b))
      .slice(0, 2)
      .map((r) => r.id),
  );
}

/** Cantidad para volver a doblar el mínimo; sin mínimo, un lote corriente. */
function cantidadAPedir(r: Candidato, az: Azar): number {
  return r.stockMinimo > 0 ? Math.max(1, r.stockMinimo * 2 - r.stockActual) : az.entero(5, 15);
}

/**
 * crearPedidosCompraAction + (si salió) registrarEnvioWhatsappPedidoAction + (si llegó)
 * recibirPedidoCompraAction. Pide lo que está en o bajo el mínimo (siempre al menos dos
 * líneas si hay con qué) agrupado por proveedor y bodega. El envío solo se registra con el canal
 * WhatsApp: no se manda ningún mensaje ni correo. En el último pedido del rango no se reponen dos de
 * los más vendidos, para que la lista de alertas termine con repuestos bajo el mínimo.
 */
export const registrarPedidoCompra: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "pedidoCompra") return;
  const creada = instante(dia.fecha, evento.hora);
  const bodegas = await bodegasConCatalogo(tx, ctx, estado, dia.sedeId, az);

  let candidatos = ctx.repuestos.filter((r) => bodegas.has(r.bodegaId) && r.proveedorId);
  if (evento === estado.ultimoPedidoCompra) {
    const dejar = paraDejarBajos(candidatos, estado.vendidos ?? new Map());
    candidatos = candidatos.filter((r) => !dejar.has(r.id));
  }
  const bajos = candidatos.filter((r) => r.stockActual <= r.stockMinimo);
  const lineas: LineaSeleccionada[] = bajos.map((r) => ({
    repuestoId: r.id, proveedorId: r.proveedorId, bodegaId: r.bodegaId, cantidad: cantidadAPedir(r, az), precioCompra: r.precioCompra,
  }));
  const otros = candidatos.filter((r) => r.stockActual > r.stockMinimo);
  while (lineas.length < 2 && otros.length > 0) {
    const r = otros.splice(az.entero(0, otros.length - 1), 1)[0]!;
    lineas.push({ repuestoId: r.id, proveedorId: r.proveedorId, bodegaId: r.bodegaId, cantidad: az.entero(5, 20), precioCompra: r.precioCompra });
  }
  if (lineas.length === 0) {
    sumar(estado, "omitido:pedidoCompra");
    return;
  }

  const { grupos } = agruparLineasPedido(lineas);
  for (const grupo of grupos) {
    const pedido = await tx.pedidoCompra.create({
      data: {
        proveedorId: grupo.proveedorId,
        bodegaId: grupo.bodegaId,
        creadoPorId: ctx.recepcionistaId,
        createdAt: creada,
        updatedAt: creada,
        items: {
          create: grupo.lineas.map((l) => ({ repuestoId: l.repuestoId, cantidad: l.cantidad, precioCompraUnitario: l.precioCompra })),
        },
      },
      select: { id: true },
    });
    sumar(estado, "pedidoCompra");
    if (!evento.recibir && !az.probabilidad(0.7)) continue; // se queda en BORRADOR

    const enviadoAt = desfasar(creada, az.entero(2, 15));
    const { diasEntrega } = await tx.proveedor.findUniqueOrThrow({ where: { id: grupo.proveedorId }, select: { diasEntrega: true } });
    await tx.pedidoCompra.update({
      where: { id: pedido.id },
      data: {
        estado: "ENVIADO", canal: "WHATSAPP", enviadoAt,
        fechaEsperada: calcularFechaEsperada(enviadoAt, diasEntrega), updatedAt: enviadoAt,
      },
    });
    if (!evento.recibir) continue;

    const recibidoAt = desfasar(enviadoAt, az.entero(60, 240));
    const entradaId = await recibirPedidoEnTransaccion(tx, {
      id: pedido.id,
      proveedorId: grupo.proveedorId,
      bodegaId: grupo.bodegaId,
      creadoPorId: ctx.recepcionistaId,
      lineas: grupo.lineas.map((l) => ({ repuestoId: l.repuestoId, cantidad: l.cantidad, precioCompraUnitario: l.precioCompra })),
    }, recibidoAt);
    for (const l of grupo.lineas) ctx.repuestos.find((r) => r.id === l.repuestoId)!.stockActual += l.cantidad;
    (estado.entradasRecibidas ??= []).push(entradaId);
    sumar(estado, "entradaMercancia");
    sumar(estado, "cuentaPorPagar");
  }
};

const centenas = (v: number) => Math.floor(v / 100) * 100;

/**
 * abonarCuentaPorPagarAction: abona a una deuda que el script creó (nunca a las reales). El monto
 * nunca pasa del saldo; en efectivo solo con caja abierta; queda después de que la mercancía llegó.
 */
export const registrarAbonoProveedor: Manejador = async (tx, ctx, estado, dia, evento, az) => {
  if (evento.tipo !== "abonoProveedor") return;
  const entradas = estado.entradasRecibidas ?? [];
  if (entradas.length === 0) return;
  const cuentas = await tx.cuentaPorPagar.findMany({
    where: { entradaId: { in: entradas }, saldoPendiente: { gt: 0 }, entrada: { bodega: { sedeId: dia.sedeId } } },
    select: { id: true, saldoPendiente: true, createdAt: true },
  });
  if (cuentas.length === 0) return;

  const cuenta = az.elegir(cuentas);
  const saldo = Number(cuenta.saldoPendiente);
  const parcial = Math.max(1000, centenas(saldo * (0.3 + az.azar() * 0.6)));
  const monto = roundMoney(az.probabilidad(0.35) || parcial >= saldo ? saldo : parcial);
  const metodoPago = az.elegir(metodosDePago(estado, dia.sedeId));
  const abonado = desfasar(new Date(Math.max(instante(dia.fecha, evento.hora).getTime(), cuenta.createdAt.getTime() + 5 * MS_MINUTO)), 0);

  // Guarda atómica: el abono no puede pasarse del saldo.
  const { count } = await tx.cuentaPorPagar.updateMany({
    where: { id: cuenta.id, saldoPendiente: { gte: monto } },
    data: { saldoPendiente: { decrement: monto } },
  });
  if (count === 0) throw new Error(`abonoProveedor: la cuenta ${cuenta.id} no tiene saldo para ${monto}`);
  await tx.pagoProveedor.create({
    data: {
      cuentaId: cuenta.id, monto, metodoPago,
      referencia: `${MARCA} ${metodoPago === "EFECTIVO" ? "Pago en caja" : `Ref. ${az.entero(100_000, 999_999)}`}`,
      registradoPorId: ctx.recepcionistaId,
      createdAt: abonado,
    },
  });
  const actualizada = await tx.cuentaPorPagar.findUniqueOrThrow({ where: { id: cuenta.id }, select: { saldoPendiente: true } });
  if (Number(actualizada.saldoPendiente) <= 0) {
    await tx.cuentaPorPagar.update({ where: { id: cuenta.id }, data: { estado: "PAGADA" } });
  }
  sumar(estado, "abonoProveedor");
};
