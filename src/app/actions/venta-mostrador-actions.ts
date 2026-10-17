"use server";

import { revalidatePath } from "next/cache";
import { puede, requirePermiso } from "@/lib/auth/guards";
import { exigirCajaParaEfectivo, sesionDeCajaAbierta, ultimoCierreDeCaja } from "@/lib/caja/sesion";
import { leerOpcionesTaller } from "@/lib/configuracion/opciones-taller";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { publicDb } from "@/lib/db/public-client";
import { getTenantDb } from "@/lib/db/tenant-client";
import { enviarEmail } from "@/lib/email/enviar-email";
import {
  CONFIGURACION_SMTP_ID,
  descifrarConfiguracionSmtp,
  type ConfiguracionSmtpAlmacenada,
} from "@/lib/email/smtp-config";
import { inicioDiaBogota } from "@/lib/fecha-bogota";
import { comprometidoPorRepuesto } from "@/lib/inventario/comprometido";
import { descuentoPermitido, porcentajeDescuento, resumirPagos, type PagoEntrada } from "@/lib/mostrador/cobro";
import {
  agruparPagos,
  construirMensajeComprobante,
  describirMetodos,
  textoComprobanteWhatsapp,
  type ComprobanteVenta,
} from "@/lib/mostrador/comprobante";
import {
  estadoVentaMostrador,
  MAX_VENTAS_LISTADO,
  rangoDelFiltro,
  ventanaDelRango,
  type EstadoVentaMostrador,
  type RangoVentas,
} from "@/lib/mostrador/listado-ventas";
import { puedeDevolver, ventaEnCajaCerrada } from "@/lib/mostrador/plazo-devolucion";
import { calcularTotalesVenta } from "@/lib/mostrador/ventas";
import { roundMoney } from "@/lib/money/round";
import { scopeRepuesto } from "@/lib/sede/scope";
import { cobroVentaSchema, ventaMostradorInputSchema, type VentaMostradorInput } from "@/lib/validation/mostrador";
import { urlWhatsapp } from "@/lib/whatsapp/url";

/**
 * Venta de mostrador (Fase 24, D1/D2/D8): documento propio, sin orden de trabajo,
 * con la sede de la sesión, cobro inmediato o a crédito si hay cliente, y el stock
 * descontado **con guarda y dentro de la misma transacción** que la venta.
 *
 * Cobrar en efectivo (al vender o al abonar) exige caja abierta si el taller usa
 * el control de caja (fase de consolidación, D3): así ningún efectivo queda fuera
 * del arqueo. Una venta a crédito no mueve dinero y no la exige.
 */

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
  saldoPendiente?: number;
  /** null = Consumidor final. `correo` decide si se ofrece "Enviar por correo". */
  cliente?: { nombre: string; correo: string | null } | null;
  /** wa.me con el comprobante; null si no hay cliente con teléfono. */
  urlWhatsapp?: string | null;
  /** En error de stock: los repuestos que no alcanzaron, para marcar su fila. */
  repuestosSinStock?: string[];
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
    totalEsperado: formData.get("totalEsperado") ?? "",
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

  const session = await requirePermiso("mostrador.vender");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;

  // Solo hay que tener caja abierta si entra efectivo al cajón (D3).
  const hayEfectivo = datos.pagos.some((pago) => pago.metodoPago === "EFECTIVO");
  const errorCaja = await exigirCajaParaEfectivo(tenantDb, sedeId, hayEfectivo, SIN_CAJA);
  if (errorCaja) return { error: errorCaja, success: false };

  let cliente: { nombre: string; telefono: string | null; email: string | null } | null = null;
  if (datos.clienteId) {
    cliente = await tenantDb.cliente.findFirst({
      where: { id: datos.clienteId },
      select: { nombre: true, telefono: true, email: true },
    });
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

  // El total que vio el cajero debe ser el del servidor: si un precio cambió entre el
  // carrito y el cobro, los pagos ya no cubren lo mismo (y quedaría crédito sin avisar).
  if (roundMoney(datos.totalEsperado) !== totales.total) {
    return { error: "Los precios cambiaron: revisa el carrito y vuelve a cobrar", success: false };
  }

  // El tope de descuento de recepción se mide con el subtotal a precios del servidor.
  if (!puede(session, "mostrador.descuentoSinTope")) {
    const { descuentoMaxRecepcion } = await leerOpcionesTaller(tenantDb);
    const porcentaje = porcentajeDescuento(subtotal, datos.descuento);
    if (!descuentoPermitido(false, porcentaje, descuentoMaxRecepcion)) {
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
        if (count === 0) throw new ErrorSinStock(repuestoId, linea.descripcion);
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
          recibidoEfectivo: hayEfectivo ? (datos.recibidoEfectivo ?? null) : null,
          vueltas: resumen.vueltas,
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
    if (err instanceof ErrorSinStock) {
      return {
        error: `No hay stock suficiente de "${err.descripcion}"`,
        success: false,
        repuestosSinStock: [err.repuestoId],
      };
    }
    return { error: friendlyPrismaErrorMessage(err, "No se pudo registrar la venta"), success: false };
  }

  // El WhatsApp se arma aquí (con el nombre del taller) para que la tarjeta lo abra
  // como enlace, sin esperas que el bloqueador de ventanas castigue. La venta ya
  // está guardada: si esto falla no se puede responder error (el cajero cobraría
  // dos veces), solo se queda sin el enlace.
  let enlaceWhatsapp: string | null = null;
  if (cliente && urlWhatsapp(cliente.telefono, "") !== null) {
    try {
      const comprobante = await cargarComprobante(session.user.tenantSchema, tenantDb, sedeId, ventaId);
      if (comprobante) enlaceWhatsapp = urlWhatsapp(cliente.telefono, textoComprobanteWhatsapp(comprobante));
    } catch (err) {
      console.error("[crearVentaMostradorAction] venta guardada, pero no se pudo armar el WhatsApp", err);
    }
  }

  revalidatePath("/mostrador");
  revalidatePath("/caja");
  return {
    error: null,
    success: true,
    numero,
    ventaId,
    total: totales.total,
    pagos,
    vueltas: resumen.vueltas,
    saldoPendiente: resumen.saldo,
    cliente: cliente ? { nombre: cliente.nombre, correo: cliente.email || null } : null,
    urlWhatsapp: enlaceWhatsapp,
  };
}

/** Stock insuficiente dentro de la transacción: lleva el repuesto para marcar su fila. */
class ErrorSinStock extends Error {
  readonly repuestoId: string;
  readonly descripcion: string;

  constructor(repuestoId: string, descripcion: string) {
    super(STOCK_INSUFICIENTE);
    this.repuestoId = repuestoId;
    this.descripcion = descripcion;
  }
}

async function nombreTaller(tenantSchema: string): Promise<string> {
  const tenant = await publicDb.tenant.findUnique({ where: { schemaName: tenantSchema }, select: { nombre: true, slug: true } });
  return tenant?.nombre || tenant?.slug || "Nuestro taller";
}

/** El comprobante de una venta de la sede activa; null si no existe o es de otra sede. */
async function cargarComprobante(
  tenantSchema: string,
  tenantDb: ReturnType<typeof getTenantDb>,
  sedeId: string,
  ventaId: string,
): Promise<ComprobanteVenta | null> {
  const venta = await tenantDb.ventaMostrador.findFirst({
    where: { id: ventaId, sedeId },
    select: {
      id: true,
      numero: true,
      createdAt: true,
      subtotal: true,
      descuento: true,
      iva: true,
      total: true,
      saldoPendiente: true,
      recibidoEfectivo: true,
      vueltas: true,
      sede: { select: { nombre: true } },
      cliente: { select: { nombre: true, documento: true, telefono: true, email: true } },
      items: {
        select: { id: true, descripcion: true, cantidad: true, precioUnitario: true },
        orderBy: { createdAt: "asc" },
      },
      pagos: { select: { metodoPago: true, monto: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!venta) return null;

  return {
    id: venta.id,
    tallerNombre: await nombreTaller(tenantSchema),
    sedeNombre: venta.sede.nombre,
    numero: venta.numero,
    fecha: venta.createdAt,
    cliente: venta.cliente
      ? {
          nombre: venta.cliente.nombre,
          documento: venta.cliente.documento ?? null,
          telefono: venta.cliente.telefono ?? null,
          email: venta.cliente.email || null,
        }
      : null,
    lineas: venta.items.map((item) => ({
      id: item.id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: Number(item.precioUnitario),
    })),
    subtotal: Number(venta.subtotal),
    descuento: Number(venta.descuento),
    iva: Number(venta.iva),
    total: Number(venta.total),
    pagos: agruparPagos(venta.pagos.map((pago) => ({ metodoPago: pago.metodoPago, monto: Number(pago.monto) }))),
    saldoPendiente: Number(venta.saldoPendiente),
    recibidoEfectivo: venta.recibidoEfectivo === null ? null : Number(venta.recibidoEfectivo),
    vueltas: Number(venta.vueltas),
  };
}

/**
 * Comprobante imprimible de una venta (ruta `/mostrador/[id]/comprobante`):
 * solo ADMIN y RECEPCION, y solo ventas de la sede activa del tenant.
 */
export async function getComprobanteVentaMostrador(ventaId: string): Promise<ComprobanteVenta | null> {
  const session = await requirePermiso("mostrador.vender");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return cargarComprobante(session.user.tenantSchema, tenantDb, session.user.sedeActivaId, ventaId);
}

export interface EnviarComprobanteState {
  error: string | null;
  success: boolean;
}

/** Manda el comprobante al correo del cliente por el SMTP del taller (como la cotización). */
export async function enviarComprobanteCorreoAction(ventaId: string): Promise<EnviarComprobanteState> {
  const session = await requirePermiso("mostrador.vender");
  if (typeof ventaId !== "string" || ventaId === "") return { error: "Venta no encontrada", success: false };
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const comprobante = await cargarComprobante(session.user.tenantSchema, tenantDb, session.user.sedeActivaId, ventaId);
  if (!comprobante) return { error: "Venta no encontrada", success: false };
  if (!comprobante.cliente?.email) return { error: "Este cliente no tiene correo registrado.", success: false };

  const filaSmtp = await tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
  if (!filaSmtp || !filaSmtp.activo) {
    return {
      error: "No se puede enviar por correo: el servidor SMTP no está configurado o está inactivo. Ve a Configuración → SMTP.",
      success: false,
    };
  }
  try {
    const config = descifrarConfiguracionSmtp(filaSmtp as ConfiguracionSmtpAlmacenada);
    await enviarEmail(config, construirMensajeComprobante(comprobante.cliente.email, comprobante));
  } catch {
    // El error crudo de SMTP puede traer el host o el usuario: se muestra uno genérico.
    return { error: "No se pudo enviar el comprobante por correo. Revisa la configuración SMTP.", success: false };
  }
  return { error: null, success: true };
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

export interface ResultadoRepuestoMostrador extends RepuestoMostrador {
  /** El texto coincide exacto con el código: se ofrece primero (lector de códigos de barras). */
  exacto?: boolean;
}

const MAX_RESULTADOS_MOSTRADOR = 20;

function aRepuestoMostrador(
  repuesto: { id: string; codigo: string; nombre: string; precioVenta: unknown; stockActual: number },
  comprometido: Map<string, number>,
): RepuestoMostrador {
  const tomado = comprometido.get(repuesto.id) ?? 0;
  return {
    id: repuesto.id,
    codigo: repuesto.codigo,
    nombre: repuesto.nombre,
    precioVenta: Number(repuesto.precioVenta),
    stockActual: repuesto.stockActual,
    disponible: Math.max(0, repuesto.stockActual - tomado),
  };
}

/**
 * Búsqueda del mostrador en el servidor: repuestos de la sede activa cuyo nombre
 * o código contiene el texto (sin distinguir mayúsculas), con su stock libre.
 * Un código exacto va primero y se marca `exacto`. Sin texto no devuelve nada.
 */
export async function buscarParaMostradorAction(texto: string): Promise<ResultadoRepuestoMostrador[]> {
  const session = await requirePermiso("mostrador.vender");
  const q = (typeof texto === "string" ? texto : "").trim().slice(0, 80);
  if (q === "") return [];
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;
  const select = { id: true, codigo: true, nombre: true, precioVenta: true, stockActual: true } as const;

  const [exactos, coincidencias, comprometido] = await Promise.all([
    tenantDb.repuesto.findMany({
      where: { ...scopeRepuesto(sedeId), codigo: { equals: q, mode: "insensitive" } },
      select,
    }),
    tenantDb.repuesto.findMany({
      where: {
        ...scopeRepuesto(sedeId),
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { codigo: { contains: q, mode: "insensitive" } },
        ],
      },
      select,
      orderBy: { nombre: "asc" },
      take: MAX_RESULTADOS_MOSTRADOR,
    }),
    comprometidoPorRepuesto(tenantDb, sedeId),
  ]);

  const idsExactos = new Set(exactos.map((repuesto) => repuesto.id));
  const resto = coincidencias.filter((repuesto) => !idsExactos.has(repuesto.id));
  return [
    ...exactos.map((repuesto) => ({ ...aRepuestoMostrador(repuesto, comprometido), exacto: true })),
    ...resto.map((repuesto) => aRepuestoMostrador(repuesto, comprometido)),
  ].slice(0, MAX_RESULTADOS_MOSTRADOR);
}

export interface ClienteMostrador {
  id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  /** Placas de sus vehículos (hasta 3), para reconocerlo al buscar por placa. */
  placas: string[];
  /** Suma de lo que debe en ventas del mostrador (0 si está al día). */
  saldoMostrador: number;
}

const MAX_CLIENTES_MOSTRADOR = 10;

/**
 * Busca clientes para la venta: cada palabra debe aparecer en el nombre, el
 * documento, el teléfono o la placa de alguno de sus vehículos (sin distinguir
 * mayúsculas). Trae su saldo pendiente en ventas del mostrador. Sin texto no
 * devuelve nada.
 */
export async function buscarClientesMostradorAction(texto: string): Promise<ClienteMostrador[]> {
  const session = await requirePermiso("mostrador.vender");
  const q = (typeof texto === "string" ? texto : "").trim().slice(0, 80);
  if (q === "") return [];
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const clientes = await tenantDb.cliente.findMany({
    where: {
      AND: q
        .split(/\s+/)
        .filter(Boolean)
        .map((palabra) => ({
          OR: [
            { nombre: { contains: palabra, mode: "insensitive" as const } },
            { documento: { contains: palabra, mode: "insensitive" as const } },
            { telefono: { contains: palabra, mode: "insensitive" as const } },
            { vehiculos: { some: { placa: { contains: palabra, mode: "insensitive" as const } } } },
          ],
        })),
    },
    select: {
      id: true,
      nombre: true,
      documento: true,
      telefono: true,
      vehiculos: { select: { placa: true }, orderBy: { placa: "asc" }, take: 3 },
    },
    orderBy: { nombre: "asc" },
    take: MAX_CLIENTES_MOSTRADOR,
  });
  if (clientes.length === 0) return [];

  const saldos = await tenantDb.ventaMostrador.groupBy({
    by: ["clienteId"],
    where: { clienteId: { in: clientes.map((cliente) => cliente.id) }, saldoPendiente: { gt: 0 } },
    _sum: { saldoPendiente: true },
  });
  const saldoPorCliente = new Map(saldos.map((fila) => [fila.clienteId, Number(fila._sum.saldoPendiente ?? 0)]));

  return clientes.map((cliente) => ({
    id: cliente.id,
    nombre: cliente.nombre,
    documento: cliente.documento,
    telefono: cliente.telefono,
    placas: cliente.vehiculos.map((vehiculo) => vehiculo.placa),
    saldoMostrador: saldoPorCliente.get(cliente.id) ?? 0,
  }));
}

/** Una venta en la pestaña Ventas (rediseño, §5): lo de la tabla, el cobro y la devolución. */
export interface VentaMostradorFila {
  id: string;
  numero: number;
  createdAt: Date;
  clienteNombre: string | null;
  subtotal: number;
  total: number;
  saldoPendiente: number;
  /** Suma de las devoluciones ya registradas (el tope de lo que aún se puede devolver). */
  totalDevuelto: number;
  estado: EstadoVentaMostrador;
  /** "Efectivo + Tarjeta" o "A crédito". */
  metodos: string;
  items: {
    id: string;
    descripcion: string;
    cantidad: number;
    devueltoCantidad: number;
    precioUnitario: number;
  }[];
  /** Si quien mira puede devolverla hoy (30 días; caja cerrada solo ADMIN) y por qué no. */
  devolucion: { permitido: boolean; motivo: string | null };
}

export interface ResumenVentasHoy {
  vendido: number;
  numeroVentas: number;
  /** Efectivo cobrado hoy por el mostrador menos lo devuelto en efectivo hoy. */
  efectivo: number;
  /** Saldo pendiente de todas las ventas de mostrador de la sede (crédito). */
  porCobrar: number;
  ventasPorCobrar: number;
  devuelto: number;
}

export interface MostradorDatos {
  /** El taller usa control de caja y la de la sede está cerrada: no se cobra en efectivo. */
  efectivoBloqueado: boolean;
  /** Para el chip de la cabecera: solo se muestra si el taller usa control de caja. */
  usarControlCaja: boolean;
  cajaAbierta: boolean;
  /** Tope de descuento en % para quien vende; null = sin tope (decidido en el servidor). */
  topeDescuento: number | null;
  /** Las ventas de hoy (el filtro por defecto de la pestaña Ventas). */
  ventas: VentaMostradorFila[];
  resumen: ResumenVentasHoy;
}

type TenantDb = ReturnType<typeof getTenantDb>;

const SELECT_FILA = {
  id: true,
  numero: true,
  createdAt: true,
  subtotal: true,
  total: true,
  saldoPendiente: true,
  cliente: { select: { nombre: true } },
  items: {
    select: { id: true, descripcion: true, cantidad: true, devueltoCantidad: true, precioUnitario: true },
    orderBy: { createdAt: "asc" },
  },
  pagos: { select: { metodoPago: true, monto: true }, orderBy: { createdAt: "asc" } },
  devoluciones: { select: { total: true } },
} as const;

/** Lo que decide si se puede devolver, leído una vez para todas las filas. */
interface ContextoDevolucion {
  ahora: Date;
  puedeConCajaCerrada: boolean;
  usarControlCaja: boolean;
  /** Último cierre de caja de la sede: las ventas anteriores a él ya pasaron por un arqueo. */
  ultimoCierreCaja: Date | null;
}

async function contextoDevolucion(
  tenantDb: TenantDb,
  sedeId: string,
  puedeConCajaCerrada: boolean,
  usarControlCaja: boolean,
): Promise<ContextoDevolucion> {
  const ultimoCierreCaja = usarControlCaja ? await ultimoCierreDeCaja(tenantDb, sedeId) : null;
  return { ahora: new Date(), puedeConCajaCerrada, usarControlCaja, ultimoCierreCaja };
}

async function leerContextoDevolucion(tenantDb: TenantDb, sedeId: string, puedeConCajaCerrada: boolean): Promise<ContextoDevolucion> {
  const { usarControlCaja } = await leerOpcionesTaller(tenantDb);
  return contextoDevolucion(tenantDb, sedeId, puedeConCajaCerrada, usarControlCaja);
}


async function leerFilas(
  tenantDb: TenantDb,
  where: { sedeId: string; id?: string; createdAt?: { gte: Date; lt: Date } },
  contexto: ContextoDevolucion,
  take?: number,
): Promise<VentaMostradorFila[]> {
  const ventas = await tenantDb.ventaMostrador.findMany({
    where,
    select: SELECT_FILA,
    orderBy: { createdAt: "desc" },
    ...(take ? { take } : {}),
  });
  return ventas.map((venta) => {
    const items = venta.items.map((item) => ({
      id: item.id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      devueltoCantidad: item.devueltoCantidad,
      precioUnitario: Number(item.precioUnitario),
    }));
    const saldoPendiente = Number(venta.saldoPendiente);
    const cajaCerrada = ventaEnCajaCerrada({
      fechaVenta: venta.createdAt,
      ahora: contexto.ahora,
      usarControlCaja: contexto.usarControlCaja,
      ultimoCierreCaja: contexto.ultimoCierreCaja,
    });
    return {
      id: venta.id,
      numero: venta.numero,
      createdAt: venta.createdAt,
      clienteNombre: venta.cliente?.nombre ?? null,
      subtotal: Number(venta.subtotal),
      total: Number(venta.total),
      saldoPendiente,
      totalDevuelto: venta.devoluciones.reduce((suma, devolucion) => suma + Number(devolucion.total), 0),
      estado: estadoVentaMostrador(items, saldoPendiente),
      metodos: describirMetodos(venta.pagos.map((pago) => ({ metodoPago: pago.metodoPago, monto: Number(pago.monto) }))),
      items,
      devolucion: puedeDevolver({ fechaVenta: venta.createdAt, ahora: contexto.ahora, puedeConCajaCerrada: contexto.puedeConCajaCerrada, cajaCerrada }),
    };
  });
}

async function resumenDeHoy(tenantDb: TenantDb, sedeId: string, ahora: Date): Promise<ResumenVentasHoy> {
  const hoy = { gte: inicioDiaBogota(ahora) };
  const [vendidas, efectivoCobrado, devueltas, devueltoEnEfectivo, pendientes] = await Promise.all([
    tenantDb.ventaMostrador.aggregate({ where: { sedeId, createdAt: hoy }, _sum: { total: true }, _count: { _all: true } }),
    tenantDb.pagoVentaMostrador.aggregate({
      where: { metodoPago: "EFECTIVO", createdAt: hoy, venta: { sedeId } },
      _sum: { monto: true },
    }),
    tenantDb.devolucionMostrador.aggregate({ where: { sedeId, createdAt: hoy }, _sum: { total: true } }),
    tenantDb.devolucionMostrador.aggregate({
      where: { sedeId, metodoPago: "EFECTIVO", createdAt: hoy },
      _sum: { montoEnEfectivo: true },
    }),
    tenantDb.ventaMostrador.aggregate({
      where: { sedeId, saldoPendiente: { gt: 0 } },
      _sum: { saldoPendiente: true },
      _count: { _all: true },
    }),
  ]);
  return {
    vendido: Number(vendidas._sum.total ?? 0),
    numeroVentas: vendidas._count._all,
    efectivo: Number(efectivoCobrado._sum.monto ?? 0) - Number(devueltoEnEfectivo._sum.montoEnEfectivo ?? 0),
    porCobrar: Number(pendientes._sum.saldoPendiente ?? 0),
    ventasPorCobrar: pendientes._count._all,
    devuelto: Number(devueltas._sum.total ?? 0),
  };
}

/**
 * Lo que necesita la pantalla del mostrador en una sola lectura: si hay caja
 * abierta (sin ella no se puede cobrar en efectivo), las ventas de hoy y los KPI
 * del día. Repuestos y clientes no viajan completos: se buscan en el servidor con
 * `buscarParaMostradorAction` y `buscarClientesMostradorAction`.
 */
export async function getMostradorDatos(): Promise<MostradorDatos> {
  const session = await requirePermiso("mostrador.vender");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;

  const opciones = await leerOpcionesTaller(tenantDb);
  const [sesion, contexto] = await Promise.all([
    sesionDeCajaAbierta(tenantDb, sedeId),
    contextoDevolucion(tenantDb, sedeId, puede(session, "mostrador.devolverConCajaCerrada"), opciones.usarControlCaja),
  ]);
  const hoy = ventanaDelRango(rangoDelFiltro("hoy", contexto.ahora));
  if ("error" in hoy) throw new Error(hoy.error);
  const [ventas, resumen] = await Promise.all([
    leerFilas(tenantDb, { sedeId, createdAt: { gte: hoy.inicio, lt: hoy.fin } }, contexto),
    resumenDeHoy(tenantDb, sedeId, contexto.ahora),
  ]);

  return {
    efectivoBloqueado: opciones.usarControlCaja && sesion === null,
    usarControlCaja: opciones.usarControlCaja,
    cajaAbierta: sesion !== null,
    topeDescuento: puede(session, "mostrador.descuentoSinTope") ? null : opciones.descuentoMaxRecepcion,
    ventas,
    resumen,
  };
}

export interface ListadoVentasMostrador {
  ventas: VentaMostradorFila[];
  error: string | null;
  /** Había más de `MAX_VENTAS_LISTADO`: solo vienen las más recientes. */
  limitado: boolean;
}

/**
 * Ventas de la sede activa entre dos días de Bogotá (ambos incluidos), de máximo
 * 30 días: los filtros Hoy, Ayer y Últimos 30 días de la pestaña Ventas.
 */
export async function listarVentasMostradorAction(rango: RangoVentas): Promise<ListadoVentasMostrador> {
  const session = await requirePermiso("mostrador.vender");
  const ventana = ventanaDelRango({
    desde: typeof rango?.desde === "string" ? rango.desde : "",
    hasta: typeof rango?.hasta === "string" ? rango.hasta : "",
  });
  if ("error" in ventana) return { ventas: [], error: ventana.error, limitado: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;
  const contexto = await leerContextoDevolucion(tenantDb, sedeId, puede(session, "mostrador.devolverConCajaCerrada"));
  // Se pide una de más para saber si hubo que cortar.
  const ventas = await leerFilas(
    tenantDb,
    { sedeId, createdAt: { gte: ventana.inicio, lt: ventana.fin } },
    contexto,
    MAX_VENTAS_LISTADO + 1,
  );
  const limitado = ventas.length > MAX_VENTAS_LISTADO;
  return { ventas: limitado ? ventas.slice(0, MAX_VENTAS_LISTADO) : ventas, error: null, limitado };
}

/**
 * Una venta de la sede activa, sin importar su fecha: el enlace "Cobrar" de
 * Cartera (`?tab=ventas&venta=<id>`) puede apuntar a una venta vieja, y cobrar el
 * saldo no tiene plazo (solo la devolución lo tiene).
 */
export async function obtenerVentaMostradorAction(ventaId: string): Promise<VentaMostradorFila | null> {
  const session = await requirePermiso("mostrador.vender");
  if (typeof ventaId !== "string" || ventaId === "") return null;
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const sedeId = session.user.sedeActivaId;
  const contexto = await leerContextoDevolucion(tenantDb, sedeId, puede(session, "mostrador.devolverConCajaCerrada"));
  const [venta] = await leerFilas(tenantDb, { sedeId, id: ventaId }, contexto);
  return venta ?? null;
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

  const session = await requirePermiso("mostrador.vender");
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
