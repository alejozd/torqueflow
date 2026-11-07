"use server";

import { revalidatePath } from "next/cache";
import { requirePermiso, requireSession } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import {
  crearTarifaIvaSchema,
  motivoNoDesactivar,
  motivoNoPredeterminar,
  renombrarTarifaIvaSchema,
  type TarifaIvaVista,
} from "@/lib/iva/tarifas";
import type { ResultadoAccion } from "@/lib/resultado-accion";

const RUTA = "/configuracion-iva";

function aVista(fila: { id: string; porcentaje: unknown; nombre: string; activa: boolean; predeterminada: boolean }): TarifaIvaVista {
  return { id: fila.id, porcentaje: Number(fila.porcentaje), nombre: fila.nombre, activa: fila.activa, predeterminada: fila.predeterminada };
}

/**
 * Todas las tarifas, de menor a mayor. Cualquier usuario con sesión las lee:
 * los selectores de IVA de cotización, orden y mostrador las necesitan.
 */
export async function listTarifasIva(): Promise<TarifaIvaVista[]> {
  const session = await requireSession();
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const filas = await tenantDb.tarifaIva.findMany({ orderBy: { porcentaje: "asc" } });
  return filas.map(aVista);
}

export async function crearTarifaIvaAction(_prev: ResultadoAccion, formData: FormData): Promise<ResultadoAccion> {
  const session = await requirePermiso("configuracion.taller");
  const parsed = crearTarifaIvaSchema.safeParse({
    porcentaje: formData.get("porcentaje") ?? "",
    nombre: formData.get("nombre") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos", success: false };

  const tenantDb = getTenantDb(session.user.tenantSchema);
  const existente = await tenantDb.tarifaIva.findUnique({ where: { porcentaje: parsed.data.porcentaje } });
  if (existente) {
    return {
      error: existente.activa
        ? "Ya existe una tarifa con ese porcentaje."
        : "Ya existe una tarifa con ese porcentaje, desactivada: actívala en la lista.",
      success: false,
    };
  }
  try {
    await tenantDb.tarifaIva.create({ data: { porcentaje: parsed.data.porcentaje, nombre: parsed.data.nombre } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo crear la tarifa"), success: false };
  }
  revalidatePath(RUTA);
  return { error: null, success: true };
}

export async function renombrarTarifaIvaAction(id: string, nombre: string): Promise<ResultadoAccion> {
  const session = await requirePermiso("configuracion.taller");
  const parsed = renombrarTarifaIvaSchema.safeParse({ nombre });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Nombre inválido", success: false };
  const tenantDb = getTenantDb(session.user.tenantSchema);
  try {
    await tenantDb.tarifaIva.update({ where: { id }, data: { nombre: parsed.data.nombre } });
  } catch (err) {
    return { error: friendlyPrismaErrorMessage(err, "No se pudo renombrar la tarifa"), success: false };
  }
  revalidatePath(RUTA);
  return { error: null, success: true };
}

export async function cambiarActivaTarifaIvaAction(id: string, activa: boolean): Promise<ResultadoAccion> {
  const session = await requirePermiso("configuracion.taller");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const tarifa = await tenantDb.tarifaIva.findUnique({ where: { id } });
  if (!tarifa) return { error: "La tarifa no existe.", success: false };
  if (!activa) {
    const motivo = motivoNoDesactivar(tarifa);
    if (motivo) return { error: motivo, success: false };
  }
  await tenantDb.tarifaIva.update({ where: { id }, data: { activa } });
  revalidatePath(RUTA);
  return { error: null, success: true };
}

/** Deja exactamente una predeterminada: quita la marca a las demás en la misma transacción. */
export async function marcarPredeterminadaTarifaIvaAction(id: string): Promise<ResultadoAccion> {
  const session = await requirePermiso("configuracion.taller");
  const tenantDb = getTenantDb(session.user.tenantSchema);
  const tarifa = await tenantDb.tarifaIva.findUnique({ where: { id } });
  if (!tarifa) return { error: "La tarifa no existe.", success: false };
  const motivo = motivoNoPredeterminar(tarifa);
  if (motivo) return { error: motivo, success: false };
  await tenantDb.$transaction([
    tenantDb.tarifaIva.updateMany({ where: { predeterminada: true, NOT: { id } }, data: { predeterminada: false } }),
    tenantDb.tarifaIva.update({ where: { id }, data: { predeterminada: true } }),
  ]);
  revalidatePath(RUTA);
  return { error: null, success: true };
}
