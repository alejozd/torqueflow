"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { publicDb } from "@/lib/db/public-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { CANTIDAD_MAXIMA_LINEA } from "@/lib/validation/inventario";
import { CONFIGURACION_SMTP_ID, descifrarConfiguracionSmtp, type ConfiguracionSmtpAlmacenada } from "@/lib/email/smtp-config";
import { enviarEmail } from "@/lib/email/enviar-email";
import { scopePedidoCompra, scopeRepuesto } from "@/lib/sede/scope";
import {
  accionesPermitidas,
  agruparLineasPedido,
  calcularFechaEsperada,
  construirMensajePedido,
  textoPedidoWhatsapp,
  type DatosMensajePedido,
} from "@/lib/pedido-compra/pedido-compra";
import { urlWhatsapp } from "@/lib/whatsapp/url";
import type { CanalPedidoCompra, EstadoPedidoCompra, Prisma } from "@/generated/prisma-tenant";

const NO_ENCONTRADO = "Pedido no encontrado en tu sede activa.";
const ROLES_COMPRAS = ["ADMIN", "RECEPCION"] as const;

const PEDIDO_DETALLE_INCLUDE = {
  proveedor: { select: { id: true, nombre: true, telefono: true, email: true, diasEntrega: true } },
  bodega: { select: { id: true, nombre: true } },
  creadoPor: { select: { nombre: true } },
  items: {
    include: { repuesto: { select: { id: true, codigo: true, nombre: true } } },
    orderBy: { repuesto: { nombre: "asc" } },
  },
} satisfies Prisma.PedidoCompraInclude;

export type PedidoCompraConDetalle = Prisma.PedidoCompraGetPayload<{ include: typeof PEDIDO_DETALLE_INCLUDE }>;

function revalidarPedidos(pedidoId?: string) {
  revalidatePath("/pedidos-compra");
  if (pedidoId) revalidatePath(`/pedidos-compra/${pedidoId}`);
  revalidatePath("/");
}

export async function listPedidosCompra(estado?: EstadoPedidoCompra): Promise<PedidoCompraConDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.pedidoCompra.findMany({
    where: { ...scopePedidoCompra(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: PEDIDO_DETALLE_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getPedidoCompra(id: string): Promise<PedidoCompraConDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.pedidoCompra.findFirst({
    where: { id, ...scopePedidoCompra(session.user.sedeActivaId) },
    include: PEDIDO_DETALLE_INCLUDE,
  });
}

/** Name used to sign messages to proveedores: the taller's name, falling back to its slug. */
async function nombreTaller(tenantSchema: string): Promise<string> {
  const tenant = await publicDb.tenant.findUnique({ where: { schemaName: tenantSchema }, select: { nombre: true, slug: true } });
  return tenant?.nombre || tenant?.slug || "Nuestro taller";
}

function datosMensaje(pedido: PedidoCompraConDetalle, tallerNombre: string): DatosMensajePedido {
  return {
    numero: pedido.numero,
    tallerNombre,
    proveedorNombre: pedido.proveedor.nombre,
    bodegaNombre: pedido.bodega.nombre,
    items: pedido.items.map((item) => ({ codigo: item.repuesto.codigo, nombre: item.repuesto.nombre, cantidad: item.cantidad })),
  };
}

/** wa.me link with the pedido prefilled, or null when the proveedor has no usable phone. */
export async function getEnlaceWhatsappPedido(id: string): Promise<string | null> {
  const session = await requireSession();
  const pedido = await getPedidoCompra(id);
  if (!pedido) return null;
  return urlWhatsapp(pedido.proveedor.telefono, textoPedidoWhatsapp(datosMensaje(pedido, await nombreTaller(session.user.tenantSchema))));
}

const lineasSchema = z
  .array(
    z.object({
      repuestoId: z.string().min(1),
      cantidad: z.coerce
        .number()
        .int("Las cantidades deben ser enteras")
        .min(1, "Las cantidades deben ser mayores que 0")
        .max(CANTIDAD_MAXIMA_LINEA, "Las cantidades no pueden superar 100.000 unidades"),
    }),
  )
  .min(1, "Selecciona al menos un repuesto")
  .max(200, "Máximo 200 repuestos por vez");

export interface CrearPedidosResult {
  error: string | null;
  pedidoIds: string[];
}

/**
 * Turns the dashboard selection into BORRADOR pedidos, one per proveedor +
 * bodega (see agruparLineasPedido), priced at each repuesto's precioCompra.
 * All-or-nothing: if any repuesto lacks a proveedor nothing is created, so
 * the user never ends up with half of their selection ordered.
 */
export async function crearPedidosCompraAction(lineas: { repuestoId: string; cantidad: number }[]): Promise<CrearPedidosResult> {
  const parsed = lineasSchema.safeParse(lineas);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", pedidoIds: [] };

  const session = await requireRole([...ROLES_COMPRAS]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const ids = [...new Set(parsed.data.map((linea) => linea.repuestoId))];
  const repuestos = await tenantDb.repuesto.findMany({
    where: { id: { in: ids }, ...scopeRepuesto(session.user.sedeActivaId) },
    select: { id: true, nombre: true, proveedorId: true, bodegaId: true, precioCompra: true },
  });
  if (repuestos.length !== ids.length) return { error: "Algún repuesto no pertenece a tu sede activa.", pedidoIds: [] };

  const porId = new Map(repuestos.map((repuesto) => [repuesto.id, repuesto]));
  const cantidades = new Map<string, number>();
  for (const linea of parsed.data) cantidades.set(linea.repuestoId, (cantidades.get(linea.repuestoId) ?? 0) + linea.cantidad);

  const { grupos, sinProveedor } = agruparLineasPedido(
    ids.map((id) => {
      const repuesto = porId.get(id)!;
      return {
        repuestoId: id,
        proveedorId: repuesto.proveedorId,
        bodegaId: repuesto.bodegaId,
        cantidad: cantidades.get(id)!,
        precioCompra: Number(repuesto.precioCompra),
      };
    }),
  );
  if (sinProveedor.length > 0) {
    const nombres = sinProveedor.map((linea) => porId.get(linea.repuestoId)!.nombre).join(", ");
    return { error: `Asigna un proveedor antes de pedir: ${nombres}.`, pedidoIds: [] };
  }

  let pedidoIds: string[];
  try {
    pedidoIds = await tenantDb.$transaction(async (tx) => {
      const creados: string[] = [];
      for (const grupo of grupos) {
        const pedido = await tx.pedidoCompra.create({
          data: {
            proveedorId: grupo.proveedorId,
            bodegaId: grupo.bodegaId,
            creadoPorId: session.user.id,
            items: {
              create: grupo.lineas.map((linea) => ({
                repuestoId: linea.repuestoId,
                cantidad: linea.cantidad,
                precioCompraUnitario: linea.precioCompra,
              })),
            },
          },
          select: { id: true },
        });
        creados.push(pedido.id);
      }
      return creados;
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear los pedidos"), pedidoIds: [] };
  }

  revalidarPedidos();
  return { error: null, pedidoIds };
}

export interface AccionPedidoResult {
  error: string | null;
}

async function pedidoParaAccion(id: string) {
  const session = await requireRole([...ROLES_COMPRAS]);
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const pedido = await tenantDb.pedidoCompra.findFirst({
    where: { id, ...scopePedidoCompra(session.user.sedeActivaId) },
    include: PEDIDO_DETALLE_INCLUDE,
  });
  return { session, tenantDb, pedido };
}

/**
 * First send moves BORRADOR -> ENVIADO and fixes enviadoAt + fechaEsperada;
 * a resend of an ENVIADO pedido only records the channel used, so the
 * expected date the alerts show does not drift every time it is resent.
 */
async function marcarEnviado(
  tenantDb: ReturnType<typeof getTenantDb>,
  pedido: PedidoCompraConDetalle,
  canal: CanalPedidoCompra,
): Promise<void> {
  const ahora = new Date();
  await tenantDb.pedidoCompra.update({
    where: { id: pedido.id },
    data:
      pedido.estado === "BORRADOR"
        ? { estado: "ENVIADO", canal, enviadoAt: ahora, fechaEsperada: calcularFechaEsperada(ahora, pedido.proveedor.diasEntrega) }
        : { canal },
  });
}

export async function enviarPedidoCompraEmailAction(id: string): Promise<AccionPedidoResult> {
  const { session, tenantDb, pedido } = await pedidoParaAccion(id);
  if (!pedido) return { error: NO_ENCONTRADO };
  if (!accionesPermitidas(pedido.estado).enviar) return { error: "Este pedido ya no se puede enviar." };
  if (!pedido.proveedor.email) return { error: "El proveedor no tiene correo registrado. Agrégalo en Proveedores." };

  const filaSmtp = await tenantDb.configuracionSmtp.findUnique({ where: { id: CONFIGURACION_SMTP_ID } });
  if (!filaSmtp || !filaSmtp.activo) {
    return { error: "No se puede enviar por correo: el servidor SMTP no está configurado o está inactivo. Ve a Configuración → SMTP." };
  }
  try {
    const config = descifrarConfiguracionSmtp(filaSmtp as ConfiguracionSmtpAlmacenada);
    const tallerNombre = config.fromNombre || (await nombreTaller(session.user.tenantSchema));
    await enviarEmail(config, construirMensajePedido(pedido.proveedor.email, datosMensaje(pedido, tallerNombre)));
  } catch {
    // Same as the cotización send: raw SMTP/crypto errors can leak host, user
    // or internal IPs, so the client only gets a generic message.
    return { error: "No se pudo enviar el pedido por correo. Revisa el servidor, el puerto y las credenciales." };
  }

  try {
    await marcarEnviado(tenantDb, pedido, "EMAIL");
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "El correo salió, pero no se pudo marcar el pedido como enviado") };
  }
  revalidarPedidos(id);
  return { error: null };
}

/** The client opened the wa.me link itself; this only records the send. */
export async function registrarEnvioWhatsappPedidoAction(id: string): Promise<AccionPedidoResult> {
  const { tenantDb, pedido } = await pedidoParaAccion(id);
  if (!pedido) return { error: NO_ENCONTRADO };
  if (!accionesPermitidas(pedido.estado).enviar) return { error: "Este pedido ya no se puede enviar." };
  try {
    await marcarEnviado(tenantDb, pedido, "WHATSAPP");
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo marcar el pedido como enviado") };
  }
  revalidarPedidos(id);
  return { error: null };
}

export async function cancelarPedidoCompraAction(id: string): Promise<AccionPedidoResult> {
  const { tenantDb, pedido } = await pedidoParaAccion(id);
  if (!pedido) return { error: NO_ENCONTRADO };
  if (!accionesPermitidas(pedido.estado).cancelar) return { error: "Este pedido ya no se puede cancelar." };
  await tenantDb.pedidoCompra.update({ where: { id }, data: { estado: "CANCELADO" } });
  revalidarPedidos(id);
  return { error: null };
}

const recepcionSchema = z
  .array(
    z.object({
      itemId: z.string().min(1),
      cantidad: z.coerce
        .number()
        .int("Usa cantidades enteras")
        .min(0, "Las cantidades no pueden ser negativas")
        .max(CANTIDAD_MAXIMA_LINEA, "Las cantidades no pueden superar 100.000 unidades"),
    }),
  )
  .min(1);

export interface RecibirPedidoResult {
  error: string | null;
  entradaId: string | null;
}

/**
 * Receives an ENVIADO pedido: creates the EntradaMercancia with what actually
 * arrived (each line defaults to the ordered quantity; 0 skips it), increments
 * stock exactly like adding items to an entrada by hand, and closes the
 * pedido as RECIBIDO -- all in one transaction.
 */
export async function recibirPedidoCompraAction(
  id: string,
  recibidos: { itemId: string; cantidad: number }[],
): Promise<RecibirPedidoResult> {
  const parsed = recepcionSchema.safeParse(recibidos);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", entradaId: null };

  const { session, tenantDb, pedido } = await pedidoParaAccion(id);
  if (!pedido) return { error: NO_ENCONTRADO, entradaId: null };
  if (!accionesPermitidas(pedido.estado).recibir) return { error: "Solo se puede recibir un pedido enviado.", entradaId: null };

  const itemsPorId = new Map(pedido.items.map((item) => [item.id, item]));
  if (parsed.data.some((linea) => !itemsPorId.has(linea.itemId))) {
    return { error: "Hay ítems que no pertenecen a este pedido.", entradaId: null };
  }
  const lineas = parsed.data.filter((linea) => linea.cantidad > 0);
  if (lineas.length === 0) return { error: "Indica al menos una cantidad recibida.", entradaId: null };

  let entradaId: string;
  try {
    entradaId = await tenantDb.$transaction(async (tx) => {
      const entrada = await tx.entradaMercancia.create({
        data: {
          proveedorId: pedido.proveedor.id,
          bodegaId: pedido.bodega.id,
          creadoPorId: session.user.id,
          items: {
            create: lineas.map((linea) => {
              const item = itemsPorId.get(linea.itemId)!;
              return { repuestoId: item.repuestoId, cantidad: linea.cantidad, precioCompraUnitario: item.precioCompraUnitario };
            }),
          },
        },
        select: { id: true },
      });
      for (const linea of lineas) {
        await tx.repuesto.update({
          where: { id: itemsPorId.get(linea.itemId)!.repuestoId },
          data: { stockActual: { increment: linea.cantidad } },
        });
      }
      // estado guard inside the transaction: two people receiving at once
      // must not create two entradas for the same pedido.
      const { count } = await tx.pedidoCompra.updateMany({
        where: { id, estado: "ENVIADO" },
        data: { estado: "RECIBIDO", recibidoAt: new Date(), entradaId: entrada.id },
      });
      if (count === 0) throw new Error("PEDIDO_YA_RECIBIDO");
      return entrada.id;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "PEDIDO_YA_RECIBIDO") {
      return { error: "Este pedido ya fue recibido.", entradaId: null };
    }
    return { error: friendlyPrismaErrorMessage(err, "Error al recibir el pedido"), entradaId: null };
  }

  revalidarPedidos(id);
  revalidatePath("/entradas-mercancia");
  revalidatePath("/repuestos");
  return { error: null, entradaId };
}
