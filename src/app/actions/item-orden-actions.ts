"use server";

import { revalidatePath } from "next/cache";
import { puede, requirePermiso } from "@/lib/auth/guards";
import { getTenantDb } from "@/lib/db/tenant-client";
import { resultadoDeAccion, type ResultadoAccion } from "@/lib/resultado-accion";
import { friendlyPrismaErrorMessage } from "@/lib/db/prisma-error-message";
import { assertOrdenMutable } from "@/lib/orden/mutable-guard";
import { scopeOrdenVisible } from "@/lib/sede/scope";

export async function deleteItemOrdenAction(id: string, ordenId: string): Promise<void> {
  const session = await requirePermiso("ordenes.quitar");
  const tenantDb = getTenantDb(session.user.tenantSchema);

  const orden = await tenantDb.ordenTrabajo.findFirst({
    where: { id: ordenId, ...scopeOrdenVisible(session.user.sedeActivaId, session.user.id, puede(session, "ordenes.verTodas")) },
    select: { estado: true, factura: { select: { id: true } } },
  });
  if (!orden) {
    throw new Error("Orden no encontrada");
  }
  assertOrdenMutable(orden);

  try {
    const { count } = await tenantDb.itemOrden.deleteMany({ where: { id, ordenId } });
    if (count === 0) {
      throw new Error("Ítem no encontrado en esta orden");
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Ítem no encontrado en esta orden") {
      throw err;
    }
    throw new Error(friendlyPrismaErrorMessage(err, "Error al eliminar el ítem"));
  }
  revalidatePath(`/ordenes/${ordenId}`);
}

export async function deleteItemOrdenFormAction(id: string, ordenId: string): Promise<ResultadoAccion> {
  return resultadoDeAccion(() => deleteItemOrdenAction(id, ordenId), "Error al quitar el ítem");
}
