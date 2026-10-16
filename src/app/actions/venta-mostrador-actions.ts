"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { exigirCajaParaEfectivo, sesionDeCajaAbierta } from "@/lib/caja/sesion";
import { leerOpcionesTaller } from "@/lib/configuracion/opciones-taller";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { getTenantDb } from "@/lib/db/tenant-client";
import { inicioDiaBogota } from "@/lib/fecha-bogota";
import { comprometidoPorRepuesto } from "@/lib/inventario/comprometido";
import { descuentoPermitido, porcentajeDescuento, resumirPagos, type PagoEntrada } from "@/lib/mostrador/cobro";
import { calcularTotalesVenta } from "@/lib/mostrador/ventas";
import { scopeRepuesto } from "@/lib/sede/scope";
import { cobroVentaSchema, ventaMostradorInputSchema, type VentaMostradorInput } from "@/lib/validation/mostrador";
import type { Role } from "@/generated/prisma-tenant";

/**
 * Venta de mostrador (Fase 24, D1/D2/D8): documento propio, sin orden de trabajo,
 * con la sede de la sesión, cobro inmediato o a crédito si hay cliente, y el stock
 * descontado **con guarda y dentro de la misma transacción** que la venta.
 *
 * Cobrar en efectivo (al vender o al abonar) exige caja abierta si el taller usa
 * el control de caja (fase de consolidación, D3): así ningún efectivo queda fuera
 * del arqueo. Una venta a crédito no mueve dinero y no la exige.
 */

/** Vender es cobrar: el mostrador es de ADMIN y RECEPCION (fase de consolidación, D6). */
const ROLES_MOSTRADOR: Role[] = ["ADMIN", "RECEPCION"];

const SIN_CAJA = "Abre la caja antes de cobrar en efectivo en el mostrador";
const SALDO_INSUFICIENTE = "SALDO_INSUFICIENTE";
const STOCK_INSUFICIENTE = "STOCK_INSUFICIENTE";

export interface VentaMostradorFormState {
  error: string | null;
  success: boolean;
  /** Número de la venta creada, para confirmárselo al cliente. */
  numero?: number;
  /** Para la tarjeta de venta cobrada (solo en éxito). */
  ventaId?: string;
  total?: number;
  pagos?: PagoEntrada[];
  vueltas?: number;
}

/** Las líneas y los pagos llegan como JSON (`lineas`, `pagos`): el carrito los arma en el cliente. */
function leerVenta(formData: FormData): { datos: VentaMostradorInput } | { error: string } {
  let lineas: unknown;
  try {
    lineas = JSON.parse(String(formData.get("lineas") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer los productos de la venta" };
  }
  let pagos: unknown;
  try {
    pagos = JSON.parse(String(formData.get("pagos") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer los pagos de la venta" };
  }

  const parsed = ventaMostradorInputSchema.safeParse({
    clienteId: formData.get("clienteId") ?? "",
    lineas,
    descuento: formData.get("descuento") ?? "",
    pagos,
    recibidoEfectivo: formData.get("recibidoEfectivo") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  return { datos: parsed.data };
}

export async function crearVentaMostradorAction(
  prevState: VentaMostradorFormState,
  formData: FormData,
): Promise<VentaMostradorFormState> {
  void prevState;
  const leida = leerVenta(formData);
  if ("error" in leida) return { error: leida.error, success: false };
  const datos = leida.datos;

  const session = await requireRole(ROLES_MOSTRADOR);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;

  // Solo hay que tener caja abierta si entra efectivo al cajón (D3).
  const hayEfectivo = datos.pagos.some((pago) => pago.metodoPago === "EFECTIVO");
  const errorCaja = await exigirCajaParaEfectivo(tenantDb, sedeId, hayEfectivo, SIN_CAJA);
  if (errorCaja) return { error: errorCaja, success: false };

  if (datos.clienteId) {
    const cliente = await tenantDb.cliente.findFirst({ where: { id: datos.clienteId }, select: { id: true } });
    if (!cliente) return { error: "Cliente no encontrado", success: false };
  }

  // Los repuestos tienen que ser de la sede activa (el id llega del formulario), y
  // su **precio y nombre salen de aquí**, nunca del navegador: si no, cualquiera
  // podría vender una pieza a $1 con otro nombre (hallazgo M2). Las líneas libres
  // (sin repuesto) sí conservan lo que se escribió.
  const idsRepuesto = [...new Set(datos.lineas.flatMap((linea) => (linea.repuestoId ? [linea.repuestoId] : [])))];
  const catalogo = new Map<string, { nombre: string; precioVenta: number }>();
  if (idsRepuesto.length > 0) {
    const propios = await tenantDb.repuesto.findMany({
      where: { id: { in: idsRepuesto }, ...scopeRepuesto(sedeId) },
      select: { id: true, nombre: true, precioVenta: true },
    });
    if (propios.length !== idsRepuesto.length) {
      return { error: "Alguno de los repuestos no pertenece a tu sede activa", success: false };
    }
    for (const repuesto of propios) {
      catalogo.set(repuesto.id, { nombre: repuesto.nombre, precioVenta: Number(repuesto.precioVenta) });
    }
  }
  const lineas = datos.lineas.map((linea) => {
    const repuesto = linea.repuestoId ? catalogo.get(linea.repuestoId) : undefined;
    return repuesto
      ? { ...linea, descripcion: repuesto.nombre, precioUnitario: repuesto.precioVenta }
      : { ...linea, repuestoId: undefined };
  });

  // El esquema ya comparó el descuento con el subtotal del navegador; con los
  // precios reales hay que volver a hacerlo (un total negativo sería un cobro negativo).
  const subtotal = lineas.reduce((suma, linea) => suma + linea.cantidad * linea.precioUnitario, 0);
  if (datos.descuento > subtotal) return { error: "El descuento no puede ser mayor que el subtotal", success: false };
  const totales = calcularTotalesVenta(lineas, datos.descuento);

  // El tope de descuento de recepción se mide con el subtotal a precios del servidor.
  if (session.user.role === "RECEPCION") {
    const { descuentoMaxRecepcion } = await leerOpcionesTaller(tenantDb);
    const porcentaje = porcentajeDescuento(subtotal, datos.descuento);
    if (!descuentoPermitido("RECEPCION", porcentaje, descuentoMaxRecepcion)) {
      return { error: `Tu descuento máximo es ${descuentoMaxRecepcion} %`, success: false };
    }
  }

  const resumen = resumirPagos(totales.total, datos.pagos, datos.recibidoEfectivo ?? null);
  if (resumen.error) return { error: resumen.error, success: false };
  if (resumen.saldo > 0 && !datos.clienteId) {
    // Sin cliente identificado no hay a quién cobrarle el saldo después.
    return { error: "Para dejar saldo pendiente elige un cliente registrado", success: false };
  }

  const pagos: PagoEntrada[] = datos.pagos;

  // El stock se descuenta por repuesto, agregando las líneas repetidas (D8).
  const porRepuesto = new Map<string, { cantidad: number; descripcion: string }>();
  for (const linea of lineas) {
    if (!linea.repuestoId) continue;
    const acumulado = porRepuesto.get(linea.repuestoId);
    porRepuesto.set(linea.repuestoId, {
      cantidad: (acumulado?.cantidad ?? 0) + linea.cantidad,
      descripcion: linea.descripcion,
    });
  }

  let ventaId: string;
  let numero: number;
  try {
    const venta = await tenantDb.$transaction(async (tx) => {
      for (const [repuestoId, linea] of porRepuesto) {
        const { count } = await tx.repuesto.updateMany({
          where: { id: repuestoId, stockActual: { gte: linea.cantidad } },
          data: { stockActual: { decrement: linea.cantidad } },
        });
        if (count === 0) throw new Error(`${STOCK_INSUFICIENTE}:${linea.descripcion}`);
      }

      const creada = await tx.ventaMostrador.create({
        data: {
          sedeId,
          clienteId: datos.clienteId ?? null,
          subtotal: totales.subtotal,
          descuento: totales.descuento,
          iva: totales.iva,
          total: totales.total,
          saldoPendiente: resumen.saldo,
          estado: resumen.saldo === 0 ? "PAGADA" : "PENDIENTE",
          creadoPorId: session.user.id,
          items: {
            create: lineas.map((linea) => ({
              repuestoId: linea.repuestoId ?? null,
              descripcion: linea.descripcion,
              cantidad: linea.cantidad,
              precioUnitario: linea.precioUnitario,
            })),
          },
        },
        select: { id: true, numero: true },
      });

      for (const pago of pagos) {
        await tx.pagoVentaMostrador.create({
          data: {
            ventaId: creada.id,
            monto: pago.monto,
            metodoPago: pago.metodoPago,
            referencia: pago.referencia ?? null,
            registradoPorId: session.user.id,
          },
        });
      }

      return creada;
    });
    ventaId = venta.id;
    numero = venta.numero;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(STOCK_INSUFICIENTE)) {
      const descripcion = err.message.slice(STOCK_INSUFICIENTE.length + 1);
      return { error: `No hay stock suficiente de "${descripcion}"`, success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar la venta"), success: false };
  }

  revalidatePath("/mostrador");
  revalidatePath("/caja");
  return { error: null, success: true, numero, ventaId, total: totales.total, pagos, vueltas: resumen.vueltas };
}

export interface RepuestoMostrador {
  id: string;
  codigo: string;
  nombre: string;
  precioVenta: number;
  stockActual: number;
  /** Lo que queda libre: stock menos las unidades comprometidas en órdenes abiertas. */
  disponible: number;
}

export interface VentaMostradorDia {
  id: string;
  numero: number;
  total: number;
  saldoPendiente: number;
  estado: "PENDIENTE" | "PAGADA";
  clienteNombre: string | null;
  createdAt: Date;
  items: {
    id: string;
    descripcion: string;
    cantidad: number;
    devueltoCantidad: number;
    precioUnitario: number;
  }[];
}

export interface MostradorDatos {
  /** El taller usa control de caja y la de la sede está cerrada: no se cobra en efectivo. */
  efectivoBloqueado: boolean;
  repuestos: RepuestoMostrador[];
  clientes: { id: string; nombre: string }[];
  ventas: VentaMostradorDia[];
}

/**
 * Todo lo que necesita la pantalla del mostrador en una sola lectura: si hay caja
 * abierta (sin ella no se puede cobrar), los repuestos con su **stock libre** —
 * `stockActual` sobreestima lo vendible porque las órdenes abiertas ya
 * comprometieron unidades (misma regla que las alertas de inventario) —, los
 * clientes para la venta a crédito y las ventas del día con lo ya devuelto.
 */
export async function getMostradorDatos(): Promise<MostradorDatos> {
  const session = await requireRole(ROLES_MOSTRADOR);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;

  const [sesion, opciones, repuestos, clientes, ventas] = await Promise.all([
    sesionDeCajaAbierta(tenantDb, sedeId),
    leerOpcionesTaller(tenantDb),
    tenantDb.repuesto.findMany({
      where: { ...scopeRepuesto(sedeId) },
      select: { id: true, codigo: true, nombre: true, precioVenta: true, stockActual: true },
      orderBy: { nombre: "asc" },
    }),
    tenantDb.cliente.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" }, take: 500 }),
    tenantDb.ventaMostrador.findMany({
      where: { sedeId, createdAt: { gte: inicioDiaBogota(new Date()) } },
      select: {
        id: true,
        numero: true,
        total: true,
        saldoPendiente: true,
        estado: true,
        createdAt: true,
        cliente: { select: { nombre: true } },
        items: { select: { id: true, descripcion: true, cantidad: true, devueltoCantidad: true, precioUnitario: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const comprometido = await comprometidoPorRepuesto(tenantDb, sedeId);

  return {
    efectivoBloqueado: opciones.usarControlCaja && sesion === null,
    repuestos: repuestos.map((repuesto) => {
      const tomado = comprometido.get(repuesto.id) ?? 0;
      return {
        id: repuesto.id,
        codigo: repuesto.codigo,
        nombre: repuesto.nombre,
        precioVenta: Number(repuesto.precioVenta),
        stockActual: repuesto.stockActual,
        disponible: Math.max(0, repuesto.stockActual - tomado),
      };
    }),
    clientes,
    ventas: ventas.map((venta) => ({
      id: venta.id,
      numero: venta.numero,
      total: Number(venta.total),
      saldoPendiente: Number(venta.saldoPendiente),
      estado: venta.estado,
      clienteNombre: venta.cliente?.nombre ?? null,
      createdAt: venta.createdAt,
      items: venta.items.map((item) => ({
        id: item.id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        devueltoCantidad: item.devueltoCantidad,
        precioUnitario: Number(item.precioUnitario),
      })),
    })),
  };
}

export async function cobrarVentaMostradorAction(
  ventaId: string,
  prevState: VentaMostradorFormState,
  formData: FormData,
): Promise<VentaMostradorFormState> {
  void prevState;
  const parsed = cobroVentaSchema.safeParse({
    monto: formData.get("monto"),
    metodoPago: formData.get("metodoPago") ?? "",
    referencia: formData.get("referencia") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const session = await requireRole(ROLES_MOSTRADOR);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;

  const venta = await tenantDb.ventaMostrador.findFirst({
    where: { id: ventaId, sedeId },
    select: { id: true, numero: true, saldoPendiente: true },
  });
  if (!venta) return { error: "Venta no encontrada", success: false };
  if (Number(venta.saldoPendiente) <= 0) return { error: "Esa venta ya está pagada", success: false };
  const errorCaja = await exigirCajaParaEfectivo(tenantDb, sedeId, parsed.data.metodoPago, SIN_CAJA);
  if (errorCaja) return { error: errorCaja, success: false };

  try {
    await tenantDb.$transaction(async (tx) => {
      // Guarda atómica: si otra persona cobró o el saldo cambió, no se cobra dos veces.
      const { count } = await tx.ventaMostrador.updateMany({
        where: { id: ventaId, saldoPendiente: { gte: parsed.data.monto } },
        data: { saldoPendiente: { decrement: parsed.data.monto } },
      });
      if (count === 0) throw new Error(SALDO_INSUFICIENTE);

      await tx.pagoVentaMostrador.create({
        data: {
          ventaId,
          monto: parsed.data.monto,
          metodoPago: parsed.data.metodoPago,
          referencia: parsed.data.referencia ?? null,
          registradoPorId: session.user.id,
        },
      });

      const actualizada = await tx.ventaMostrador.findUniqueOrThrow({
        where: { id: ventaId },
        select: { saldoPendiente: true },
      });
      if (Number(actualizada.saldoPendiente) <= 0) {
        await tx.ventaMostrador.update({ where: { id: ventaId }, data: { estado: "PAGADA" } });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === SALDO_INSUFICIENTE) {
      return { error: "El monto no puede ser mayor al saldo, o alguien acaba de cobrar", success: false };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar el cobro"), success: false };
  }

  revalidatePath("/mostrador");
  revalidatePath("/caja");
  return { error: null, success: true, numero: venta.numero };
}
