"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { roundMoney } from "@/lib/money/round";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";
import { scopeOrden, scopeRepuesto } from "@/lib/sede/scope";
import {
  aplicarServicioInputSchema,
  servicioInputSchema,
  servicioRepuestoInputSchema,
} from "@/lib/validation/servicio";

export interface ServicioRepuestoVista {
  repuestoId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  precioVenta: number;
}

export interface ServicioVista {
  id: string;
  nombre: string;
  descripcion: string | null;
  precioManoObra: number;
  activo: boolean;
  repuestos: ServicioRepuestoVista[];
  /** Mano de obra + repuestos del kit a precio de venta actual. */
  totalEstimado: number;
}

export interface ServicioFormState {
  error: string | null;
  success: boolean;
}

export interface ServicioRepuestoFormState {
  error: string | null;
  success: boolean;
  /** Cantidad resultante en el kit (para el toast); null si hubo error. */
  cantidad: number | null;
}

export interface AplicarServicioFormState {
  error: string | null;
  success: boolean;
  /** Qué se creó realmente; null si hubo error. */
  agregados: { manoDeObra: boolean; repuestos: number } | null;
}

const MENSAJE_DUPLICADO = "Ya existe un servicio con ese nombre";
const SERVICIO_NO_ENCONTRADO = "Servicio no encontrado";
const SERVICIO_NO_DISPONIBLE = "El servicio no está disponible";
const SIN_NADA_QUE_AGREGAR = "El servicio no tiene nada que agregar";
const REPUESTO_NO_ENCONTRADO = "Repuesto no encontrado en tu sede activa";
const REPUESTO_FUERA_DEL_KIT = "El repuesto no está en el kit de este servicio";

function mensajeError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "P2002") {
    return MENSAJE_DUPLICADO;
  }
  return friendlyPrismaErrorMessage(err, fallback);
}

async function existeNombre(tenantDb: ReturnType<typeof getTenantDb>, nombre: string, excluirId?: string) {
  const otro = await tenantDb.servicio.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, ...(excluirId ? { NOT: { id: excluirId } } : {}) },
    select: { id: true },
  });
  return otro !== null;
}

function revalidar() {
  revalidatePath("/servicios");
}

/**
 * `soloActivos: true` es la vista de aplicación (la que usan las órdenes y las
 * cotizaciones): devuelve solo activos y solo los repuestos de la sede activa
 * del usuario, para que el total estimado sea el que realmente se va a aplicar
 * (D10). Sin opciones es la vista de catálogo del ADMIN, con el kit completo.
 */
export async function listServicios(opciones: { soloActivos?: boolean } = {}): Promise<ServicioVista[]> {
  const session = await requireRole(opciones.soloActivos ? ["ADMIN", "RECEPCION", "TECNICO"] : ["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const filas = await tenantDb.servicio.findMany({
    where: opciones.soloActivos ? { activo: true } : {},
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      precioManoObra: true,
      activo: true,
      repuestos: {
        where: opciones.soloActivos ? { repuesto: scopeRepuesto(session.user.sedeActivaId) } : {},
        orderBy: { repuesto: { nombre: "asc" } },
        select: {
          repuestoId: true,
          cantidad: true,
          repuesto: { select: { codigo: true, nombre: true, precioVenta: true } },
        },
      },
    },
  });

  return filas.map((fila) => {
    const precioManoObra = Number(fila.precioManoObra);
    const repuestos: ServicioRepuestoVista[] = fila.repuestos.map((linea) => ({
      repuestoId: linea.repuestoId,
      codigo: linea.repuesto.codigo,
      nombre: linea.repuesto.nombre,
      cantidad: linea.cantidad,
      precioVenta: Number(linea.repuesto.precioVenta),
    }));
    return {
      id: fila.id,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      precioManoObra,
      activo: fila.activo,
      repuestos,
      totalEstimado: roundMoney(
        precioManoObra + repuestos.reduce((suma, repuesto) => suma + repuesto.cantidad * repuesto.precioVenta, 0),
      ),
    };
  });
}

export async function crearServicioAction(
  prevState: ServicioFormState,
  formData: FormData,
): Promise<ServicioFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = servicioInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    precioManoObra: formData.get("precioManoObra"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    if (await existeNombre(tenantDb, parsed.data.nombre)) return { error: MENSAJE_DUPLICADO, success: false };
    await tenantDb.servicio.create({
      data: {
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion,
        precioManoObra: parsed.data.precioManoObra,
      },
    });
  } catch (err) {
    return { error: mensajeError(err, "No se pudo crear el servicio"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function actualizarServicioAction(
  servicioId: string,
  prevState: ServicioFormState,
  formData: FormData,
): Promise<ServicioFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = servicioInputSchema.safeParse({
    nombre: formData.get("nombre") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    precioManoObra: formData.get("precioManoObra"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    if (await existeNombre(tenantDb, parsed.data.nombre, servicioId)) return { error: MENSAJE_DUPLICADO, success: false };
    await tenantDb.servicio.update({
      where: { id: servicioId },
      data: {
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion,
        precioManoObra: parsed.data.precioManoObra,
      },
    });
  } catch (err) {
    return { error: mensajeError(err, "No se pudo actualizar el servicio"), success: false };
  }
  revalidar();
  return { error: null, success: true };
}

export async function toggleServicioActivoAction(servicioId: string): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const servicio = await tenantDb.servicio.findUnique({ where: { id: servicioId }, select: { activo: true } });
  if (!servicio) return { error: SERVICIO_NO_ENCONTRADO };

  try {
    await tenantDb.servicio.update({ where: { id: servicioId }, data: { activo: !servicio.activo } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo actualizar el servicio") };
  }
  revalidar();
  return { error: null };
}

/**
 * Suma cantidad si el repuesto ya está en el kit (upsert), en vez de fallar por
 * la clave única. El repuesto debe pertenecer a la sede activa: así un kit no
 * puede mezclar repuestos de bodegas de otra sede (D10).
 */
export async function agregarRepuestoAServicioAction(
  servicioId: string,
  prevState: ServicioRepuestoFormState,
  formData: FormData,
): Promise<ServicioRepuestoFormState> {
  const session = await requireRole(["ADMIN"]);
  const parsed = servicioRepuestoInputSchema.safeParse({
    repuestoId: formData.get("repuestoId") ?? "",
    cantidad: formData.get("cantidad"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, cantidad: null };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  const servicio = await tenantDb.servicio.findUnique({ where: { id: servicioId }, select: { id: true } });
  if (!servicio) return { error: SERVICIO_NO_ENCONTRADO, success: false, cantidad: null };

  const repuesto = await tenantDb.repuesto.findFirst({
    where: { id: parsed.data.repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
    select: { id: true },
  });
  if (!repuesto) return { error: REPUESTO_NO_ENCONTRADO, success: false, cantidad: null };

  try {
    const linea = await tenantDb.servicioRepuesto.upsert({
      where: { servicioId_repuestoId: { servicioId, repuestoId: repuesto.id } },
      create: { servicioId, repuestoId: repuesto.id, cantidad: parsed.data.cantidad },
      update: { cantidad: { increment: parsed.data.cantidad } },
      select: { cantidad: true },
    });
    revalidar();
    return { error: null, success: true, cantidad: linea.cantidad };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo agregar el repuesto al kit"), success: false, cantidad: null };
  }
}

export async function actualizarCantidadRepuestoServicioAction(
  servicioId: string,
  repuestoId: string,
  cantidad: number,
): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const parsed = servicioRepuestoInputSchema.safeParse({ repuestoId, cantidad });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    const { count } = await tenantDb.servicioRepuesto.updateMany({
      where: { servicioId, repuestoId: parsed.data.repuestoId },
      data: { cantidad: parsed.data.cantidad },
    });
    if (count === 0) return { error: REPUESTO_FUERA_DEL_KIT };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo actualizar la cantidad") };
  }
  revalidar();
  return { error: null };
}

export async function quitarRepuestoDeServicioAction(
  servicioId: string,
  repuestoId: string,
): Promise<{ error: string | null }> {
  const session = await requireRole(["ADMIN"]);
  const tenantDb = getTenantDb(session.user.tenantSchema);

  try {
    const { count } = await tenantDb.servicioRepuesto.deleteMany({ where: { servicioId, repuestoId } });
    if (count === 0) return { error: REPUESTO_FUERA_DEL_KIT };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo quitar el repuesto del kit") };
  }
  revalidar();
  return { error: null };
}

/**
 * Aplica un servicio del catálogo a una orden: una línea de mano de obra con el
 * precio base (solo si es mayor que 0) y una línea de repuesto por cada repuesto
 * del kit, al precio de venta *actual* del repuesto. Todo en una transacción, con
 * las mismas validaciones que addItemOrdenAction (roles, sede, orden mutable).
 *
 * El kit se resuelve contra la sede activa (D10): un servicio armado en otra sede
 * no puede meter repuestos ajenos en esta orden. Si no aporta nada en esta sede
 * -- precio 0 y ningún repuesto -- se rechaza en vez de fingir un éxito vacío (D11).
 */
export async function aplicarServicioAOrdenAction(
  ordenId: string,
  prevState: AplicarServicioFormState,
  formData: FormData,
): Promise<AplicarServicioFormState> {
  const session = await requireRole(["ADMIN", "RECEPCION", "TECNICO"]);
  const parsed = aplicarServicioInputSchema.safeParse({ servicioId: formData.get("servicioId") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, agregados: null };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrden(session.user.sedeActivaId) },
    select: { estado: true, factura: { select: { id: true } }, mecanicoId: true },
  });
  if (!orden) return { error: "Orden no encontrada", success: false, agregados: null };
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false, agregados: null };
  }

  const servicio = await tenantDb.servicio.findFirst({
    where: { id: parsed.data.servicioId },
    select: {
      activo: true,
      nombre: true,
      precioManoObra: true,
      repuestos: {
        where: { repuesto: scopeRepuesto(session.user.sedeActivaId) },
        select: { cantidad: true, repuesto: { select: { id: true, nombre: true, precioVenta: true } } },
      },
    },
  });
  if (!servicio || !servicio.activo) {
    return { error: SERVICIO_NO_DISPONIBLE, success: false, agregados: null };
  }

  const valor = Number(servicio.precioManoObra);
  const conManoDeObra = valor > 0;
  if (!conManoDeObra && servicio.repuestos.length === 0) {
    return { error: SIN_NADA_QUE_AGREGAR, success: false, agregados: null };
  }

  try {
    await tenantDb.$transaction(async (tx) => {
      if (conManoDeObra) {
        await tx.manoDeObra.create({
          data: { ordenId, descripcion: servicio.nombre, valor, mecanicoId: orden.mecanicoId },
        });
      }
      for (const linea of servicio.repuestos) {
        await tx.itemOrden.create({
          data: {
            ordenId,
            repuestoId: linea.repuesto.id,
            descripcion: linea.repuesto.nombre,
            cantidad: linea.cantidad,
            precioUnitario: linea.repuesto.precioVenta,
          },
        });
      }
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo aplicar el servicio"), success: false, agregados: null };
  }

  revalidatePath(`/ordenes/${ordenId}`);
  return {
    error: null,
    success: true,
    agregados: { manoDeObra: conManoDeObra, repuestos: servicio.repuestos.length },
  };
}
