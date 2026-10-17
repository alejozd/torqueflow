"use server";

import { revalidatePath } from "next/cache";
import { puede, requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { roundMoney } from "@/lib/money/round";
import { assertCotizacionMutable } from "@/lib/cotizacion/mutable-guard";
import { recomputeCotizacionTotales } from "@/lib/cotizacion/recompute-totales";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";
import { grupoKitParaServicio } from "@/lib/servicio/grupo-kit";
import { scopeCotizacion, scopeOrdenVisible, scopeRepuesto } from "@/lib/sede/scope";
import {
  CANTIDAD_MAXIMA_KIT,
  aplicarServicioInputSchema,
  listarServiciosInputSchema,
  servicioInputSchema,
  servicioRepuestoInputSchema,
} from "@/lib/validation/servicio";
import type { Prisma } from "@/generated/prisma-tenant";
import { ROLES_MECANICO } from "@/lib/auth/permisos";

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
 * Resuelve el servicio que se va a aplicar: activo, con su kit limitado a los
 * repuestos de la sede activa (D10) y con algo que aportar en esa sede (D11).
 * Compartido por las dos acciones de "aplicar", que solo se diferencian en el
 * documento destino (orden o cotización).
 */
type ServicioAplicable = {
  id: string;
  nombre: string;
  repuestos: { cantidad: number; repuesto: { id: string; nombre: string; precioVenta: Prisma.Decimal } }[];
};

type ResultadoServicioAplicable =
  | { disponible: false; error: string }
  | { disponible: true; servicio: ServicioAplicable; valor: number; conManoDeObra: boolean };

async function cargarServicioAplicable(
  tenantDb: ReturnType<typeof getTenantDb>,
  servicioId: string,
  sedeActivaId: string,
): Promise<ResultadoServicioAplicable> {
  const servicio = await tenantDb.servicio.findFirst({
    where: { id: servicioId },
    select: {
      id: true,
      activo: true,
      nombre: true,
      precioManoObra: true,
      repuestos: {
        where: { repuesto: scopeRepuesto(sedeActivaId) },
        select: { cantidad: true, repuesto: { select: { id: true, nombre: true, precioVenta: true } } },
      },
    },
  });
  if (!servicio || !servicio.activo) return { disponible: false, error: SERVICIO_NO_DISPONIBLE };

  const valor = Number(servicio.precioManoObra);
  const conManoDeObra = valor > 0;
  if (!conManoDeObra && servicio.repuestos.length === 0) return { disponible: false, error: SIN_NADA_QUE_AGREGAR };

  return { disponible: true, servicio, valor, conManoDeObra };
}

/**
 * El mecánico de la orden se hereda en la línea de mano de obra, pero solo si
 * sigue perteneciendo a la sede activa: addManoDeObraAction hace esta misma
 * comprobación sobre el id que llega del formulario, y aquí el id viene de la
 * orden, que pudo asignarse antes de que el técnico saliera de la sede.
 * Si ya no pertenece, la línea se crea sin mecánico en vez de arrastrar uno
 * ajeno a la sede.
 */
async function mecanicoDeLaSede(
  tenantDb: ReturnType<typeof getTenantDb>,
  mecanicoId: string | null,
  sedeActivaId: string,
): Promise<string | null> {
  if (!mecanicoId) return null;
  const tecnico = await tenantDb.usuario.findFirst({
    where: { id: mecanicoId, role: { in: [...ROLES_MECANICO] }, sedes: { some: { sedeId: sedeActivaId } } },
    select: { id: true },
  });
  return tecnico?.id ?? null;
}

/**
 * `soloActivos: true` es la vista de aplicación (la que usan las órdenes y las
 * cotizaciones): devuelve solo activos y solo los repuestos de la sede activa
 * del usuario, para que el total estimado sea el que realmente se va a aplicar
 * (D10). Sin opciones es la vista de catálogo del ADMIN, con el kit completo.
 */
export async function listServicios(opciones: { soloActivos?: boolean } = {}): Promise<ServicioVista[]> {
  // De `soloActivos` depende qué rol se exige, así que se valida en vez de
  // confiar en cualquier valor "truthy" que llegue por la server action.
  const { soloActivos } = listarServiciosInputSchema.parse(opciones);
  const session = await requirePermiso(soloActivos ? "ordenes.ver" : "servicios.gestionar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const filas = await tenantDb.servicio.findMany({
    where: soloActivos ? { activo: true } : {},
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      precioManoObra: true,
      activo: true,
      repuestos: {
        where: soloActivos ? { repuesto: scopeRepuesto(session.user.sedeActivaId) } : {},
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
  const session = await requirePermiso("servicios.gestionar");
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
  const session = await requirePermiso("servicios.gestionar");
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
  const session = await requirePermiso("servicios.gestionar");
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
  const session = await requirePermiso("servicios.gestionar");
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

  // El tope del schema es por operación, así que hay que mirar el acumulado:
  // esta acción suma cuando el repuesto ya está en el kit.
  const existente = await tenantDb.servicioRepuesto.findUnique({
    where: { servicioId_repuestoId: { servicioId, repuestoId: repuesto.id } },
    select: { cantidad: true },
  });
  if ((existente?.cantidad ?? 0) + parsed.data.cantidad > CANTIDAD_MAXIMA_KIT) {
    return {
      error: `El kit no admite más de ${CANTIDAD_MAXIMA_KIT} unidades de un repuesto`,
      success: false,
      cantidad: null,
    };
  }

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
  const session = await requirePermiso("servicios.gestionar");
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
  const session = await requirePermiso("servicios.gestionar");
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
  const session = await requirePermiso("ordenes.trabajar");
  const parsed = aplicarServicioInputSchema.safeParse({ servicioId: formData.get("servicioId") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, agregados: null };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrdenVisible(session.user.sedeActivaId, session.user.id, puede(session, "ordenes.verTodas")) },
    select: { estado: true, factura: { select: { id: true } }, mecanicoId: true },
  });
  if (!orden) return { error: "Orden no encontrada", success: false, agregados: null };
  try {
    assertOrdenMutable(orden);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Orden no modificable", success: false, agregados: null };
  }

  const cargado = await cargarServicioAplicable(tenantDb, parsed.data.servicioId, session.user.sedeActivaId);
  if (!cargado.disponible) {
    return { error: cargado.error, success: false, agregados: null };
  }
  const { servicio, valor, conManoDeObra } = cargado;
  const mecanicoId = conManoDeObra ? await mecanicoDeLaSede(tenantDb, orden.mecanicoId, session.user.sedeActivaId) : null;

  try {
    const grupo = grupoKitParaServicio(servicio);
    await tenantDb.$transaction(async (tx) => {
      if (conManoDeObra) {
        await tx.manoDeObra.create({
          data: { ordenId, descripcion: servicio.nombre, valor, mecanicoId, ...grupo },
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
            ...grupo,
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

/**
 * Misma idea que aplicarServicioAOrdenAction, sobre una cotización: una línea
 * MANO_OBRA (cantidad 1, precio base) y una REPUESTO por repuesto del kit, con
 * las mismas reglas de roles/alcance/estado que agregarItemCotizacionAction.
 *
 * A diferencia de la orden, la cotización guarda sus propios totales, así que la
 * transacción termina recomputándolos: sin eso la fila padre seguiría mostrando
 * el total anterior a las líneas nuevas.
 */
export async function aplicarServicioACotizacionAction(
  cotizacionId: string,
  prevState: AplicarServicioFormState,
  formData: FormData,
): Promise<AplicarServicioFormState> {
  const session = await requirePermiso("cotizaciones.editarItems");
  const parsed = aplicarServicioInputSchema.safeParse({ servicioId: formData.get("servicioId") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false, agregados: null };
  }

  const tenantDb = getTenantDb(session.user.tenantSchema);

  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(session.user.sedeActivaId) },
    select: { estado: true },
  });
  if (!cotizacion) return { error: "Cotización no encontrada", success: false, agregados: null };
  try {
    assertCotizacionMutable(cotizacion);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Cotización no modificable",
      success: false,
      agregados: null,
    };
  }

  const cargado = await cargarServicioAplicable(tenantDb, parsed.data.servicioId, session.user.sedeActivaId);
  if (!cargado.disponible) {
    return { error: cargado.error, success: false, agregados: null };
  }
  const { servicio, valor, conManoDeObra } = cargado;

  try {
    const grupo = grupoKitParaServicio(servicio);
    await tenantDb.$transaction(async (tx) => {
      if (conManoDeObra) {
        await tx.itemCotizacion.create({
          data: {
            cotizacionId,
            tipo: "MANO_OBRA",
            repuestoId: null,
            descripcion: servicio.nombre,
            cantidad: 1,
            precioUnitario: valor,
            ...grupo,
          },
        });
      }
      for (const linea of servicio.repuestos) {
        await tx.itemCotizacion.create({
          data: {
            cotizacionId,
            tipo: "REPUESTO",
            repuestoId: linea.repuesto.id,
            descripcion: linea.repuesto.nombre,
            cantidad: linea.cantidad,
            precioUnitario: linea.repuesto.precioVenta,
            ...grupo,
          },
        });
      }
      await recomputeCotizacionTotales(tx, cotizacionId);
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo aplicar el servicio"), success: false, agregados: null };
  }

  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${cotizacionId}`);
  return {
    error: null,
    success: true,
    agregados: { manoDeObra: conManoDeObra, repuestos: servicio.repuestos.length },
  };
}
