"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import {
  crearCotizacionInputSchema,
  itemCotizacionInputSchema,
  descuentoCotizacionInputSchema,
  enviarCotizacionInputSchema,
} from "@/lib/validation/cotizacion";
import { computeCotizacionTotales } from "@/lib/cotizacion/totales";
import { isValidEstadoTransition } from "@/lib/cotizacion/estado-transitions";
import { assertCotizacionMutable } from "@/lib/cotizacion/mutable-guard";
import { scopeCotizacion, scopeRepuesto } from "@/lib/sede/scope";
import type { EstadoCotizacion, Prisma } from "@/generated/prisma-tenant";

export interface CotizacionFormState {
  error: string | null;
  success: boolean;
  cotizacionId: string | null;
}

export interface ItemCotizacionFormState {
  error: string | null;
  success: boolean;
}

export interface DescuentoCotizacionFormState {
  error: string | null;
  success: boolean;
}

export interface EnviarCotizacionFormState {
  error: string | null;
  success: boolean;
}

export interface AprobarCotizacionFormState {
  error: string | null;
  success: boolean;
  ordenId: string | null;
}

export interface RechazarCotizacionFormState {
  error: string | null;
  success: boolean;
}

export interface VehiculoOption {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  clienteNombre: string;
}

const COTIZACION_DETAIL_INCLUDE = {
  cliente: { select: { id: true, nombre: true, telefono: true, email: true, documento: true } },
  vehiculo: { select: { id: true, placa: true, marca: true, modelo: true, color: true, anio: true } },
  sede: { select: { id: true, nombre: true } },
  creadoPor: { select: { id: true, nombre: true } },
  items: { orderBy: { createdAt: "asc" } },
  orden: { select: { id: true } },
} satisfies Prisma.CotizacionInclude;

export type CotizacionConDetalle = Prisma.CotizacionGetPayload<{ include: typeof COTIZACION_DETAIL_INCLUDE }>;

const NO_ENCONTRADA = "Cotización no encontrada";

function revalidarCotizaciones(id?: string): void {
  revalidatePath("/cotizaciones");
  if (id) {
    revalidatePath(`/cotizaciones/${id}`);
  }
}

/**
 * Recomputes and persists subtotal/descuento/iva/total from the cotización's
 * current items + descuentoPct. Called after every item mutation and every
 * descuentoPct change so the parent row never drifts from its ítems -- same
 * reason crearFacturaAction computes totals from source rows instead of
 * trusting a client-submitted total (src/app/actions/factura-actions.ts).
 */
async function recomputeCotizacionTotales(tx: Prisma.TransactionClient, cotizacionId: string): Promise<void> {
  const cotizacion = await tx.cotizacion.findUniqueOrThrow({
    where: { id: cotizacionId },
    select: { descuentoPct: true, items: { select: { tipo: true, cantidad: true, precioUnitario: true } } },
  });
  const { subtotal, descuento, iva, total } = computeCotizacionTotales({
    items: cotizacion.items.map((item) => ({
      tipo: item.tipo,
      cantidad: Number(item.cantidad),
      precioUnitario: Number(item.precioUnitario),
    })),
    descuentoPct: Number(cotizacion.descuentoPct),
  });
  await tx.cotizacion.update({ where: { id: cotizacionId }, data: { subtotal, descuento, iva, total } });
}

export async function listCotizaciones(estado?: EstadoCotizacion): Promise<CotizacionConDetalle[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  return tenantDb.cotizacion.findMany({
    where: { ...scopeCotizacion(session.user.sedeActivaId), ...(estado ? { estado } : {}) },
    include: COTIZACION_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getCotizacion(id: string): Promise<CotizacionConDetalle | null> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  // findFirst, not findUnique: findUnique cannot carry the sede filter, so an id
  // from another sede would resolve. This is the IDOR boundary.
  return tenantDb.cotizacion.findFirst({
    where: { id, ...scopeCotizacion(session.user.sedeActivaId) },
    include: COTIZACION_DETAIL_INCLUDE,
  });
}

/**
 * Deliberately NOT sede-scoped. Clientes and vehículos are tenant-wide by
 * design: the same customer may bring the same car to any sede of the same
 * taller, so any sede must be able to quote it. Mirrors listVehiculosParaCita
 * (src/app/actions/cita-actions.ts).
 */
export async function listVehiculosParaCotizacion(): Promise<VehiculoOption[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const vehiculos = await tenantDb.vehiculo.findMany({
    select: {
      id: true,
      placa: true,
      marca: true,
      modelo: true,
      cliente: { select: { nombre: true } },
    },
    orderBy: { placa: "asc" },
  });

  return vehiculos.map((vehiculo) => ({
    id: vehiculo.id,
    placa: vehiculo.placa,
    marca: vehiculo.marca,
    modelo: vehiculo.modelo,
    clienteNombre: vehiculo.cliente.nombre,
  }));
}

// clienteId is deliberately never taken from the form -- same rule
// createOrdenDesdeVehiculoAction documents (src/app/actions/orden-actions.ts):
// it is derived from the vehículo so "create a cotización for vehicle X under
// client Y" can't be forged from form data.
export async function crearCotizacionAction(
  prevState: CotizacionFormState,
  formData: FormData,
): Promise<CotizacionFormState> {
  const parsed = crearCotizacionInputSchema.safeParse({
    vehiculoId: formData.get("vehiculoId") ?? "",
    motivo: formData.get("motivo") ?? "",
    validaHasta: formData.get("validaHasta") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, cotizacionId: null };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const vehiculo = await tenantDb.vehiculo.findUnique({
    where: { id: parsed.data.vehiculoId },
    select: { id: true, clienteId: true },
  });
  if (!vehiculo) {
    return { error: "El vehículo seleccionado no existe.", success: false, cotizacionId: null };
  }

  try {
    const cotizacion = await tenantDb.cotizacion.create({
      data: {
        clienteId: vehiculo.clienteId,
        vehiculoId: vehiculo.id,
        sedeId: session.user.sedeActivaId,
        motivo: parsed.data.motivo,
        validaHasta: parsed.data.validaHasta,
        creadoPorId: session.user.id,
      },
    });
    revalidarCotizaciones();
    return { error: null, success: true, cotizacionId: cotizacion.id };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al crear la cotización"), success: false, cotizacionId: null };
  }
}

export async function agregarItemCotizacionAction(
  cotizacionId: string,
  prevState: ItemCotizacionFormState,
  formData: FormData,
): Promise<ItemCotizacionFormState> {
  const parsed = itemCotizacionInputSchema.safeParse({
    tipo: formData.get("tipo"),
    repuestoId: formData.get("repuestoId") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    cantidad: formData.get("cantidad"),
    precioUnitario: formData.get("precioUnitario") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(session.user.sedeActivaId) },
    select: { estado: true },
  });
  if (!cotizacion) {
    return { error: NO_ENCONTRADA, success: false };
  }
  try {
    assertCotizacionMutable(cotizacion);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Cotización no modificable", success: false };
  }

  let descripcion: string;
  if (parsed.data.tipo === "REPUESTO") {
    const repuesto = await tenantDb.repuesto.findFirst({
      where: { id: parsed.data.repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
    });
    if (!repuesto) {
      return { error: "Repuesto no encontrado", success: false };
    }
    descripcion = repuesto.nombre;
  } else {
    descripcion = parsed.data.descripcion as string;
  }

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.itemCotizacion.create({
        data: {
          cotizacionId,
          tipo: parsed.data.tipo,
          repuestoId: parsed.data.tipo === "REPUESTO" ? parsed.data.repuestoId || null : null,
          descripcion,
          cantidad: parsed.data.cantidad,
          precioUnitario: parsed.data.precioUnitario,
        },
      });
      await recomputeCotizacionTotales(tx, cotizacionId);
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar el ítem"), success: false };
  }

  revalidarCotizaciones(cotizacionId);
  return { error: null, success: true };
}

export async function eliminarItemCotizacionAction(id: string, cotizacionId: string): Promise<void> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(session.user.sedeActivaId) },
    select: { estado: true },
  });
  if (!cotizacion) {
    throw new Error(NO_ENCONTRADA);
  }
  assertCotizacionMutable(cotizacion);

  try {
    await tenantDb.$transaction(async (tx) => {
      const { count } = await tx.itemCotizacion.deleteMany({ where: { id, cotizacionId } });
      if (count === 0) {
        throw new Error("Ítem no encontrado en esta cotización");
      }
      await recomputeCotizacionTotales(tx, cotizacionId);
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Ítem no encontrado en esta cotización") {
      throw err;
    }
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el ítem"));
  }
  revalidarCotizaciones(cotizacionId);
}

export async function actualizarDescuentoCotizacionAction(
  cotizacionId: string,
  prevState: DescuentoCotizacionFormState,
  formData: FormData,
): Promise<DescuentoCotizacionFormState> {
  const parsed = descuentoCotizacionInputSchema.safeParse({
    descuentoPct: formData.get("descuentoPct"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(session.user.sedeActivaId) },
    select: { estado: true },
  });
  if (!cotizacion) {
    return { error: NO_ENCONTRADA, success: false };
  }
  try {
    assertCotizacionMutable(cotizacion);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Cotización no modificable", success: false };
  }

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.cotizacion.update({ where: { id: cotizacionId }, data: { descuentoPct: parsed.data.descuentoPct } });
      await recomputeCotizacionTotales(tx, cotizacionId);
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al actualizar el descuento"), success: false };
  }

  revalidarCotizaciones(cotizacionId);
  return { error: null, success: true };
}

export async function enviarCotizacionAction(
  cotizacionId: string,
  prevState: EnviarCotizacionFormState,
  formData: FormData,
): Promise<EnviarCotizacionFormState> {
  const parsed = enviarCotizacionInputSchema.safeParse({
    canal: formData.get("canal"),
    vigenciaDias: formData.get("vigenciaDias"),
    notas: formData.get("notas") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };
  }

  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(session.user.sedeActivaId) },
    include: { items: { select: { id: true } } },
  });
  if (!cotizacion) {
    return { error: NO_ENCONTRADA, success: false };
  }
  if (!isValidEstadoTransition(cotizacion.estado, "ENVIADA")) {
    return { error: `No se puede cambiar de ${cotizacion.estado} a ENVIADA`, success: false };
  }
  if (cotizacion.items.length === 0) {
    return { error: "Agrega al menos un ítem antes de enviar la cotización", success: false };
  }

  const validaHasta = new Date(Date.now() + parsed.data.vigenciaDias * 24 * 60 * 60 * 1000);

  try {
    await tenantDb.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        estado: "ENVIADA",
        validaHasta,
        notas: parsed.data.notas || null,
      },
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al enviar la cotización"), success: false };
  }

  revalidarCotizaciones(cotizacionId);
  return { error: null, success: true };
}

export async function aprobarCotizacionAction(
  cotizacionId: string,
  prevState: AprobarCotizacionFormState,
  formData: FormData,
): Promise<AprobarCotizacionFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(session.user.sedeActivaId) },
    include: { items: true },
  });
  if (!cotizacion) {
    return { error: NO_ENCONTRADA, success: false, ordenId: null };
  }
  if (!isValidEstadoTransition(cotizacion.estado, "APROBADA")) {
    return { error: `No se puede cambiar de ${cotizacion.estado} a APROBADA`, success: false, ordenId: null };
  }

  let ordenId: string;
  try {
    const orden = await tenantDb.$transaction(async (tx) => {
      const creada = await tx.ordenTrabajo.create({
        data: {
          clienteId: cotizacion.clienteId,
          vehiculoId: cotizacion.vehiculoId,
          sedeId: cotizacion.sedeId,
          creadoPorId: session.user.id,
        },
      });

      for (const item of cotizacion.items) {
        if (item.tipo === "REPUESTO") {
          await tx.itemOrden.create({
            data: {
              ordenId: creada.id,
              repuestoId: item.repuestoId,
              descripcion: item.descripcion,
              cantidad: Math.round(Number(item.cantidad)),
              precioUnitario: item.precioUnitario,
            },
          });
        } else {
          await tx.manoDeObra.create({
            data: {
              ordenId: creada.id,
              descripcion: item.descripcion,
              valor: Number(item.cantidad) * Number(item.precioUnitario),
            },
          });
        }
      }

      await tx.cotizacion.update({
        where: { id: cotizacionId },
        data: { estado: "APROBADA", ordenId: creada.id },
      });

      return creada;
    });
    ordenId = orden.id;
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al aprobar la cotización"), success: false, ordenId: null };
  }

  revalidarCotizaciones(cotizacionId);
  revalidatePath("/ordenes");
  return { error: null, success: true, ordenId };
}

export async function rechazarCotizacionAction(
  cotizacionId: string,
  prevState: RechazarCotizacionFormState,
  formData: FormData,
): Promise<RechazarCotizacionFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(session.user.sedeActivaId) },
    select: { estado: true },
  });
  if (!cotizacion) {
    return { error: NO_ENCONTRADA, success: false };
  }
  if (!isValidEstadoTransition(cotizacion.estado, "RECHAZADA")) {
    return { error: `No se puede cambiar de ${cotizacion.estado} a RECHAZADA`, success: false };
  }

  try {
    await tenantDb.cotizacion.update({ where: { id: cotizacionId }, data: { estado: "RECHAZADA" } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al rechazar la cotización"), success: false };
  }

  revalidarCotizaciones(cotizacionId);
  return { error: null, success: true };
}
