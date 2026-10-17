"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { assertCotizacionMutable } from "@/lib/cotizacion/mutable-guard";
import { recomputeCotizacionTotales } from "@/lib/cotizacion/recompute-totales";
import { scopeCotizacion, scopeRepuesto } from "@/lib/sede/scope";
import {
  actualizarItemCotizacionInputSchema,
  itemLibreCotizacionInputSchema,
  type ActualizarItemCotizacionInput,
  type ItemLibreCotizacionInput,
} from "@/lib/validation/cotizacion";

/**
 * Acciones de la tabla editable de la cotización. Se llaman directo desde el
 * cliente (sin FormData) y responden con datos, nunca lanzando: Next oculta los
 * mensajes de error lanzados en producción.
 */
export interface ResultadoItemCotizacion {
  error: string | null;
  itemId: string | null;
  /** true cuando el repuesto ya estaba suelto en la tabla y solo se le sumó 1. */
  fusionado?: boolean;
}

type TenantDb = ReturnType<typeof getTenantDb>;


/** Carga la cotización de la sede activa y comprueba que aún se pueda editar. */
async function cotizacionEditable(
  tenantDb: TenantDb,
  cotizacionId: string,
  sedeActivaId: string,
): Promise<string | null> {
  const cotizacion = await tenantDb.cotizacion.findFirst({
    where: { id: cotizacionId, ...scopeCotizacion(sedeActivaId) },
    select: { estado: true },
  });
  if (!cotizacion) return "Cotización no encontrada";
  try {
    assertCotizacionMutable(cotizacion);
  } catch (err) {
    return err instanceof Error ? err.message : "Cotización no modificable";
  }
  return null;
}

function revalidar(cotizacionId: string): void {
  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${cotizacionId}`);
}

/**
 * Agrega un repuesto del inventario con cantidad 1 y su precio de venta. Si ya
 * está suelto en la tabla le suma 1 en vez de repetir la fila; los repuestos
 * que vienen dentro de un kit no cuentan, el kit se edita aparte.
 */
export async function agregarRepuestoACotizacionAction(
  cotizacionId: string,
  repuestoId: string,
): Promise<ResultadoItemCotizacion> {
  const session = await requirePermiso("cotizaciones.editarItems");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bloqueo = await cotizacionEditable(tenantDb, cotizacionId, session.user.sedeActivaId);
  if (bloqueo) return { error: bloqueo, itemId: null };

  const repuesto = await tenantDb.repuesto.findFirst({
    where: { id: repuestoId, ...scopeRepuesto(session.user.sedeActivaId) },
    select: { id: true, nombre: true, precioVenta: true },
  });
  if (!repuesto) return { error: "Repuesto no encontrado", itemId: null };

  try {
    const resultado = await tenantDb.$transaction(async (tx) => {
      const suelto = await tx.itemCotizacion.findFirst({
        where: { cotizacionId, repuestoId: repuesto.id, grupoKitId: null },
        select: { id: true },
      });
      let resultado: ResultadoItemCotizacion;
      if (suelto) {
        await tx.itemCotizacion.update({ where: { id: suelto.id }, data: { cantidad: { increment: 1 } } });
        resultado = { error: null, itemId: suelto.id, fusionado: true };
      } else {
        const creado = await tx.itemCotizacion.create({
          data: {
            cotizacionId,
            tipo: "REPUESTO",
            repuestoId: repuesto.id,
            descripcion: repuesto.nombre,
            cantidad: 1,
            precioUnitario: repuesto.precioVenta,
          },
          select: { id: true },
        });
        resultado = { error: null, itemId: creado.id, fusionado: false };
      }
      await recomputeCotizacionTotales(tx, cotizacionId);
      return resultado;
    });
    revalidar(cotizacionId);
    return resultado;
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar el repuesto"), itemId: null };
  }
}

/** Agrega un ítem libre (fuera del catálogo) con cantidad 1 y precio 0, listo para ponerle precio. */
export async function agregarItemLibreCotizacionAction(
  cotizacionId: string,
  input: ItemLibreCotizacionInput,
): Promise<ResultadoItemCotizacion> {
  const parsed = itemLibreCotizacionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", itemId: null };

  const session = await requirePermiso("cotizaciones.editarItems");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bloqueo = await cotizacionEditable(tenantDb, cotizacionId, session.user.sedeActivaId);
  if (bloqueo) return { error: bloqueo, itemId: null };

  try {
    const creado = await tenantDb.$transaction(async (tx) => {
      const item = await tx.itemCotizacion.create({
        data: {
          cotizacionId,
          tipo: parsed.data.tipo,
          repuestoId: null,
          descripcion: parsed.data.descripcion,
          cantidad: 1,
          precioUnitario: 0,
        },
        select: { id: true },
      });
      await recomputeCotizacionTotales(tx, cotizacionId);
      return item;
    });
    revalidar(cotizacionId);
    return { error: null, itemId: creado.id };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al agregar el ítem"), itemId: null };
  }
}

/**
 * Guarda una celda editada. Cantidad y precio se editan en cualquier fila;
 * descripción y tipo solo en los ítems libres, porque en los demás vienen del
 * inventario o del kit.
 */
export async function actualizarItemCotizacionAction(
  cotizacionId: string,
  itemId: string,
  cambios: ActualizarItemCotizacionInput,
): Promise<ResultadoItemCotizacion> {
  const parsed = actualizarItemCotizacionInputSchema.safeParse(cambios);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", itemId: null };

  const session = await requirePermiso("cotizaciones.editarItems");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bloqueo = await cotizacionEditable(tenantDb, cotizacionId, session.user.sedeActivaId);
  if (bloqueo) return { error: bloqueo, itemId: null };

  const item = await tenantDb.itemCotizacion.findFirst({
    where: { id: itemId, cotizacionId },
    select: { id: true, repuestoId: true, grupoKitId: true },
  });
  if (!item) return { error: "Ítem no encontrado en esta cotización", itemId: null };

  const esLibre = item.repuestoId === null && item.grupoKitId === null;
  if (!esLibre && (parsed.data.descripcion !== undefined || parsed.data.tipo !== undefined)) {
    return { error: "Solo los ítems libres permiten cambiar la descripción o el tipo", itemId: null };
  }

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.itemCotizacion.update({ where: { id: item.id }, data: parsed.data });
      await recomputeCotizacionTotales(tx, cotizacionId);
    });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al guardar el cambio"), itemId: null };
  }
  revalidar(cotizacionId);
  return { error: null, itemId: item.id };
}

/** Quita todas las líneas de un kit aplicado. */
export async function eliminarGrupoKitCotizacionAction(
  cotizacionId: string,
  grupoKitId: string,
): Promise<ResultadoItemCotizacion> {
  const session = await requirePermiso("cotizaciones.gestionar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const bloqueo = await cotizacionEditable(tenantDb, cotizacionId, session.user.sedeActivaId);
  if (bloqueo) return { error: bloqueo, itemId: null };

  try {
    const borrados = await tenantDb.$transaction(async (tx) => {
      const { count } = await tx.itemCotizacion.deleteMany({ where: { cotizacionId, grupoKitId } });
      if (count > 0) await recomputeCotizacionTotales(tx, cotizacionId);
      return count;
    });
    if (borrados === 0) return { error: "El kit ya no está en esta cotización", itemId: null };
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "Error al quitar el kit"), itemId: null };
  }
  revalidar(cotizacionId);
  return { error: null, itemId: null };
}
